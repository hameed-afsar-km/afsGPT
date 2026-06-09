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
                                <p className="text-white/80 text-base">
                                    This AI app offers <span className="text-emerald-400 font-semibold">Free Tier</span> mode out of the box — <strong>no API keys required</strong>.
                                </p>

                                <h3 className="text-white font-semibold pt-2">Free Tier</h3>
                                <ul className="list-disc list-inside space-y-1.5 ml-2 marker:text-white/30">
                                    <li><span className="text-emerald-400 font-medium">Chat & Research</span> — automatically load-balanced across <strong>Gemini 2.5 Flash</strong> and <strong>Groq Llama 3.3-70B</strong></li>
                                    <li><span className="text-emerald-400 font-medium">Image Analysis</span> — powered by <strong>Gemini 2.5 Flash</strong></li>
                                    <li>Chat requests are automatically cycled between Gemini and Groq to stay within rate limits.</li>
                                    <li>Image analysis always uses Gemini for the best vision results.</li>
                                    <li>The green <span className="text-emerald-400">"Free Tier"</span> badge in the chat bar shows which mode is active and can be clicked to switch modes.</li>
                                </ul>

                                <h3 className="text-white font-semibold pt-2">Custom API Mode</h3>
                                <p>You can switch to <span className="text-amber-400 font-medium">Custom API mode</span> anytime from the chat bar to use your own AI provider and API keys.</p>
                                <p>In <strong>Settings</strong>, you can optionally add:</p>
                                <ul className="list-disc list-inside space-y-1.5 ml-2 font-mono text-[0.8rem] marker:text-white/30">
                                    <li><code className="bg-white/5 px-2 py-0.5 rounded text-white/90">GOOGLE_API_KEY</code> (Gemini)</li>
                                    <li><code className="bg-white/5 px-2 py-0.5 rounded text-white/90">OPENAI_API_KEY</code> (OpenAI)</li>
                                    <li><code className="bg-white/5 px-2 py-0.5 rounded text-white/90">ANTHROPIC_API_KEY</code> (Anthropic)</li>
                                    <li><code className="bg-white/5 px-2 py-0.5 rounded text-white/90">GROQ_API_KEY</code> (Groq)</li>
                                </ul>
                                <p>These are completely optional — the Free Tier works without them.</p>
                                <p>When using your own API key, requests are sent directly to your selected provider (no load balancing). You can switch between available models and providers anytime from the model dropdown.</p>

                                <h3 className="text-white font-semibold pt-2">Local AI with Ollama</h3>
                                <p>If you prefer not to use cloud APIs, you can run models locally with <strong>Ollama</strong> by downloading the GitHub repository:</p>
                                <a 
                                    href="https://github.com/hameed-afsar-km/afsGPT" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-block text-violet-400 hover:text-violet-300 underline transition-colors break-all"
                                >
                                    https://github.com/hameed-afsar-km/afsGPT
                                </a>

                                <h3 className="text-white font-semibold pt-2">Please Note</h3>
                                <ul className="list-disc list-inside space-y-1.5 ml-2 marker:text-white/30">
                                    <li>Your API usage, rate limits, and billing are managed by your chosen provider when using Custom API mode.</li>
                                    <li>Some models may require paid API access.</li>
                                    <li>AI responses can sometimes be incorrect, so always verify important information.</li>
                                </ul>

                                <p className="text-center pt-6 text-white text-base font-medium">
                                    Enjoy using the app 🚀
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
