"""
voice_ws.py — Low-latency Streaming Voice WebSocket Backend

Architecture:
    Client audio chunks (binary/WebSocket)
    → faster-whisper (streaming STT)
    → Streaming LLM (OpenRouter / Ollama / Gemini)
    → Intelligent Sentence Chunker
    → Incremental edge-tts Queue
    → Binary audio chunks → Client

Message Protocol:
    Client → Server (JSON):  {"type": "config", "provider": "...", "model": "...", "apiKey": "...", "voice": "..."}
    Client → Server (JSON):  {"type": "end_of_speech"}   ← VAD triggered
    Client → Server (JSON):  {"type": "cancel"}           ← abort current generation
    Client → Server (binary): raw PCM 16kHz 16-bit mono audio chunks

    Server → Client (JSON):  {"type": "transcript",  "text": "...", "is_final": false}
    Server → Client (JSON):  {"type": "llm_token",   "token": "..."}
    Server → Client (JSON):  {"type": "audio_end"}   ← all chunks delivered
    Server → Client (JSON):  {"type": "ready"}        ← ready for next turn
    Server → Client (JSON):  {"type": "error",        "message": "..."}
    Server → Client (binary): mp3/wav audio chunk
"""

import os
import io
import json
import asyncio
import logging
import struct
import numpy as np
import requests
import gc
from typing import AsyncGenerator, Optional, List
from fastapi import WebSocket, WebSocketDisconnect

log = logging.getLogger(__name__)

def is_online() -> bool:
    """Check if the backend is connected to the internet by resolving/connecting to Google DNS."""
    import socket
    try:
        # 8.8.8.8 is Google Public DNS, port 53 is DNS
        socket.setdefaulttimeout(1.5)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect(("8.8.8.8", 53))
        return True
    except OSError:
        return False

# ─── Constants ────────────────────────────────────────────────────────────────

SAMPLE_RATE        = 16000   # Hz — faster-whisper native
CHUNK_MS           = 50      # ms per audio chunk from client
SILENCE_THRESHOLD  = 200     # RMS amplitude below which is "silence"
SILENCE_DURATION   = 0.30    # seconds of silence before VAD triggers end
MIN_SPEECH_SEC     = 0.4     # minimum speech length to bother transcribing

# Sentence chunking
MIN_CHUNK_CHARS    = 40      # minimum chars before considering a flush
MAX_CHUNK_CHARS    = 160     # force-flush at this length
SENTENCE_ENDINGS   = frozenset("。!?.…")

# System prompt for voice mode
VOICE_SYSTEM_PROMPT = (
    "You are Afs AI, a friendly and concise voice assistant. "
    "Keep your responses SHORT and CONVERSATIONAL — 1 to 3 sentences max unless explicitly asked for more. "
    "Do NOT use markdown, bullet points, headers, or code blocks. "
    "Speak naturally as if in a phone call. Avoid symbols like *, #, or backticks."
)

# ─── Whisper Singleton ────────────────────────────────────────────────────────

_whisper_model = None

