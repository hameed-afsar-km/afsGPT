"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PhoneOff, Mic, MicOff } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "idle" | "listening" | "thinking" | "speaking";

export interface VoiceCallModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// ─── Single Live Waveform (UNCHANGED) ────────────────────────────────────────
function LiveWaveform({
    analyserNode,
    phase,
}: {
    analyserNode: AnalyserNode | null;
    phase: Phase;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);

    const colorMap: Record<Phase, string> = {
        idle: "#6366f1",
        listening: "#34d399",
        thinking: "#fbbf24",
        speaking: "#818cf8",
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        const color = colorMap[phase];

        const draw = () => {
            rafRef.current = requestAnimationFrame(draw);
            const W = canvas.width;
            const H = canvas.height;
            const centerX = W / 2;
            const centerY = H / 2;
            ctx.clearRect(0, 0, W, H);

            if (!analyserNode) {
                const t = performance.now() / 1000;
                const baseRadius = 80 + Math.sin(t * 2) * 5;
                ctx.beginPath();
                ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
                ctx.lineWidth = 3;
                ctx.strokeStyle = color + "40";
                ctx.stroke();
                const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius);
                grad.addColorStop(0, "transparent");
                grad.addColorStop(0.8, color + "05");
                grad.addColorStop(1, color + "20");
                ctx.fillStyle = grad;
                ctx.fill();
                return;
            }

            const bufLen = analyserNode.frequencyBinCount;
            const freqData = new Uint8Array(bufLen);
            analyserNode.getByteFrequencyData(freqData);
            let sum = 0;
            for (let i = 0; i < bufLen; i++) sum += freqData[i];
            const avgVol = sum / bufLen;
            const pulse = (avgVol / 255) * 40;
            const baseRadius = 80 + pulse;

            const barCount = 120;
            const angleStep = (Math.PI * 2) / barCount;
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;

            for (let i = 0; i < barCount; i++) {
                const index = Math.floor((i / barCount) * (bufLen / 3));
                const val = freqData[index];
                const barHeight = (val / 255) * 60;
                const angle = i * angleStep - Math.PI / 2;
                const innerX = centerX + Math.cos(angle) * baseRadius;
                const innerY = centerY + Math.sin(angle) * baseRadius;
                const outerX = centerX + Math.cos(angle) * (baseRadius + barHeight);
                const outerY = centerY + Math.sin(angle) * (baseRadius + barHeight);
                ctx.beginPath();
                ctx.moveTo(innerX, innerY);
                ctx.lineTo(outerX, outerY);
                ctx.strokeStyle = `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, ${0.4 + (val / 255) * 0.6})`;
                ctx.stroke();
            }

            ctx.beginPath();
            ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
            ctx.lineWidth = 4;
            ctx.strokeStyle = color;
            ctx.stroke();

            const grad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.5, centerX, centerY, baseRadius);
            grad.addColorStop(0, "transparent");
            grad.addColorStop(1, color + "30");
            ctx.fillStyle = grad;
            ctx.fill();
        };

        draw();
        return () => cancelAnimationFrame(rafRef.current);
    }, [analyserNode, phase]);

    return (
        <div className="relative w-full aspect-square max-w-[400px] flex items-center justify-center">
            <canvas ref={canvasRef} width={800} height={800} className="w-full h-full object-contain" />
        </div>
    );
}

// ─── Audio helpers ────────────────────────────────────────────────────────────

