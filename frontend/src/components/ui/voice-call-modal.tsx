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

// ─── Single Live Waveform ─────────────────────────────────────────────────────
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
            ctx.clearRect(0, 0, W, H);

            if (!analyserNode) {
                // Gentle sine idle animation
                const t = performance.now() / 1000;
                ctx.beginPath();
                ctx.lineWidth = 2;
                ctx.strokeStyle = color + "50";
                ctx.shadowColor = color;
                ctx.shadowBlur = 6;
                for (let x = 0; x <= W; x++) {
                    const y = H / 2 + Math.sin((x / W) * Math.PI * 4 + t * 2) * 6;
                    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.stroke();
                return;
            }

            const bufLen = analyserNode.frequencyBinCount;
            const td = new Uint8Array(bufLen);
            analyserNode.getByteTimeDomainData(td);

            ctx.beginPath();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            const sliceW = W / bufLen;
            let x = 0;
            for (let i = 0; i < bufLen; i++) {
                const y = ((td[i] / 128.0) * H) / 2;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                x += sliceW;
            }
            ctx.lineTo(W, H / 2);
            ctx.stroke();

            // Mirror fill glow
            const freq = new Uint8Array(analyserNode.frequencyBinCount);
            analyserNode.getByteFrequencyData(freq);
            const avgVol = freq.reduce((a, b) => a + b, 0) / freq.length;

            if (avgVol > 10) {
                const grad = ctx.createLinearGradient(0, 0, 0, H);
                grad.addColorStop(0, color + "40");
                grad.addColorStop(0.5, color + "10");
                grad.addColorStop(1, "transparent");
                ctx.fillStyle = grad;
                ctx.fill();
            }
        };

        draw();
        return () => cancelAnimationFrame(rafRef.current);
    }, [analyserNode, phase]);

    return (
        <canvas
            ref={canvasRef}
            width={800}
            height={300}
            className="w-full max-w-3xl h-[200px] md:h-[300px] object-contain"
        />
    );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function VoiceCallModal({ isOpen, onClose }: VoiceCallModalProps) {
    const {
        messages,
        setMessages,
        activeChatId,
        createNewChat,
        sendMessageToFirestore,
    } = useChat();

    const [phase, setPhase] = useState<Phase>("idle");
    const [label, setLabel] = useState("Connecting...");
    const [isMuted, setIsMuted] = useState(false);
    const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

    // Refs to prevent stale closures
    const phaseRef = useRef<Phase>("idle");
    const isMutedRef = useRef(false);
    const isOpenRef = useRef(false);
    const messagesRef = useRef<any[]>([]);
    const activeChatIdRef = useRef<string | null>(null);
    const transcriptRef = useRef("");
    const recognitionRef = useRef<any>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const currentAudioRef = useRef<HTMLAudioElement | null>(null);
    const micAnalyserRef = useRef<AnalyserNode | null>(null);
    const aiAnalyserRef = useRef<AnalyserNode | null>(null);

    // Keep refs in sync
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
    useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const setPhaseAndAnalyser = useCallback((p: Phase, analyser: AnalyserNode | null) => {
        setPhase(p);
        setAnalyserNode(analyser);
        setLabel({
            idle: "Connecting...",
            listening: "Listening...",
            thinking: "Thinking...",
            speaking: "Speaking...",
        }[p]);
    }, []);

    const getOrCreateAudioCtx = useCallback(() => {
        if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
            audioCtxRef.current = new AudioContext();
        }
        return audioCtxRef.current;
    }, []);

    const stopAudio = useCallback(() => {
        if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
        }
        aiAnalyserRef.current = null;
    }, []);

    // ── Setup microphone ──────────────────────────────────────────────────────
    const setupMic = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;
            const ctx = getOrCreateAudioCtx();
            const src = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.8;
            src.connect(analyser);
            micAnalyserRef.current = analyser;
        } catch (err) {
            console.error("Mic access denied:", err);
        }
    }, [getOrCreateAudioCtx]);

    // ── Speech → AI → TTS loop ────────────────────────────────────────────────
    const startListening = useCallback(() => {
        if (!isOpenRef.current || isMutedRef.current) return;

        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;

        const recognition = new SR();
        recognitionRef.current = recognition;
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        transcriptRef.current = "";

        recognition.onstart = () => {
            setPhaseAndAnalyser("listening", micAnalyserRef.current);
        };

        recognition.onresult = (event: any) => {
            let interim = "";
            let final = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) final += t;
                else interim += t;
            }
            transcriptRef.current = final || interim;
        };

        recognition.onend = () => {
            const spoken = transcriptRef.current.trim();
            if (!isOpenRef.current) return;

            if (spoken) {
                handleSpokenText(spoken);
            } else {
                // Nothing detected — listen again
                setTimeout(() => {
                    if (isOpenRef.current && phaseRef.current === "listening" && !isMutedRef.current) {
                        startListening();
                    }
                }, 300);
            }
        };

        recognition.onerror = (event: any) => {
            if (event.error === "aborted" || event.error === "no-speech") {
                // silently restart
                if (isOpenRef.current) {
                    setTimeout(() => startListening(), 400);
                }
                return;
            }
            console.error("Speech error:", event.error);
        };

        recognition.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSpokenText = useCallback(async (text: string) => {
        if (!isOpenRef.current) return;

        setPhaseAndAnalyser("thinking", null);

        // Add user message
        const userMsg: any = { role: "user", content: text, timestamp: new Date() };
        const updated = [...messagesRef.current, userMsg];
        setMessages(updated);
        messagesRef.current = updated;

        // Firestore
        let chatId = activeChatIdRef.current;
        try {
            if (!chatId) {
                chatId = await createNewChat(text);
                activeChatIdRef.current = chatId;
            }
            await sendMessageToFirestore(chatId, userMsg);
        } catch { /* non-critical */ }

        // Call AI
        try {
            const provider = localStorage.getItem("afs-provider");
            const model = localStorage.getItem("afs-model");
            const keys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
            const apiKey = provider ? keys[provider] : "";

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: updated, provider, model, apiKey }),
            });

            const data = await res.json();
            const aiContent: string = data.error
                ? `Sorry, I encountered an error: ${data.error}`
                : data.content;

            const aiMsg: any = { role: "assistant", content: aiContent, timestamp: new Date() };
            const withAi = [...messagesRef.current, aiMsg];
            setMessages(withAi);
            messagesRef.current = withAi;

            if (chatId) {
                sendMessageToFirestore(chatId, aiMsg).catch(() => {});
            }

            await speakText(aiContent);
        } catch (err) {
            console.error("AI error:", err);
            // Restart listening
            if (isOpenRef.current) {
                setPhaseAndAnalyser("listening", micAnalyserRef.current);
                setTimeout(() => startListening(), 400);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createNewChat, sendMessageToFirestore, setMessages, setPhaseAndAnalyser]);

    const speakText = useCallback(async (text: string) => {
        if (!isOpenRef.current) return;
        stopAudio();

        try {
            const res = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            if (!res.ok) throw new Error("TTS failed");

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            currentAudioRef.current = audio;

            // Wire up analyser for AI waveform
            const ctx = getOrCreateAudioCtx();
            // MediaElementSourceNode can only be created once per element
            const src = ctx.createMediaElementSource(audio);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.85;
            src.connect(analyser);
            analyser.connect(ctx.destination);
            aiAnalyserRef.current = analyser;

            setPhaseAndAnalyser("speaking", analyser);

            await new Promise<void>((resolve) => {
                audio.onended = () => resolve();
                audio.onerror = () => resolve();
                audio.play().catch(() => resolve());
            });
        } catch (err) {
            console.error("TTS play error:", err);
        }

        // Back to listening
        if (isOpenRef.current) {
            setPhaseAndAnalyser("listening", micAnalyserRef.current);
            setTimeout(() => startListening(), 300);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getOrCreateAudioCtx, setPhaseAndAnalyser, stopAudio]);

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;

        setPhaseAndAnalyser("idle", null);
        transcriptRef.current = "";

        setupMic().then(() => {
            setTimeout(() => {
                if (isOpenRef.current) startListening();
            }, 600);
        });

        return () => {
            // Cleanup on unmount / close
            if (recognitionRef.current) {
                recognitionRef.current.onend = null;
                recognitionRef.current.onerror = null;
                try { recognitionRef.current.stop(); } catch { /* ignore */ }
            }
            stopAudio();
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
                micStreamRef.current = null;
            }
            micAnalyserRef.current = null;
            aiAnalyserRef.current = null;
            if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(() => {});
                audioCtxRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleEndCall = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.onerror = null;
            try { recognitionRef.current.stop(); } catch { /* ignore */ }
        }
        stopAudio();
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
        }
        micAnalyserRef.current = null;
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => {});
            audioCtxRef.current = null;
        }
        setPhase("idle");
        setAnalyserNode(null);
        onClose();
    }, [onClose, stopAudio]);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            const next = !prev;
            isMutedRef.current = next;
            if (next) {
                // Stop listening
                try { recognitionRef.current?.stop(); } catch { /* ignore */ }
            } else if (phaseRef.current === "listening") {
                setTimeout(() => startListening(), 200);
            }
            return next;
        });
    }, [startListening]);

    // ── Color based on phase ──────────────────────────────────────────────────
    const colors: Record<Phase, string> = {
        idle: "#6366f1",
        listening: "#34d399",
        thinking: "#fbbf24",
        speaking: "#818cf8",
    };
    const color = colors[phase];

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
                    {/* Ambient Background Glow based on phase */}
                    <motion.div
                        className="absolute inset-0 opacity-30 pointer-events-none"
                        animate={{
                            background: `radial-gradient(circle at 50% 40%, ${color}40 0%, transparent 60%)`,
                        }}
                        transition={{ duration: 2 }}
                    />

                    {/* Top Section: Phase Indicator */}
                    <div className="pt-20 flex flex-col items-center gap-3 z-10">
                        <motion.div
                            className="w-3 h-3 rounded-full shadow-lg"
                            style={{ 
                                background: color,
                                boxShadow: `0 0 20px ${color}`
                            }}
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
                    </div>

                    {/* Center Section: Huge Live Waveform */}
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
                                {isMuted
                                    ? <MicOff className="w-6 h-6" />
                                    : <Mic className="w-6 h-6" />
                                }
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

                            {/* Placeholder to balance the layout */}
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
