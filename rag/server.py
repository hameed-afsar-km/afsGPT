"""
server.py — FastAPI backend for the RAG & Image Generation system.

Endpoints:
  POST /upload              — Accept a file, ingest it into ChromaDB, return session_id
  POST /query               — Answer a question using the stored collection
  DELETE /clear             — Wipe a collection (start fresh)
  POST /api/generate-image  — Generate an image via FLUX.1-dev (Qwen-enhanced prompt)
  GET  /static/images/*     — Serve generated images
"""

import os
import sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env")) # Load from root
load_dotenv() # Fallback to local .env
import uuid
import shutil
import base64
import logging
import re
import requests
import asyncio
import io
import edge_tts
try:
    import ollama
except ImportError:
    ollama = None
import google.generativeai as genai
from typing import List, Optional, Dict
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, Request
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# For Document Thumbnails
try:
    import fitz 
except ImportError:
    fitz = None

# New Google GenAI SDK for Direct PDF Analysis
try:
    from google import genai as new_genai
    from google.genai import types as genai_types
except ImportError:
    new_genai = None
import uvicorn

# Allow sibling imports (vector, rag_chain live in same dir)
sys.path.insert(0, os.path.dirname(__file__))

# Lazy imports moved to routes for faster startup

# ─── App setup ────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="AfsGPT RAG API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "https://*.vercel.app",
        "https://*.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR     = os.path.join(os.path.dirname(__file__), "uploads")
STATIC_DIR     = os.path.join(os.path.dirname(__file__), "static")
IMAGES_DIR     = os.path.join(STATIC_DIR, "images")
THUMBNAILS_DIR = os.path.join(STATIC_DIR, "thumbnails")

for d in [UPLOAD_DIR, STATIC_DIR, IMAGES_DIR, THUMBNAILS_DIR]:
    os.makedirs(d, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

ALLOWED_EXT = {".txt", ".pdf", ".csv", ".xlsx", ".xls"}

# Track background ingestion tasks so /query knows if a session is still processing
_processing_sessions: dict = {}

# Cache for PDF text extraction to avoid re-parsing on every query
_pdf_text_cache: dict = {}

_online_cache: Optional[tuple[bool, float]] = None
_is_online_lock = False

def is_online() -> bool:
    """Check if the backend is connected to the internet. Result cached for 30s."""
    global _online_cache, _is_online_lock
    now = __import__('time').time()
    if _online_cache is not None and (now - _online_cache[1]) < 30:
        return _online_cache[0]
    if _is_online_lock:
        return _online_cache[0] if _online_cache else True
    _is_online_lock = True
    import socket
    try:
        socket.setdefaulttimeout(1.0)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect(("8.8.8.8", 53))
        _online_cache = (True, now)
        return True
    except OSError:
        _online_cache = (False, now)
        return False
    finally:
        _is_online_lock = False


def resolve_api_key(provider: str, user_key: Optional[str]) -> Optional[str]:
    provider = provider.lower()
    if user_key:
        return user_key
    
    # Suffix check
    env_name = f"{provider.upper()}_API_KEY"
    env_key = os.environ.get(env_name)
    if env_key:
        return env_key
        
    if provider == "gemini":
        gemini_key = os.environ.get("GOOGLE_API_KEY")
        if gemini_key:
            return gemini_key

    return None


def _extract_pdf_text(file_path: str) -> str:
    """Extract text from a PDF with caching. Returns up to 100K chars."""
    if file_path in _pdf_text_cache:
        return _pdf_text_cache[file_path]
    from langchain_community.document_loaders import PyPDFLoader
    loader = PyPDFLoader(file_path)
    docs = loader.load()
    full_text = "\n".join([d.page_content for d in docs])
    # Cache to disk as well
    cache_path = file_path + ".txt"
    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            f.write(full_text)
    except Exception:
        pass
    # Keep only first 100K chars
    truncated = full_text[:100000] if len(full_text) > 100000 else full_text
    _pdf_text_cache[file_path] = truncated
    return truncated


# ─── Models ───────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    session_id: str
    question:   str
    apiKey: Optional[str] = None
    provider: Optional[str] = "gemini"
    model: Optional[str] = "gemini-2.5-flash"

class ClearRequest(BaseModel):
    session_id: str

class ImageGenRequest(BaseModel):
    prompt: str

class ImageAnalyzeRequest(BaseModel):
    image_base64: str
    question: str = "Describe this image in detail."
    apiKey: Optional[str] = None
    model: Optional[str] = "gemini-2.5-flash"
    provider: Optional[str] = "gemini"

class ResearchRequest(BaseModel):
    query: str
    provider: str = "ollama"
    model: str = "gemma2:2b"
    api_key: str = ""

class ChatRequest(BaseModel):
    messages: list
    provider: str
    model: str
    apiKey: Optional[str] = None

class ModelsRequest(BaseModel):
    provider: str
    apiKey: Optional[str] = None

@app.get("/health")
def health_check():
    """Returns the status and available routes of the backend."""
    return {
        "status": "online",
        "version": "1.1.0",
        "routes": [
            "/chat", "/models", "/research", "/analyze-image", 
            "/generate-image", "/upload", "/query", "/clear"
        ]
    }

# ─── Routes ───────────────────────────────────────────────────────────────────

async def _generate_thumbnail_async(save_path: str, session_id: str):
    """Generate PDF thumbnail in background thread — non-blocking."""
    if not fitz:
        return
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _generate_thumbnail_sync, save_path, session_id)
    except Exception as te:
        log.warning(f"[{session_id}] Thumbnail generation failed: {te}")