def get_whisper():
    """Lazy-load faster-whisper model once, reuse across calls."""
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            log.info("[Voice] Loading faster-whisper tiny.en model…")
            _whisper_model = WhisperModel(
                "tiny.en",
                device="cpu",
                compute_type="int8",
                num_workers=1,
                cpu_threads=max(2, os.cpu_count() // 2),
            )
            log.info("[Voice] faster-whisper ready.")
        except ImportError:
            log.warning("[Voice] faster-whisper not installed. STT will be unavailable.")
    return _whisper_model


# ─── Sentence Chunker ─────────────────────────────────────────────────────────

class SentenceChunker:
    """
    Accumulates LLM tokens and yields natural sentence chunks
    sized for low-latency TTS (50–160 chars each).
    """

    def __init__(self):
        self._buf = ""

    def feed(self, token: str) -> Optional[str]:
        """Feed a token; returns a chunk if a sentence boundary is detected."""
        self._buf += token
        return self._try_flush()

    def flush(self) -> Optional[str]:
        """Force-flush remaining buffer."""
        chunk = self._buf.strip()
        self._buf = ""
        return chunk if chunk else None

    def _try_flush(self) -> Optional[str]:
        buf = self._buf

        # Force-flush on max length at a word boundary
        if len(buf) >= MAX_CHUNK_CHARS:
            cut = self._find_word_boundary(buf, MAX_CHUNK_CHARS)
            chunk = buf[:cut].strip()
            self._buf = buf[cut:].lstrip()
            return chunk if chunk else None

        # Flush at sentence endings when we have enough content
        if len(buf) >= MIN_CHUNK_CHARS:
            for i in range(len(buf) - 1, -1, -1):
                if buf[i] in SENTENCE_ENDINGS:
                    # Make sure we're not mid-abbreviation (e.g. "Mr.", "Dr.")
                    chunk = buf[:i + 1].strip()
                    self._buf = buf[i + 1:].lstrip()
                    return chunk if chunk else None

        return None

    def _find_word_boundary(self, text: str, target: int) -> int:
        """Find a good word boundary near target index."""
        # Search backwards from target for a space
        for i in range(target, max(MIN_CHUNK_CHARS, target - 30), -1):
            if i < len(text) and text[i] == " ":
                return i + 1
        return target


# ─── STT ─────────────────────────────────────────────────────────────────────

async def transcribe_audio(pcm_bytes: bytes) -> str:
    """Run faster-whisper transcription in a thread pool."""
    model = get_whisper()
    if model is None:
        return ""

    loop = asyncio.get_event_loop()

    def _run():
        # Convert raw PCM int16 → float32 normalized
        samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        segments, _ = model.transcribe(
            samples,
            language="en",
            beam_size=1,
            best_of=1,
            temperature=0.0,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 200},
        )
        return " ".join(seg.text for seg in segments).strip()

    return await loop.run_in_executor(None, _run)


# ─── LLM Streaming ───────────────────────────────────────────────────────────

