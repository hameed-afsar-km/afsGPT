"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, CheckCircle2 } from "lucide-react";

export function DisclaimerModal() {
    const [isVisible, setIsVisible] = useState(false);
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const hasAgreed = sessionStorage.getItem("afs-disclaimer-agreed");
        if (!hasAgreed) {
            // Small delay for better UX
            const timer = setTimeout(() => setIsVisible(true), 800);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAgree = () => {
        if (!hasScrolledToBottom) return;
        sessionStorage.setItem("afs-disclaimer-agreed", "true");
        setIsVisible(false);
    };

    const handleScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        // Check if we are within 10px of the bottom
        if (scrollTop + clientHeight >= scrollHeight - 10) {
            setHasScrolledToBottom(true);
        }
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        onClick={(e) => e.stopPropagation()}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="relative w-full max-w-lg md:max-w-2xl bg-[#0d0d0d] border border-white/10 rounded-[2rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)]"
                    >
                        {/* Gradient Glow */}
                        <div className="absolute -top-24 -left-24 w-48 h-48 bg-violet-600/20 rounded-full blur-[80px]" />
                        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-fuchsia-600/20 rounded-full blur-[80px]" />

                        <div className="relative p-8 md:p-10 space-y-6 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-2">
                                <Info className="w-8 h-8 text-white/80" />
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-3xl font-medium tracking-tight text-white">
                                    Before You Continue
                                </h2>
                            </div>

                            <div 
                                ref={scrollContainerRef}
                                onScroll={handleScroll}
                                className="space-y-4 text-sm text-white/60 leading-relaxed max-h-[26rem] overflow-y-auto custom-scrollbar pr-4 text-left"
                            >
                                <p>
                                    This AI app can work in two ways:
                                </p>
                                <ul className="list-disc list-inside space-y-1 ml-2 marker:text-white/30">
                                    <li>Using your own AI API keys (recommended for online access)</li>
                                    <li>Running locally with Ollama</li>
                                </ul>

                                <p className="mt-4">
                                    In Settings, you can optionally add:
                                </p>
                                <ul className="list-disc list-inside space-y-2 ml-2 font-mono text-[0.8rem] marker:text-white/30">
                                    <li><code className="bg-white/5 px-2 py-0.5 rounded text-white/90">GEMINI_API_KEY</code></li>
                                    <li><code className="bg-white/5 px-2 py-0.5 rounded text-white/90">OPENAI_API_KEY</code></li>
                                    <li><code className="bg-white/5 px-2 py-0.5 rounded text-white/90">ANTHROPIC_API_KEY</code></li>
                                </ul>

                                <p>These are completely optional.</p>

                                <p>
                                    If you add an API key, you’ll be able to use supported cloud models directly from the website.
                                    You can switch between available models anytime from the model dropdown in the chat screen.
                                </p>

                                <div className="pt-2 space-y-2">
                                    <p className="font-medium text-white/90">Don’t want to use APIs?</p>
                                    <p>
                                        You can run everything locally using Ollama by downloading the GitHub repo below:
                                    </p>
                                    <a 
                                        href="https://github.com/hameed-afsar-km/afsGPT" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-block text-violet-400 hover:text-violet-300 underline transition-colors break-all"
                                    >
                                        https://github.com/hameed-afsar-km/afsGPT
                                    </a>
                                </div>

                                <div className="pt-2 space-y-2">
                                    <p className="font-medium text-white/90">Please note:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2 marker:text-white/30">
                                        <li>Your API usage, limits, and billing are managed by your provider.</li>
                                        <li>Some models may require paid access.</li>
                                        <li>AI responses can sometimes be incorrect, so verify important information.</li>
                                    </ul>
                                </div>

                                <p className="text-center pt-6 text-white text-base font-medium">
                                    Enjoy using the app 🚀
                                </p>
                            </div>

                            <motion.button
                                whileHover={hasScrolledToBottom ? { scale: 1.02 } : {}}
                                whileTap={hasScrolledToBottom ? { scale: 0.98 } : {}}
                                onClick={handleAgree}
                                disabled={!hasScrolledToBottom}
                                className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] ${
                                    hasScrolledToBottom 
                                    ? "bg-white text-black hover:bg-white/90 cursor-pointer" 
                                    : "bg-white/10 text-white/40 cursor-not-allowed border border-white/5 shadow-none"
                                }`}
                            >
                                <CheckCircle2 className={`w-4 h-4 ${hasScrolledToBottom ? "text-black" : "text-white/20"}`} />
                                <span>{hasScrolledToBottom ? "I Agree & Continue" : "Please Scroll to Bottom"}</span>
                            </motion.button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