def _generate_thumbnail_sync(save_path: str, session_id: str):
    thumb_filename = f"thumb_{session_id}_{uuid.uuid4().hex[:8]}.png"
    thumb_path = os.path.join(THUMBNAILS_DIR, thumb_filename)
    doc_pdf = fitz.open(save_path)
    if len(doc_pdf) > 0:
        page = doc_pdf[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(0.2, 0.2))
        pix.save(thumb_path)
    doc_pdf.close()


async def _ingest_in_background(session_id: str, save_path: str, api_key: Optional[str], filename: str):
    """Run document ingestion in a background thread, with error handling."""
    try:
        from vector import ingest_file

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, ingest_file, save_path, session_id, api_key)
        log.info(f"[{session_id}] Background ingestion completed for '{filename}'.")
    except Exception as e:
        log.error(f"[{session_id}] Background ingestion failed: {e}")
    finally:
        _processing_sessions.pop(session_id, None)


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...), 
    session_id: Optional[str] = Form(None),
    apiKey: Optional[str] = Form(None)
):
    """
    Receive an uploaded file, save it temporarily,
    ingest into a unique ChromaDB collection (async background), return a session_id.
    """
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXT)}"
        )

    if not session_id:
        session_id  = str(uuid.uuid4())
    save_path   = os.path.join(UPLOAD_DIR, f"{session_id}_{file.filename}")

    # Save uploaded file to disk
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    log.info(f"[{session_id}] Saved '{file.filename}' → '{save_path}'")

    # --- Conditional Ingestion (background if local mode) ---
    is_processing = False
    if apiKey:
        log.info(f"[{session_id}] Cloud Mode detected. Skipping local ingestion.")
    else:
        log.info(f"[{session_id}] Local Mode — spawning background ingestion...")
        _processing_sessions[session_id] = True
        is_processing = True
        asyncio.create_task(_ingest_in_background(session_id, save_path, apiKey, file.filename))

    # Generate thumbnail in background so upload returns immediately
    thumbnail_url = None
    if ext == ".pdf" and fitz:
        asyncio.create_task(_generate_thumbnail_async(save_path, session_id))

    # Don't delete PDFs — direct_document_analysis needs them
    if ext != ".pdf":
        if os.path.exists(save_path):
            os.remove(save_path)

    return JSONResponse({
        "session_id": session_id,
        "filename":   file.filename,
        "thumbnail":  thumbnail_url,
        "processing": is_processing,
        "message":    "File received. Analysis mode: Cloud Direct (No-DB)." if ".pdf" in file.filename.lower() else "File received. Background ingestion started."
    })