async def stream_llm(
    messages: List[dict],
    provider: str,
    model: str,
    api_key: str,
    freeTier: bool = False,
) -> AsyncGenerator[str, None]:
    """
    Stream LLM tokens asynchronously.
    Supports: OpenRouter, Ollama, Gemini, OpenAI, Anthropic.
    """
    provider = (provider or "ollama").lower()

    # Free-tier: round-robin across Gemini / Groq with backend env keys
    if freeTier:
        from server import resolve_free_tier_provider as _rr
        provider, model, api_key = _rr(provider, model, api_key)
    online_status = await asyncio.to_thread(is_online)

    if not online_status:
        if provider == "ollama":
            import httpx
            ollama_running = False
            try:
                async with httpx.AsyncClient(timeout=1) as client:
                    res = await client.get("http://localhost:11434/api/tags")
                    if res.status_code == 200:
                        ollama_running = True
            except Exception:
                pass

            if ollama_running:
                async for token in _stream_ollama(model or "gemma2:2b", messages):
                    yield token
            else:
                yield "[Offline Mode: Local Ollama is not running. Please start Ollama to enable local offline voice chat.]"
        else:
            yield f"[Offline Mode: You are offline, so cloud provider '{provider.capitalize()}' is unavailable. Please check your internet connection or switch to local Ollama in settings.]"
        return

    if provider == "openrouter":
        key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        if not key:
            yield "[OpenRouter API key missing]"
            return
        async for token in _stream_openai_compatible(
            url="https://openrouter.ai/api/v1/chat/completions",
            model=model or "google/gemini-2.5-flash",
            messages=messages,
            api_key=key,
            extra_headers={
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "AfsGPT",
            },
        ):
            yield token

    elif provider == "openai":
        key = api_key or os.environ.get("OPENAI_API_KEY", "")
        async for token in _stream_openai_compatible(
            url="https://api.openai.com/v1/chat/completions",
            model=model or "gpt-4o-mini",
            messages=messages,
            api_key=key,
        ):
            yield token

    elif provider == "gemini":
        key = api_key or os.environ.get("GOOGLE_API_KEY", "")
        async for token in _stream_gemini(key, model, messages):
            yield token

    elif provider == "anthropic":
        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        async for token in _stream_anthropic(key, model, messages):
            yield token

    elif provider == "groq":
        key = api_key or os.environ.get("GROQ_API_KEY", "")
        if not key:
            yield "[Groq API key missing]"
            return
        async for token in _stream_openai_compatible(
            url="https://api.groq.com/openai/v1/chat/completions",
            model=model or "llama3-70b-8192",
            messages=messages,
            api_key=key,
        ):
            yield token

    else:
        # Ollama (local)
        import httpx
        ollama_running = False
        try:
            async with httpx.AsyncClient(timeout=1) as client:
                res = await client.get("http://localhost:11434/api/tags")
                if res.status_code == 200:
                    ollama_running = True
        except Exception:
            pass

        if ollama_running:
            async for token in _stream_ollama(model or "gemma2:2b", messages):
                yield token
        else:
            fallback_key = os.environ.get("OPENROUTER_API_KEY")
            if fallback_key:
                async for token in _stream_openai_compatible(
                    url="https://openrouter.ai/api/v1/chat/completions",
                    model="google/gemini-2.5-flash",
                    messages=messages,
                    api_key=fallback_key,
                    extra_headers={
                        "HTTP-Referer": "http://localhost:3000",
                        "X-Title": "AfsGPT",
                    },
                ):
                    yield token
            elif os.environ.get("GOOGLE_API_KEY"):
                async for token in _stream_gemini(os.environ.get("GOOGLE_API_KEY"), "gemini-2.5-flash", messages):
                    yield token
            else:
                yield "[Ollama is not running, and no cloud fallback is configured]"


async def _stream_openai_compatible(
    url: str, model: str, messages: List[dict], api_key: str,
    extra_headers: dict = None
) -> AsyncGenerator[str, None]:
    """Stream tokens from any OpenAI-compatible API."""
    import httpx

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "max_tokens": 300,
        "temperature": 0.7,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                yield f"[API Error {resp.status_code}: {body.decode()[:200]}]"
                return
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    delta = chunk["choices"][0].get("delta", {})
                    text = delta.get("content", "")
                    if text:
                        yield text
                except (json.JSONDecodeError, KeyError, IndexError):
                    pass


async def _stream_gemini(
    api_key: str, model: str, messages: List[dict]
) -> AsyncGenerator[str, None]:
    import httpx

    model = model or "gemini-2.5-flash"
    # Convert messages to Gemini format
    system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
    contents = [
        {
            "role": "model" if m["role"] == "assistant" else "user",
            "parts": [{"text": m["content"]}],
        }
        for m in messages
        if m["role"] != "system"
    ]
    payload = {"contents": contents}
    if system_msg:
        payload["systemInstruction"] = {"parts": [{"text": system_msg}]}
    payload["generationConfig"] = {"maxOutputTokens": 300, "temperature": 0.7}

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={api_key}"

    async with httpx.AsyncClient(timeout=30) as client:
        async with client.stream("POST", url, json=payload) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                yield f"[Gemini Error: {body.decode()[:200]}]"
                return
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data:
                    continue
                try:
                    chunk = json.loads(data)
                    text = chunk["candidates"][0]["content"]["parts"][0].get("text", "")
                    if text:
                        yield text
                except (json.JSONDecodeError, KeyError, IndexError):
                    pass


