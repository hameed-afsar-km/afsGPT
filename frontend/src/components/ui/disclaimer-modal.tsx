"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, CheckCircle2 } from "lucide-react";

export function DisclaimerModal() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const hasAgreed = sessionStorage.getItem("afs-disclaimer-agreed");
        if (!hasAgreed) {
            // Small delay for better UX
            const timer = setTimeout(() => setIsVisible(true), 800);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAgree = () => {
        sessionStorage.setItem("afs-disclaimer-agreed", "true");
        setIsVisible(false);
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
                        className="relative w-full max-w-lg bg-[#0d0d0d] border border-white/10 rounded-[2rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)]"
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
                                    Disclaimer
                                </h2>
                                <p className="text-white/40 leading-relaxed">
                                    Welcome to Afs AI. Please read and agree to our terms before proceeding.
                                </p>
                            </div>

                            <div className="space-y-4 text-sm text-white/60 leading-relaxed max-h-48 overflow-y-auto custom-scrollbar pr-2 text-center">
                                <p>
                                    This is an experimental AI interface. While we strive for accuracy, the AI may occasionally generate incorrect or biased information.
                                </p>
                                <p>
                                    By using this service, you acknowledge that you understand the limitations of large language models and agree not to use the service for critical decision-making or sensitive tasks.
                                </p>
                                <p>
                                    Your data is handled securely, but please avoid sharing highly confidential or personal information during your chat sessions.
                                </p>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleAgree}
                                className="w-full bg-white text-black py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:bg-white/90 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>I Agree & Continue</span>
                            </motion.button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