async def direct_document_analysis(question: str, file_path: str, api_key: str, provider: str = "gemini", model_name: str = "gemini-2.5-flash"):
    """Sends the document directly to the selected AI for analysis (No-DB RAG)."""
    try:
        provider = provider.lower() if provider else "gemini"
        
        # --- Gemini Native PDF ---
        if provider == "gemini":
            if not new_genai:
                return "Cloud analysis failed: google-genai SDK not installed."
            client = new_genai.Client(api_key=api_key)
            with open(file_path, "rb") as f:
                pdf_bytes = f.read()

            target_model = model_name if model_name else "gemini-2.5-flash"
            response = client.models.generate_content(
                model=target_model,
                contents=[
                    genai_types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'),
                    question
                ]
            )
            return response.text

        # --- Anthropic Native PDF ---
        if provider == "anthropic":
            with open(file_path, "rb") as f:
                pdf_b64 = base64.b64encode(f.read()).decode("utf-8")
            
            target_model = model_name if model_name else "claude-3-5-sonnet-20240620"
            payload = {
                "model": target_model,
                "max_tokens": 1024,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "document",
                                "source": {
                                    "type": "base64",
                                    "media_type": "application/pdf",
                                    "data": pdf_b64
                                }
                            },
                            {
                                "type": "text",
                                "text": question
                            }
                        ]
                    }
                ]
            }
            res = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json=payload,
                timeout=120
            )
            if res.ok:
                return res.json()["content"][0]["text"]
            return f"Anthropic error: {res.text}"

        # --- OpenAI (In-Memory Text Extraction Fallback, with caching) ---
        if provider == "openai":
            full_text = _extract_pdf_text(file_path)
            target_model = model_name if model_name else "gpt-4o-mini"
            payload = {
                "model": target_model,
                "messages": [
                    {"role": "system", "content": f"Document Text:\n{full_text}"},
                    {"role": "user", "content": question}
                ],
                "max_tokens": 1000
            }
            res = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=120
            )
            if res.ok:
                return res.json()["choices"][0]["message"]["content"]
            return f"OpenAI error: {res.text}"

        # --- OpenRouter (In-Memory Text Extraction Fallback, with caching) ---
        if provider == "openrouter":
            full_text = _extract_pdf_text(file_path)
            target_model = model_name if model_name else "google/gemini-2.5-flash"
            payload = {
                "model": target_model,
                "messages": [
                    {"role": "system", "content": f"Document Text:\n{full_text}"},
                    {"role": "user", "content": question}
                ],
                "max_tokens": 1000
            }
            res = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}", 
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "AfsGPT"
                },
                json=payload,
                timeout=120
            )
            if res.ok:
                return res.json()["choices"][0]["message"]["content"]
            return f"OpenRouter error: {res.text}"

        # --- Groq (In-Memory Text Extraction Fallback, with caching) ---
        if provider == "groq":
            full_text = _extract_pdf_text(file_path)
            target_model = model_name if model_name else "llama3-70b-8192"
            payload = {
                "model": target_model,
                "messages": [
                    {"role": "system", "content": f"Document Text:\n{full_text}"},
                    {"role": "user", "content": question}
                ],
                "max_tokens": 1000
            }
            res = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=120
            )
            if res.ok:
                return res.json()["choices"][0]["message"]["content"]
            return f"Groq error: {res.text}"

        return "Provider not supported for direct document analysis."

    except Exception as e:
        log.error(f"Direct Document Analysis failed: {e}")
        return f"Cloud analysis failed: {str(e)}"