async def _stream_anthropic(
    api_key: str, model: str, messages: List[dict]
) -> AsyncGenerator[str, None]:
    import httpx

    model = model or "claude-3-5-sonnet-20240620"
    system_msg = next((m["content"] for m in messages if m["role"] == "system"), VOICE_SYSTEM_PROMPT)
    user_messages = [m for m in messages if m["role"] != "system"]

    payload = {
        "model": model,
        "max_tokens": 300,
        "system": system_msg,
        "messages": user_messages,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        async with client.stream(
            "POST", "https://api.anthropic.com/v1/messages",
            json=payload,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        ) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                yield f"[Anthropic Error: {body.decode()[:200]}]"
                return
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                try:
                    evt = json.loads(data)
                    if evt.get("type") == "content_block_delta":
                        text = evt["delta"].get("text", "")
                        if text:
                            yield text
                except (json.JSONDecodeError, KeyError):
                    pass


async def _stream_ollama(model: str, messages: List[dict]) -> AsyncGenerator[str, None]:
    import httpx

    payload = {"model": model, "messages": messages, "stream": True}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            async with client.stream("POST", "http://localhost:11434/api/chat", json=payload) as resp:
                if resp.status_code != 200:
                    yield "[Ollama unavailable]"
                    return
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                        text = chunk.get("message", {}).get("content", "")
                        if text:
                            yield text
                    except (json.JSONDecodeError, KeyError):
                        pass
    except Exception:
        yield "[Ollama unavailable]"


# ─── TTS Helper ───────────────────────────────────────────────────────────────

def clean_text_for_tts(text: str) -> str:
    """Removes emojis, markdown, and special characters for cleaner speech."""
    import re
    # Remove markdown links [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Remove code blocks
    text = re.sub(r'```[\s\S]*?```', '', text)
    # Remove emojis and special symbols
    text = text.encode('ascii', 'ignore').decode('ascii')
    # Remove markdown formatting
    text = text.replace("*", "").replace("#", "").replace("`", "").replace("_", "")
    # Clean up whitespace
    return " ".join(text.split()).strip()

async def synthesize_chunk(text: str, voice: str = "en-US-AvaNeural") -> Optional[bytes]:
    """Convert a text chunk to MP3 bytes using edge-tts."""
    cleaned = clean_text_for_tts(text)
    if not cleaned:
        return None
    try:
        import edge_tts

        communicate = edge_tts.Communicate(cleaned, voice)
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        audio_bytes = buf.getvalue()
        return audio_bytes if audio_bytes else None
    except Exception as e:
        log.warning(f"[Voice] TTS error for chunk '{cleaned[:40]}': {e}")
        return None


# ─── Client Energy VAD (helper) ───────────────────────────────────────────────

def compute_rms(pcm_bytes: bytes) -> float:
    """RMS energy of a raw int16 PCM buffer."""
    if not pcm_bytes:
        return 0.0
    samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
    return float(np.sqrt(np.mean(samples ** 2)))


# ─── WebSocket Handler ────────────────────────────────────────────────────────

async def voice_websocket_handler(websocket: WebSocket):
    """
    Main WebSocket handler for the low-latency voice pipeline.

    Runs three concurrent tasks:
      1. audio_receiver  — collects audio chunks, runs VAD, triggers STT
      2. llm_streamer    — streams LLM tokens, feeds sentence chunker
      3. tts_sender      — converts sentence chunks → audio, sends to client
    """
    await websocket.accept()
    log.info("[Voice] WebSocket connected.")

    # Session config (set on first "config" message)
    config = {
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "apiKey": os.environ.get("GEMINI_API_KEY", ""),
        "voice": "en-US-AvaNeural",
    }

    # Conversation history for multi-turn context
    history: List[dict] = [{"role": "system", "content": VOICE_SYSTEM_PROMPT}]

    # Queues for the pipeline stages
    transcript_queue: asyncio.Queue = asyncio.Queue()  # (transcript_str,)
    sentence_queue: asyncio.Queue   = asyncio.Queue()  # (sentence_str,)
    audio_queue: asyncio.Queue      = asyncio.Queue()  # (bytes,) or None sentinel

    # Audio accumulation
    pcm_buffer: List[bytes] = []
    silence_frames: int = 0
    speaking_frames: int = 0
    frames_per_vad = max(1, int(SAMPLE_RATE * 0.02 / 512))  # approx frames per 20ms

    cancel_event = asyncio.Event()

    # ── Task 1: Receive audio + VAD + STT ────────────────────────────────────

    async def audio_receiver():
        nonlocal pcm_buffer, silence_frames, speaking_frames

        try:
            while True:
                data = await websocket.receive()

                if "text" in data:
                    # Control message
                    try:
                        msg = json.loads(data["text"])
                        msg_type = msg.get("type", "")

                        if msg_type == "config":
                            config.update({k: v for k, v in msg.items() if k != "type"})
                            # Ensure env fallback
                            if not config.get("apiKey"):
                                env_key = f"{config['provider'].upper()}_API_KEY"
                                config["apiKey"] = os.environ.get(env_key, "")
                            await websocket.send_text(json.dumps({"type": "ready"}))
                            log.info(f"[Voice] Config: provider={config['provider']} model={config['model']}")

                        elif msg_type == "end_of_speech":
                            # Client-side VAD triggered — process buffer now
                            if pcm_buffer:
                                combined = b"".join(pcm_buffer)
                                pcm_buffer.clear()
                                silence_frames = 0
                                speaking_frames = 0
                                if len(combined) > SAMPLE_RATE * MIN_SPEECH_SEC * 2:
                                    await _trigger_stt(combined)

                        elif msg_type == "cancel":
                            cancel_event.set()
                            pcm_buffer.clear()
                            await websocket.send_text(json.dumps({"type": "ready"}))

                    except json.JSONDecodeError:
                        pass

                elif "bytes" in data:
                    chunk = data["bytes"]
                    rms = compute_rms(chunk)

                    if rms > SILENCE_THRESHOLD:
                        silence_frames = 0
                        speaking_frames += 1
                        pcm_buffer.append(chunk)
                    else:
                        if pcm_buffer:
                            silence_frames += 1
                            pcm_buffer.append(chunk)  # keep trailing silence for natural endings

                            # Server-side VAD: silence threshold met
                            chunks_for_silence = int(SILENCE_DURATION * 1000 / CHUNK_MS)
                            if silence_frames >= chunks_for_silence:
                                combined = b"".join(pcm_buffer)
                                pcm_buffer.clear()
                                silence_frames = 0
                                min_samples = int(SAMPLE_RATE * MIN_SPEECH_SEC) * 2
                                if len(combined) > min_samples:
                                    await _trigger_stt(combined)
                                speaking_frames = 0

        except WebSocketDisconnect:
            log.info("[Voice] Client disconnected.")
        except Exception as e:
            log.error(f"[Voice] audio_receiver error: {e}")

    async def _trigger_stt(pcm_data: bytes):
        """Run STT and put result in transcript_queue."""
        cancel_event.clear()
        try:
            await websocket.send_text(json.dumps({"type": "transcript", "text": "…", "is_final": False}))
            text = await transcribe_audio(pcm_data)
            if text:
                await websocket.send_text(json.dumps({"type": "transcript", "text": text, "is_final": True}))
                await transcript_queue.put(text)
        except Exception as e:
            log.error(f"[Voice] STT trigger error: {e}")
        finally:
            gc.collect()

    # ── Task 2: LLM Streaming → Sentence Chunker ─────────────────────────────

    async def llm_streamer():
        while True:
            try:
                transcript = await transcript_queue.get()
                cancel_event.clear()

                # Add to history
                history.append({"role": "user", "content": transcript})
                # Keep history bounded (last 8 turns + system prompt)
                if len(history) > 17:
                    history[1:3] = []

                chunker = SentenceChunker()
                full_response = ""

                async for token in stream_llm(
                    messages=history,
                    provider=config["provider"],
                    model=config["model"],
                    api_key=config.get("apiKey", ""),
                    freeTier=config.get("freeTier", False),
                ):
                    if cancel_event.is_set():
                        break

                    full_response += token

                    # Send token to frontend for display
                    try:
                        await websocket.send_text(json.dumps({"type": "llm_token", "token": token}))
                    except Exception:
                        break

                    # Feed to sentence chunker
                    chunk = chunker.feed(token)
                    if chunk:
                        await sentence_queue.put(chunk)

                # Flush remaining buffer
                if not cancel_event.is_set():
                    leftover = chunker.flush()
                    if leftover:
                        await sentence_queue.put(leftover)

                # Signal end of this turn's sentences
                await sentence_queue.put(None)  # sentinel

                # Store AI response in history
                if full_response:
                    history.append({"role": "assistant", "content": full_response})

            except asyncio.CancelledError:
                break
            except Exception as e:
                log.error(f"[Voice] llm_streamer error: {e}")
                await sentence_queue.put(None)

    # ── Task 3: TTS Queue → Audio Sender ─────────────────────────────────────

    async def tts_sender():
        """
        Processes sentence_queue → synthesizes TTS → sends audio binary chunks.
        Uses a producer/consumer pattern with a bounded audio buffer.
        """
        while True:
            try:
                # Collect all pending sentences for this turn
                pending_sentences = []
                sentinel_received = False

                while not sentinel_received:
                    sentence = await sentence_queue.get()
                    if sentence is None:
                        sentinel_received = True
                    else:
                        cleaned = clean_text_for_tts(sentence)
                        if cleaned:
                            pending_sentences.append(cleaned)

                if not pending_sentences:
                    await websocket.send_text(json.dumps({"type": "ready"}))
                    continue

                # Process sentences: TTS runs for current, next is pre-generated concurrently
                async def synthesize_and_send(text: str):
                    if cancel_event.is_set():
                        return
                    audio_data = await synthesize_chunk(text, config.get("voice", "en-US-AvaNeural"))
                    if audio_data and not cancel_event.is_set():
                        await audio_queue.put(audio_data)

                # Queue all TTS tasks, but don't await serially — pipeline them
                tts_tasks = [asyncio.create_task(synthesize_and_send(s)) for s in pending_sentences]

                # Audio sender: drain audio_queue as chunks arrive
                chunks_expected = len(pending_sentences)
                chunks_sent = 0

                while chunks_sent < chunks_expected:
                    try:
                        audio_data = await asyncio.wait_for(audio_queue.get(), timeout=10.0)
                        if not cancel_event.is_set():
                            await websocket.send_bytes(audio_data)
                        chunks_sent += 1
                    except asyncio.TimeoutError:
                        log.warning("[Voice] TTS audio_queue timeout")
                        break

                # Wait for any remaining TTS tasks
                await asyncio.gather(*tts_tasks, return_exceptions=True)

                if not cancel_event.is_set():
                    await websocket.send_text(json.dumps({"type": "audio_end"}))
                    await websocket.send_text(json.dumps({"type": "ready"}))

            except asyncio.CancelledError:
                break
            except Exception as e:
                log.error(f"[Voice] tts_sender error: {e}")
                try:
                    await websocket.send_text(json.dumps({"type": "ready"}))
                except Exception:
                    pass

    # ── Run all tasks concurrently ────────────────────────────────────────────

    # Pre-warm Whisper in background
    asyncio.create_task(asyncio.to_thread(get_whisper))

    tasks = [
        asyncio.create_task(audio_receiver()),
        asyncio.create_task(llm_streamer()),
        asyncio.create_task(tts_sender()),
    ]

    try:
        # audio_receiver drives the whole session; when it finishes (disconnect), cancel rest
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
    except Exception as e:
        log.error(f"[Voice] Session error: {e}")
    finally:
        log.info("[Voice] WebSocket session ended.")
        gc.collect()