/** Downsample Float32 samples from sourceRate → 16000 Hz, return Int16 PCM. */
function downsampleToInt16(input: Float32Array, sourceRate: number, targetRate = 16000): ArrayBuffer {
    const ratio = sourceRate / targetRate;
    const outputLen = Math.floor(input.length / ratio);
    const output = new Int16Array(outputLen);
    for (let i = 0; i < outputLen; i++) {
        const srcIdx = Math.min(Math.floor(i * ratio), input.length - 1);
        const sample = Math.max(-1, Math.min(1, input[srcIdx]));
        output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output.buffer;
}

/** RMS energy of a Float32 audio frame. */
function computeRMS(buf: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SILENCE_RMS_THRESHOLD = 0.015; // normalized 0-1
const SILENCE_FRAMES_NEEDED = 12;    // ~240ms at 50ms chunks
const MIN_SPEECH_FRAMES = 8;         // ~160ms min speech before processing
const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:8001")
    .replace(/^http/, "ws") + "/ws/voice";

// ─── Modal ────────────────────────────────────────────────────────────────────
export function VoiceCallModal({ isOpen, onClose }: VoiceCallModalProps) {
    const { messages, setMessages, activeChatId, createNewChat, sendMessageToFirestore } = useChat();

    // ── UI State (unchanged) ──────────────────────────────────────────────────
    const [phase, setPhase] = useState<Phase>("idle");
    const [label, setLabel] = useState("Connecting...");
    const [isMuted, setIsMuted] = useState(false);
    const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
    const [partialText, setPartialText] = useState("");

    // ── Stable Refs ───────────────────────────────────────────────────────────
    const phaseRef = useRef<Phase>("idle");
    const isMutedRef = useRef(false);
    const isOpenRef = useRef(false);
    const messagesRef = useRef<any[]>([]);
    const activeChatIdRef = useRef<string | null>(null);

    // Pipeline refs
    const wsRef = useRef<WebSocket | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const scriptProcRef = useRef<ScriptProcessorNode | null>(null);
    const micAnalyserRef = useRef<AnalyserNode | null>(null);
    const aiAnalyserRef = useRef<AnalyserNode | null>(null);

    // VAD state
    const silenceFramesRef = useRef(0);
    const speechFramesRef = useRef(0);
    const isSpeakingRef = useRef(false);

    // Playback queue
    const playQueueRef = useRef<ArrayBuffer[]>([]);
    const isPlayingRef = useRef(false);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

    // LLM token accumulation for chat messages
    const aiTokensRef = useRef("");
    const chatIdRef = useRef<string | null>(null);

    // Keep refs in sync
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
    useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const setPhaseAndAnalyser = useCallback((p: Phase, analyser: AnalyserNode | null) => {
        phaseRef.current = p;
        setPhase(p);
        setAnalyserNode(analyser);
        setLabel({ idle: "Connecting...", listening: "Listening...", thinking: "Thinking...", speaking: "Speaking..." }[p]);
    }, []);

    const getOrCreateAudioCtx = useCallback(() => {
        if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
            audioCtxRef.current = new AudioContext();
        }
        return audioCtxRef.current;
    }, []);

    // ── Playback Queue ────────────────────────────────────────────────────────

    const playNextChunk = useCallback(async () => {
        if (isPlayingRef.current || playQueueRef.current.length === 0) return;
        isPlayingRef.current = true;

        const chunk = playQueueRef.current.shift()!;
        const ctx = getOrCreateAudioCtx();

        try {
            const decoded = await ctx.decodeAudioData(chunk);
            const source = ctx.createBufferSource();
            source.buffer = decoded;

            // Wire to analyser for waveform
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.85;
            source.connect(analyser);
            analyser.connect(ctx.destination);
            aiAnalyserRef.current = analyser;
            currentSourceRef.current = source;
            setPhaseAndAnalyser("speaking", analyser);

            source.onended = () => {
                isPlayingRef.current = false;
                currentSourceRef.current = null;
                if (playQueueRef.current.length > 0) {
                    playNextChunk();
                } else {
                    // Queue drained — handled by "audio_end" WS message
                }
            };
            source.start();
        } catch (err) {
            console.warn("[Voice] Decode error:", err);
            isPlayingRef.current = false;
            playNextChunk();
        }
    }, [getOrCreateAudioCtx, setPhaseAndAnalyser]);

    const enqueueAudio = useCallback((buf: ArrayBuffer) => {
        playQueueRef.current.push(buf);
        playNextChunk();
    }, [playNextChunk]);

    const stopAllAudio = useCallback(() => {
        try { currentSourceRef.current?.stop(); } catch { /* ignore */ }
        currentSourceRef.current = null;
        playQueueRef.current = [];
        isPlayingRef.current = false;
        aiAnalyserRef.current = null;
    }, []);

    // ── WebSocket Setup ───────────────────────────────────────────────────────

    const setupWebSocket = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

        const ws = new WebSocket(WS_URL);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
            // Send config immediately
            const provider = localStorage.getItem("afs-provider") || "gemini";
            const model = localStorage.getItem("afs-model") || "gemini-2.5-flash";
            const keys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
            const apiKey = keys[provider] || "";

            ws.send(JSON.stringify({
                type: "config",
                provider,
                model,
                apiKey,
                voice: "en-US-AvaNeural",
            }));
        };

        ws.onmessage = async (event) => {
            // Binary frame = audio chunk
            if (event.data instanceof ArrayBuffer) {
                enqueueAudio(event.data.slice(0)); // clone to avoid detach
                return;
            }

            try {
                const msg = JSON.parse(event.data as string);

                switch (msg.type) {
                    case "ready":
                        setPhaseAndAnalyser("listening", micAnalyserRef.current);
                        setPartialText("");
                        aiTokensRef.current = "";
                        break;

                    case "transcript":
                        if (msg.is_final) {
                            setPartialText(msg.text);
                            // Add user message to chat
                            const userMsg: any = { role: "user", content: msg.text, timestamp: new Date() };
                            const updated = [...messagesRef.current, userMsg];
                            setMessages(updated);
                            messagesRef.current = updated;
                            // Persist to Firestore
                            (async () => {
                                try {
                                    if (!chatIdRef.current) {
                                        chatIdRef.current = await createNewChat(msg.text);
                                        activeChatIdRef.current = chatIdRef.current;
                                    }
                                    await sendMessageToFirestore(chatIdRef.current!, userMsg);
                                } catch { /* non-critical */ }
                            })();
                            setPhaseAndAnalyser("thinking", null);
                        } else {
                            setPartialText(msg.text);
                        }
                        break;

                    case "llm_token":
                        aiTokensRef.current += msg.token;
                        break;

                    case "audio_end": {
                        // When all audio chunks are delivered, wait for playback to finish
                        const waitForPlayback = () => {
                            if (!isPlayingRef.current && playQueueRef.current.length === 0) {
                                // Persist AI message
                                const aiContent = aiTokensRef.current;
                                if (aiContent) {
                                    const aiMsg: any = { role: "assistant", content: aiContent, timestamp: new Date() };
                                    const withAi = [...messagesRef.current, aiMsg];
                                    setMessages(withAi);
                                    messagesRef.current = withAi;
                                    if (chatIdRef.current) {
                                        sendMessageToFirestore(chatIdRef.current, aiMsg).catch(() => { });
                                    }
                                }
                                aiTokensRef.current = "";
                            } else {
                                setTimeout(waitForPlayback, 100);
                            }
                        };
                        waitForPlayback();
                        break;
                    }

                    case "error":
                        console.error("[Voice] Backend error:", msg.message);
                        setPhaseAndAnalyser("listening", micAnalyserRef.current);
                        break;
                }
            } catch { /* non-JSON binary or parse error */ }
        };

        ws.onclose = () => {
            if (isOpenRef.current) {
                // Reconnect after short delay
                setTimeout(() => {
                    if (isOpenRef.current) setupWebSocket();
                }, 1500);
            }
        };

        ws.onerror = (e) => {
            console.warn("[Voice] WebSocket error:", e);
        };
    }, [enqueueAudio, setPhaseAndAnalyser, setMessages, createNewChat, sendMessageToFirestore]);

    // ── Microphone + VAD + PCM streaming ─────────────────────────────────────

    const setupMicAndStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
            micStreamRef.current = stream;

            const ctx = getOrCreateAudioCtx();
            const src = ctx.createMediaStreamSource(stream);

            // Analyser for waveform visualization
            const micAnalyser = ctx.createAnalyser();
            micAnalyser.fftSize = 2048;
            micAnalyser.smoothingTimeConstant = 0.8;
            src.connect(micAnalyser);
            micAnalyserRef.current = micAnalyser;

            // ScriptProcessorNode for PCM capture (4096 samples ≈ 85ms at 48kHz)
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            src.connect(processor);
            processor.connect(ctx.destination); // must connect to run

            processor.onaudioprocess = (e) => {
                if (isMutedRef.current) return;
                const ws = wsRef.current;
                if (!ws || ws.readyState !== WebSocket.OPEN) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const rms = computeRMS(inputData);

                if (rms > SILENCE_RMS_THRESHOLD) {
                    // Speech detected
                    isSpeakingRef.current = true;
                    silenceFramesRef.current = 0;
                    speechFramesRef.current++;
                } else {
                    if (isSpeakingRef.current) {
                        silenceFramesRef.current++;
                        if (silenceFramesRef.current >= SILENCE_FRAMES_NEEDED && speechFramesRef.current >= MIN_SPEECH_FRAMES) {
                            // VAD: end of speech
                            isSpeakingRef.current = false;
                            silenceFramesRef.current = 0;
                            speechFramesRef.current = 0;
                            ws.send(JSON.stringify({ type: "end_of_speech" }));
                            return;
                        }
                    }
                }

                // Stream PCM if speaking (or just entered silence buffer)
                if (isSpeakingRef.current || (silenceFramesRef.current > 0 && silenceFramesRef.current < SILENCE_FRAMES_NEEDED)) {
                    const pcm = downsampleToInt16(inputData, ctx.sampleRate, 16000);
                    ws.send(pcm);
                }
            };

            scriptProcRef.current = processor;
        } catch (err) {
            console.error("[Voice] Mic access denied:", err);
        }
    }, [getOrCreateAudioCtx]);

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!isOpen) return;

        isOpenRef.current = true;
        setPhaseAndAnalyser("idle", null);
        setPartialText("");
        aiTokensRef.current = "";
        playQueueRef.current = [];
        isPlayingRef.current = false;
        chatIdRef.current = activeChatIdRef.current;

        // Start WS then mic
        setupWebSocket();
        setupMicAndStream().then(() => {
            setTimeout(() => {
                if (isOpenRef.current) setPhaseAndAnalyser("listening", micAnalyserRef.current);
            }, 800);
        });

        return () => {
            isOpenRef.current = false;

            // Tear down mic
            if (scriptProcRef.current) {
                scriptProcRef.current.disconnect();
                scriptProcRef.current = null;
            }
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
                micStreamRef.current = null;
            }
            micAnalyserRef.current = null;

            // Stop audio
            stopAllAudio();

            // Close WebSocket
            if (wsRef.current) {
                wsRef.current.onclose = null; // prevent reconnect loop
                wsRef.current.close();
                wsRef.current = null;
            }

            // Close AudioContext
            if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(() => { });
                audioCtxRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // ── Controls ──────────────────────────────────────────────────────────────

    const handleEndCall = useCallback(() => {
        // Cancel any in-progress generation
        wsRef.current?.send(JSON.stringify({ type: "cancel" }));
        stopAllAudio();

        if (scriptProcRef.current) {
            scriptProcRef.current.disconnect();
            scriptProcRef.current = null;
        }
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
        }
        micAnalyserRef.current = null;

        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
            wsRef.current = null;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => { });
            audioCtxRef.current = null;
        }

        setPhase("idle");
        setAnalyserNode(null);
        onClose();
    }, [onClose, stopAllAudio]);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            const next = !prev;
            isMutedRef.current = next;
            if (next) {
                // Flush any in-progress VAD
                isSpeakingRef.current = false;
                silenceFramesRef.current = 0;
                speechFramesRef.current = 0;
            }
            return next;
        });
    }, []);

    // ── Colors (unchanged) ────────────────────────────────────────────────────
    const colors: Record<Phase, string> = {
        idle: "#6366f1",
        listening: "#34d399",
        thinking: "#fbbf24",
        speaking: "#818cf8",
    };
    const color = colors[phase];

    // ─── Render (UNCHANGED UI) ────────────────────────────────────────────────
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="fixed inset-0 z-[200] flex flex-col items-center justify-between overflow-hidden"
                    style={{
                        background: "radial-gradient(circle at center, rgba(20,15,35,0.95) 0%, rgba(5,5,10,0.98) 100%)",
                    }}
                >
                    {/* Ambient Background Glow */}
                    <motion.div
                        className="absolute inset-0 opacity-30 pointer-events-none"
                        animate={{ background: `radial-gradient(circle at 50% 40%, ${color}40 0%, transparent 60%)` }}
                        transition={{ duration: 2 }}
                    />

                    {/* Top Section: Phase Indicator */}
                    <div className="pt-20 flex flex-col items-center gap-3 z-10">
                        <motion.div
                            className="w-3 h-3 rounded-full shadow-lg"
                            style={{ background: color, boxShadow: `0 0 20px ${color}` }}
                            animate={{
                                opacity: phase === "thinking" ? [1, 0.4, 1] : 1,
                                scale: phase === "listening" ? [1, 1.5, 1] : 1,
                            }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <motion.span
                            key={phase}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-sm font-semibold tracking-[0.3em] uppercase"
                            style={{ color }}
                        >
                            {isMuted ? "Muted" : label}
                        </motion.span>
                        {/* Partial transcript / live token display */}
                        {partialText && (
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-xs text-white/40 max-w-xs text-center px-4 leading-relaxed"
                            >
                                {partialText}
                            </motion.p>
                        )}
                    </div>

                    {/* Center Section: Live Waveform */}
                    <div className="flex-1 w-full flex items-center justify-center px-8 z-10">
                        <LiveWaveform analyserNode={analyserNode} phase={phase} />
                    </div>

                    {/* Bottom Section: Controls */}
                    <div className="pb-20 flex flex-col items-center gap-8 z-10">
                        <div className="flex items-center gap-12">
                            {/* Mute Button */}
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={toggleMute}
                                className={cn(
                                    "w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-xl transition-all duration-300",
                                    isMuted
                                        ? "bg-white/20 text-white shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                                        : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                                )}
                                title={isMuted ? "Unmute" : "Mute"}
                            >
                                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                            </motion.button>

                            {/* End Call Button */}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleEndCall}
                                className="w-20 h-20 rounded-full flex items-center justify-center text-white"
                                style={{
                                    background: "#ef4444",
                                    boxShadow: "0 0 40px rgba(239,68,68,0.5), inset 0 0 20px rgba(255,255,255,0.2)",
                                }}
                                title="End Voice Chat"
                            >
                                <PhoneOff className="w-8 h-8" />
                            </motion.button>

                            {/* Spacer */}
                            <div className="w-16 h-16" />
                        </div>

                        <p className="text-xs text-white/30 tracking-widest font-light">
                            Just talk naturally
                        </p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