@app.post("/query")
async def ask_question(body: QueryRequest):
    """Answer a question using the documents in a given session collection."""
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    log.info(f"[{body.session_id}] Question: {body.question}")
    
    # ─── Check if local ingestion is still processing ────────────────────
    if body.session_id in _processing_sessions:
        log.info(f"[{body.session_id}] Ingestion still in progress — returning 202")
        return JSONResponse(
            {"status": "processing", "detail": "Document is still being indexed. Please try again in a moment."},
            status_code=202
        )

    # ─── Direct Document Logic (Cloud / No-DB for PDFs) ────────────────────
    provider = body.provider.lower() if body.provider else "gemini"
    api_key = resolve_api_key(provider, body.apiKey)
    if api_key and body.session_id:
        potential_files = [f for f in os.listdir(UPLOAD_DIR) if f.startswith(body.session_id) and f.lower().endswith(".pdf")]
        if potential_files:
            if not is_online():
                raise HTTPException(
                    status_code=503,
                    detail="Cloud analysis requires internet, but you appear to be offline."
                )
            file_path = os.path.join(UPLOAD_DIR, potential_files[0])
            log.info(f"[{body.session_id}] Using Direct Analysis Mode ({body.provider}) for {potential_files[0]}")
            answer = await direct_document_analysis(body.question, file_path, api_key, body.provider, body.model)
            return JSONResponse({"answer": answer})

    # ─── Standard RAG Logic (Ollama / ChromaDB) ───────────────────────────
    try:
        from rag_chain import query
        answer = query(question=body.question, collection_name=body.session_id, api_key=api_key)
        log.info(f"[{body.session_id}] Answer generated.")
    except Exception as e:
        log.error(f"[{body.session_id}] Query error: {e}")
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")

    return JSONResponse({"answer": answer})


@app.post("/generate-image")
async def create_image(body: ImageGenRequest):
    """Generates an image via FLUX.1 using Qwen-enhanced prompt."""
    if not is_online():
        raise HTTPException(
            status_code=503,
            detail="Offline Mode: Image generation requires an active internet connection to contact Hugging Face."
        )
    # Lazy import
    from image_gen import generate_image
    result = generate_image(body.prompt, IMAGES_DIR)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
        
    return JSONResponse(result)


