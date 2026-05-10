"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    isDestructive = true,
}: ConfirmModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col p-6"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "p-2.5 rounded-xl border",
                                    isDestructive 
                                        ? "bg-red-500/10 border-red-500/20 text-red-400" 
                                        : "bg-violet-500/10 border-violet-500/20 text-violet-400"
                                )}>
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
                            </div>
                            <button 
                                onClick={onClose}
                                className="p-2 -mr-2 -mt-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        
                        <p className="text-sm text-white/60 leading-relaxed mb-8">
                            {description}
                        </p>

                        <div className="flex justify-end gap-3">
                            <button 
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                            >
                                {cancelText}
                            </button>
                            <button 
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className={cn(
                                    "px-5 py-2 text-sm font-semibold rounded-xl transition-all shadow-lg",
                                    isDestructive
                                        ? "bg-red-500 hover:bg-red-600 text-white shadow-red-900/20"
                                        : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-900/20"
                                )}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
