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

// ─── Full-Screen Waveform ─────────────────────────────────────────────────────
function FullScreenWaveform({
    analyserNode,
    phase,
}: {
    analyserNode: AnalyserNode | null;
    phase: Phase;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);

    const phaseConfig = {
        idle: { color: "#ffffff", glow: "#ffffff" },
        listening: { color: "#ffffff", glow: "#ffffff" },
        thinking: { color: "#a78bfa", glow: "#8b5cf6" }, // Purple
        speaking: { color: "#38bdf8", glow: "#0284c7" }, // Blue
    }[phase];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        const { color, glow } = phaseConfig;

        const draw = () => {
            rafRef.current = requestAnimationFrame(draw);
            
            // Handle resizing gracefully
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;
            }
            const W = canvas.width;
            const H = canvas.height;
            
            ctx.clearRect(0, 0, W, H);

            if (!analyserNode) {
                // Smooth sine wave for idle/thinking
                const t = performance.now() / 1000;
                ctx.beginPath();
                ctx.lineWidth = 4;
                ctx.strokeStyle = color;
                ctx.shadowColor = glow;
                ctx.shadowBlur = phase === "thinking" ? 30 : 15;
                ctx.lineJoin = "round";
                ctx.lineCap = "round";
                
                const speed = phase === "thinking" ? 4 : 2;
                const amplitude = phase === "thinking" ? 15 : 5;
                
                for (let x = 0; x <= W; x += 2) {
                    // Taper off the edges for a clean line
                    const taper = Math.sin((x / W) * Math.PI);
                    const y = H / 2 + Math.sin((x / W) * Math.PI * 6 + t * speed) * amplitude * taper;
                    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.stroke();
                return;
            }

            const bufLen = analyserNode.frequencyBinCount;
            const td = new Uint8Array(bufLen);
            analyserNode.getByteTimeDomainData(td);

            ctx.beginPath();
            ctx.lineWidth = 6;
            ctx.strokeStyle = color;
            ctx.shadowColor = glow;
            ctx.shadowBlur = 25;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            const sliceW = W / bufLen;
            let x = 0;
            for (let i = 0; i < bufLen; i++) {
                // Taper the waveform at the edges
                const taper = Math.sin((i / bufLen) * Math.PI);
                const v = td[i] / 128.0; // 0 to 2
                const y = (H / 2) + ((v - 1) * (H / 2) * taper * 1.5); // scale amplitude and apply taper
                
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                x += sliceW;
            }
            ctx.stroke();

            // Frequency based glow/fill below the wave
            const freq = new Uint8Array(analyserNode.frequencyBinCount);
            analyserNode.getByteFrequencyData(freq);
            const avgVol = freq.reduce((a, b) => a + b, 0) / freq.length;

            if (avgVol > 5) {
                const grad = ctx.createLinearGradient(0, H/2 - 50, 0, H/2 + 50);
                grad.addColorStop(0, "transparent");
                grad.addColorStop(0.5, glow + "40");
                grad.addColorStop(1, "transparent");
                
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, W, H);
            }
        };

        draw();
        return () => cancelAnimationFrame(rafRef.current);
    }, [analyserNode, phase, phaseConfig]);

    return (
        <div className="w-full max-w-4xl h-48 relative">
            {/* Soft background glow reflecting the phase */}
            <motion.div 
                className="absolute inset-0 blur-[100px] opacity-20 pointer-events-none rounded-full"
                animate={{ backgroundColor: phaseConfig.glow }}
                transition={{ duration: 1 }}
            />
            <canvas ref={canvasRef} className="w-full h-full relative z-10" />
        </div>
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
                setTimeout(() => {
                    if (isOpenRef.current && phaseRef.current === "listening") {
                        startListening();
                    }
                }, 300);
            }
        };

        recognition.onerror = (event: any) => {
            if (event.error === "aborted" || event.error === "no-speech") {
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

        const userMsg: any = { role: "user", content: text, timestamp: new Date() };
        const updated = [...messagesRef.current, userMsg];
        setMessages(updated);
        messagesRef.current = updated;

        let chatId = activeChatIdRef.current;
        try {
            if (!chatId) {
                chatId = await createNewChat(text);
                activeChatIdRef.current = chatId;
            }
            await sendMessageToFirestore(chatId, userMsg);
        } catch { /* non-critical */ }

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

            const ctx = getOrCreateAudioCtx();
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
                try { recognitionRef.current?.stop(); } catch { /* ignore */ }
            } else if (phaseRef.current === "listening") {
                setTimeout(() => startListening(), 200);
            }
            return next;
        });
    }, [startListening]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[300] flex flex-col items-center justify-between bg-[#0a0a0a] overflow-hidden font-sans"
                >
                    {/* Top Header */}
                    <div className="w-full p-8 flex items-center justify-center">
                        <motion.span
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-white/40 text-sm font-medium tracking-widest uppercase"
                        >
                            {label}
                        </motion.span>
                    </div>

                    {/* Central Huge Waveform */}
                    <div className="flex-1 flex w-full items-center justify-center px-10">
                        <FullScreenWaveform analyserNode={analyserNode} phase={phase} />
                    </div>

                    {/* Bottom Controls */}
                    <div className="w-full pb-16 flex flex-col items-center gap-8 relative z-20">
                        <div className="flex items-center gap-8">
                            {/* Mute Button */}
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={toggleMute}
                                className={cn(
                                    "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300",
                                    isMuted
                                        ? "bg-white text-black"
                                        : "bg-white/10 text-white hover:bg-white/20"
                                )}
                            >
                                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                            </motion.button>

                            {/* End Call Button */}
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={handleEndCall}
                                className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500 text-white"
                            >
                                <PhoneOff className="w-6 h-6" />
                            </motion.button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