@app.delete("/clear")
async def clear_session(body: ClearRequest):
    """Delete all documents in a session collection."""
    try:
        # Lazy import
        from vector import clear_collection
        clear_collection(collection_name=body.session_id)
        log.info(f"[{body.session_id}] Collection cleared.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return JSONResponse({"message": "Session cleared."})


@app.post("/research")
async def research_query(body: ResearchRequest):
    """
    Run the multi-step Research Agent:
      1. Planner   — breaks query into sub-questions
      2. Searcher  — DuckDuckGo search for each sub-question
      3. Synthesizer — combines findings into a structured Markdown answer
    """
    if not is_online():
        raise HTTPException(
            status_code=503,
            detail="Offline Mode: The research agent requires an active internet connection to search the web."
        )
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    log.info(f"[Research] Starting research for: {body.query[:80]}")
    try:
        # Lazy import
        from research_agent import run_research
        answer = run_research(
            query=body.query,
            provider=body.provider,
            model=body.model,
            api_key=body.api_key,
        )
        return JSONResponse({"answer": answer})
    except Exception as e:
        log.error(f"[Research] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Research agent error: {str(e)}")


_VISION_PROVIDERS = {"gemini", "openai", "openrouter", "groq", "anthropic"}

@app.post("/analyze-image")
def analyze_image(body: ImageAnalyzeRequest):
    """Analyze an image using the selected provider's vision model."""
    if not body.image_base64.strip():
        raise HTTPException(status_code=400, detail="Image data cannot be empty.")

    try:
        log.info(f"Image analysis request: {body.question[:50]}... provider={body.provider} model={body.model}")
        
        header, _, data = body.image_base64.partition(",")
        clean_base64 = data if data else body.image_base64
        selected_provider = body.provider.lower() if body.provider else "gemini"
        api_key = resolve_api_key(selected_provider, body.apiKey)

        # Cloud providers require an API key — fail early instead of falling through
        if selected_provider in _VISION_PROVIDERS and not api_key:
            raise HTTPException(
                status_code=400,
                detail=f"No API key found for {selected_provider}. Please add your key in Settings → API Keys."
            )

        # ─── Google Gemini ──────────────────────────────────────────
        if selected_provider == "gemini":
            log.info(f"Gemini vision ({body.model})...")
            target_model = body.model if body.model else "gemini-2.5-flash"
            if new_genai:
                client = new_genai.Client(api_key=api_key)
                img_data = base64.b64decode(clean_base64)
                response = client.models.generate_content(
                    model=target_model,
                    contents=[genai_types.Part.from_bytes(data=img_data, mime_type='image/jpeg'), body.question]
                )
                if response.text:
                    return JSONResponse({"answer": response.text})
            else:
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel(target_model)
                img_data = base64.b64decode(clean_base64)
                response = model.generate_content([body.question, {'mime_type': 'image/jpeg', 'data': img_data}])
                if response.text:
                    return JSONResponse({"answer": response.text})
            raise HTTPException(status_code=500, detail="Gemini returned empty response.")

        # ─── OpenAI GPT-4o ──────────────────────────────────────────
        if selected_provider == "openai":
            log.info("OpenAI vision...")
            api_model = body.model if body.model else "gpt-4o-mini"
            res = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": api_model,
                    "messages": [{"role": "user", "content": [
                        {"type": "text", "text": body.question},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{clean_base64}"}}
                    ]}],
                    "max_tokens": 500
                },
                timeout=60
            )
            if res.ok:
                return JSONResponse({"answer": res.json()["choices"][0]["message"]["content"]})
            raise HTTPException(status_code=502, detail=f"OpenAI error: {res.text}")

        # ─── OpenRouter ──────────────────────────────────────────
        if selected_provider == "openrouter":
            log.info("OpenRouter vision...")
            api_model = body.model if body.model else "google/gemini-2.5-flash"
            res = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3000", "X-Title": "AfsGPT"
                },
                json={
                    "model": api_model,
                    "messages": [{"role": "user", "content": [
                        {"type": "text", "text": body.question},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{clean_base64}"}}
                    ]}],
                    "max_tokens": 500
                },
                timeout=60
            )
            if res.ok:
                return JSONResponse({"answer": res.json()["choices"][0]["message"]["content"]})
            raise HTTPException(status_code=502, detail=f"OpenRouter error: {res.text}")

        # ─── Groq ──────────────────────────────────────────
        if selected_provider == "groq":
            log.info("Groq vision...")
            api_model = body.model if body.model else "llama-3.2-90b-vision-preview"
            res = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": api_model,
                    "messages": [{"role": "user", "content": [
                        {"type": "text", "text": body.question},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{clean_base64}"}}
                    ]}],
                    "max_tokens": 500
                },
                timeout=60
            )
            if res.ok:
                return JSONResponse({"answer": res.json()["choices"][0]["message"]["content"]})
            raise HTTPException(status_code=502, detail=f"Groq error: {res.text}")

        # ─── Anthropic Claude ───────────────────────────────────────
        if selected_provider == "anthropic":
            log.info(f"Anthropic vision ({body.model})...")
            api_model = body.model if body.model else "claude-3-5-sonnet-20240620"
            res = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": api_model, "max_tokens": 1024,
                    "messages": [{"role": "user", "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": clean_base64}},
                        {"type": "text", "text": body.question}
                    ]}]
                },
                timeout=60
            )
            if res.ok:
                return JSONResponse({"answer": res.json()["content"][0]["text"]})
            raise HTTPException(status_code=502, detail=f"Anthropic error: {res.text}")

        # ─── Ollama (Local) ─────────────────────────────────────────
        log.info("Ollama vision (moondream)...")
        response = ollama.chat(
            model="moondream",
            messages=[{"role": "user", "content": body.question, "images": [clean_base64]}]
        )
        if response and 'message' in response:
            return JSONResponse({"answer": response['message']['content']})
        raise HTTPException(status_code=500, detail="Ollama returned an empty response.")

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Image analysis error: {e}")
        return JSONResponse(status_code=500, content={"error": f"Analysis Error: {str(e)}", "detail": str(e)})


@app.delete("/clear-all")
async def clear_all_sessions():
    """Delete all documents in all collections."""
    try:
        # Lazy import
        from vector import clear_all_collections
        clear_all_collections()
        log.info("All collections cleared.")
        
        # Also clean up the uploads directory just in case
        for f in os.listdir(UPLOAD_DIR):
            file_path = os.path.join(UPLOAD_DIR, f)
            try:
                if os.path.isfile(file_path):
                    os.unlink(file_path)
            except Exception as e:
                log.error(f"Failed to delete {file_path}: {e}")
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return JSONResponse({"message": "All files cleared."})


@app.post("/chat")
async def chat_handler(body: ChatRequest):
    """Unified chat endpoint that uses backend keys or user-provided keys."""
    provider = body.provider.lower()
    model = body.model
    api_key = resolve_api_key(provider, body.apiKey)

    SYSTEM_PROMPT = (
        "You are Afs AI, a high-end AI assistant, developed by Hameed Afsar KM. Always format your responses beautifully using Markdown. "
        "Use bold for emphasis and clean lists. CRITICAL: Whenever you provide content that represents a file "
        "(like code, a README.md, a text file, or any technical document), you MUST wrap it in a triple-backtick "
        "markdown code block with the appropriate language label. Always include a comment on the first line with the filename."
    )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + body.messages

    try:
        # Check online status first
        if not is_online():
            # Check if local Ollama is actually available
            ollama_running = False
            try:
                requests.get("http://localhost:11434/api/tags", timeout=1)
                ollama_running = True
            except:
                pass

            if ollama_running:
                # If they selected Ollama, use the chosen model. Else fallback to gemma2:2b.
                fallback_model = model if provider == "ollama" else "gemma2:2b"
                try:
                    response = requests.post(
                        "http://localhost:11434/api/chat",
                        json={"model": fallback_model, "messages": messages, "stream": False},
                        timeout=60
                    )
                    if response.ok:
                        content = response.json()["message"]["content"]
                        if provider != "ollama":
                            content += "\n\n*(Offline Mode: Automatically fell back to local Ollama)*"
                        return JSONResponse({"content": content})
                except Exception as e:
                    log.warning(f"Ollama fallback post failed: {e}")

            if provider == "ollama":
                raise HTTPException(
                    status_code=503,
                    detail="Offline Mode: Local Ollama is not running. Please start Ollama to enable local offline chat."
                )
            else:
                raise HTTPException(
                    status_code=503,
                    detail=f"Offline Mode: You are offline, and cloud provider '{provider.capitalize()}' is unavailable. "
                           "Please check your internet connection or start local Ollama to enable local offline fallback."
                )

        if provider == "ollama":
            # Check if Ollama is actually available
            try:
                # Short timeout to avoid hanging the request
                requests.get("http://localhost:11434/api/tags", timeout=1)
                
                response = requests.post(
                    "http://localhost:11434/api/chat",
                    json={"model": model, "messages": messages, "stream": False},
                    timeout=60
                )
                if response.ok:
                    return JSONResponse({"content": response.json()["message"]["content"]})
            except:
                # If Ollama is not available (Cloud mode), fallback to Gemini if possible
                if os.environ.get("GOOGLE_API_KEY"):
                    log.info("Ollama unavailable, falling back to Gemini for chat.")
                    provider = "gemini"
                    model = "gemini-2.5-flash"
                    api_key = os.environ.get("GOOGLE_API_KEY")
                else:
                    raise HTTPException(status_code=503, detail="Ollama is not running and no cloud fallback (GOOGLE_API_KEY) is configured.")

        if provider == "openai":
            if not api_key: raise HTTPException(status_code=400, detail="OpenAI API Key missing")
            try:
                response = requests.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": model, "messages": messages},
                    timeout=60
                )
                if response.ok:
                    return JSONResponse({"content": response.json()["choices"][0]["message"]["content"]})
                raise HTTPException(status_code=response.status_code, detail=response.json().get("error", {}).get("message", "OpenAI failed"))
            except Exception as e:
                log.warning(f"OpenAI failed: {e}")

        if provider == "gemini":
            if not api_key: raise HTTPException(status_code=400, detail="Gemini API Key missing")
            # Using direct REST API for chat
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {
                "contents": [
                    {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                    for m in messages if m["role"] != "system"
                ],
                "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]}
            }
            response = requests.post(url, json=payload, timeout=60)
            if response.ok:
                return JSONResponse({"content": response.json()["candidates"][0]["content"]["parts"][0]["text"]})
            raise HTTPException(status_code=response.status_code, detail=response.json().get("error", {}).get("message", "Gemini failed"))

        if provider == "anthropic":
            if not api_key: raise HTTPException(status_code=400, detail="Anthropic API Key missing")
            try:
                system_text = ""
                anthropic_messages = []
                for m in messages:
                    if m["role"] == "system":
                        system_text = m["content"]
                    else:
                        role = "assistant" if m["role"] == "assistant" else "user"
                        anthropic_messages.append({"role": role, "content": m["content"]})
                
                payload = {
                    "model": model,
                    "max_tokens": 1024,
                    "messages": anthropic_messages
                }
                if system_text:
                    payload["system"] = system_text

                response = requests.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json=payload,
                    timeout=60
                )
                if response.ok:
                    return JSONResponse({"content": response.json()["content"][0]["text"]})
                raise HTTPException(status_code=response.status_code, detail=response.json().get("error", {}).get("message", "Anthropic failed"))
            except Exception as e:
                log.warning(f"Anthropic failed: {e}")

        if provider == "openrouter":
            if not api_key: raise HTTPException(status_code=400, detail="OpenRouter API Key missing")
            try:
                response = requests.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "HTTP-Referer": "http://localhost:3000",
                        "X-Title": "AfsGPT"
                    },
                    json={"model": model, "messages": messages, "stream": False},
                    timeout=60
                )
                if response.ok:
                    return JSONResponse({"content": response.json()["choices"][0]["message"]["content"]})
                raise HTTPException(status_code=response.status_code, detail=response.json().get("error", {}).get("message", "OpenRouter failed"))
            except Exception as e:
                log.warning(f"OpenRouter failed: {e}")

        if provider == "groq":
            if not api_key: raise HTTPException(status_code=400, detail="Groq API Key missing")
            try:
                response = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": model, "messages": messages, "stream": False},
                    timeout=60
                )
                if response.ok:
                    return JSONResponse({"content": response.json()["choices"][0]["message"]["content"]})
                raise HTTPException(status_code=response.status_code, detail=response.json().get("error", {}).get("message", "Groq failed"))
            except Exception as e:
                log.warning(f"Groq failed: {e}")

        # ─── FINAL FALLBACK: If we reached here, Cloud failed or Ollama was requested ───
        try:
            requests.get("http://localhost:11434/api/tags", timeout=1)
            response = requests.post(
                "http://localhost:11434/api/chat",
                json={"model": "gemma2:2b", "messages": messages, "stream": False},
                timeout=60
            )
            if response.ok:
                return JSONResponse({"content": response.json()["message"]["content"]})
        except:
            pass

        raise HTTPException(status_code=500, detail="All AI providers (Cloud and Local) failed to respond. Please check your keys and internet connection.")

    except Exception as e:
        log.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/models")
async def get_provider_models(body: ModelsRequest):
    """Fetch available models for a provider, using backend keys if needed."""
    provider = body.provider.lower()
    api_key = resolve_api_key(provider, body.apiKey)

    if provider == "ollama":
        try:
            res = requests.get("http://localhost:11434/api/tags", timeout=5)
            if res.ok:
                return JSONResponse({"models": [m["name"] for m in res.json().get("models", [])]})
        except: pass
        return JSONResponse({"models": ["gemma2:2b", "llama3", "moondream"]})

    if provider == "openai":
        if not api_key: return JSONResponse({"models": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"]})
        res = requests.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {api_key}"})
        if res.ok:
            return JSONResponse({"models": [m["id"] for m in res.json()["data"] if "gpt" in m["id"]]})

    if provider == "openrouter":
        if not api_key: return JSONResponse({"models": ["google/gemini-2.5-flash", "openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"]})
        try:
            res = requests.get("https://openrouter.ai/api/v1/models")
            if res.ok:
                models_list = [m["id"] for m in res.json().get("data", [])]
                return JSONResponse({"models": models_list})
        except Exception as e:
            log.warning(f"Failed to fetch OpenRouter models: {e}")
        return JSONResponse({"models": ["google/gemini-2.5-flash", "openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"]})

    if provider == "gemini":
        # Return defaults if no key is provided or API fetch fails
        defaults = [
            "gemini-1.5-flash", "gemini-1.5-pro",
            "gemini-2.0-flash", "gemini-2.0-pro",
            "gemini-2.5-flash", "gemini-2.5-pro",
            "gemini-3.0-flash", "gemini-3.0-pro"
        ]
        if not api_key: 
            return JSONResponse({"models": defaults})
        
        try:
            res = requests.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}", timeout=5)
            if res.ok:
                data = res.json()
                if "models" in data:
                    models = [m["name"].split("/")[-1] for m in data["models"] if "generateContent" in m.get("supportedGenerationMethods", [])]
                    if models: return JSONResponse({"models": models})
        except Exception as e:
            log.warning(f"Failed to fetch Gemini models from API: {e}")
            
        # If API call failed or returned empty, return the hardcoded defaults
        return JSONResponse({"models": defaults})

    if provider == "anthropic":
        return JSONResponse({"models": ["claude-3-5-sonnet-20240620", "claude-3-haiku-20240307", "claude-3-opus-20240229"]})

    if provider == "groq":
        if not api_key: return JSONResponse({"models": ["llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768", "gemma2-9b-it"]})
        try:
            res = requests.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=5
            )
            if res.ok:
                models_list = [m["id"] for m in res.json().get("data", [])]
                return JSONResponse({"models": models_list})
        except Exception as e:
            log.warning(f"Failed to fetch Groq models: {e}")
        return JSONResponse({"models": ["llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768", "gemma2-9b-it"]})

    return JSONResponse({"models": []})


# ─── Streaming Voice WebSocket ────────────────────────────────────────────────

@app.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket):
    """
    Low-latency streaming voice pipeline:
    Audio chunks → faster-whisper STT → streaming LLM → sentence chunker → edge-tts → audio chunks
    """
    from voice_ws import voice_websocket_handler
    await voice_websocket_handler(websocket)


# ─── Static frontend ──────────────────────────────────────────────────────────

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_ui():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ─── Entry point ──────────────────────────────────────────────────────────────

def clean_text_for_tts(text: str) -> str:
    """Removes emojis, markdown, and special characters for cleaner speech."""
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

@app.api_route("/tts", methods=["GET", "POST"])
async def text_to_speech(
    request: Request,
    text: Optional[str] = None,
    voice: Optional[str] = "en-US-AvaNeural"
):
    """Convert text to speech using edge-tts and stream it back."""
    input_text = text
    input_voice = voice

    if request.method == "POST":
        try:
            body = await request.json()
            input_text = body.get("text", input_text)
            input_voice = body.get("voice", input_voice)
        except:
            pass

    if not input_text:
        raise HTTPException(status_code=400, detail="Text is required")

    cleaned = clean_text_for_tts(input_text)
    if not cleaned:
        from fastapi import Response
        return Response(status_code=204)
    
    try:
        communicate = edge_tts.Communicate(cleaned, input_voice or "en-US-AvaNeural")
        
        async def audio_generator():
            try:
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        yield chunk["data"]
            except Exception as e:
                log.error(f"Streaming error during TTS: {e}")
                
        return StreamingResponse(audio_generator(), media_type="audio/mpeg")
        
    except Exception as e:
        log.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Render provides a PORT environment variable. Default to 8001 for local development.
    port = int(os.environ.get("PORT", 8001))
    # Disable reload in production (Render) for better performance and stability.
    is_dev = os.environ.get("RENDER") is None
    log.info(f"Starting server on port {port} (dev_mode={is_dev})")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=is_dev)
