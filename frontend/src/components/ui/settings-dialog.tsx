"use client";

import { X, Moon, Sun, Monitor, Bell, Shield, User, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
    const { user } = useAuth();

    const clearHistory = async () => {
        if (!user) return;
        if (!confirm("Are you sure you want to clear all chat history? This cannot be undone.")) return;

        try {
            const q = collection(db, `users/${user.uid}/chats`);
            const snapshot = await getDocs(q);
            const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, `users/${user.uid}/chats`, d.id)));
            await Promise.all(deletePromises);
            onClose();
        } catch (error) {
            console.error("Error clearing history:", error);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-2xl bg-[#0d0d0d] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-white">Settings</h2>
                            <button 
                                onClick={onClose}
                                className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto flex">
                            {/* Tabs */}
                            <div className="w-48 border-r border-white/5 p-2 space-y-1">
                                <SettingsTab icon={<User className="w-4 h-4" />} label="General" active />
                                <SettingsTab icon={<Moon className="w-4 h-4" />} label="Appearance" />
                                <SettingsTab icon={<Bell className="w-4 h-4" />} label="Notifications" />
                                <SettingsTab icon={<Shield className="w-4 h-4" />} label="Security" />
                                <SettingsTab icon={<Globe className="w-4 h-4" />} label="Language" />
                            </div>

                            {/* Panel */}
                            <div className="flex-1 p-8 space-y-8">
                                <section className="space-y-4">
                                    <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider">General</h3>
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-white/90 font-medium">Clear all chats</p>
                                                <p className="text-xs text-white/40">Permanently delete your entire chat history</p>
                                            </div>
                                            <button 
                                                onClick={clearHistory}
                                                className="px-4 py-2 bg-red-500/10 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/20 transition-colors border border-red-500/20"
                                            >
                                                Clear history
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-white/90 font-medium">Export data</p>
                                                <p className="text-xs text-white/40">Download a copy of your chat history</p>
                                            </div>
                                            <button className="px-4 py-2 bg-white/5 text-white/90 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors border border-white/10">
                                                Export
                                            </button>
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-4 pt-4 border-t border-white/5">
                                    <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider">Appearance</h3>
                                    <div className="grid grid-cols-3 gap-3">
                                        <ThemeCard icon={<Sun className="w-4 h-4" />} label="Light" />
                                        <ThemeCard icon={<Moon className="w-4 h-4" />} label="Dark" active />
                                        <ThemeCard icon={<Monitor className="w-4 h-4" />} label="System" />
                                    </div>
                                </section>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-white/[0.02] border-t border-white/5 flex justify-end gap-3">
                            <button 
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={onClose}
                                className="px-6 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors shadow-lg"
                            >
                                Save Changes
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

function SettingsTab({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
    return (
        <button className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            active ? "bg-white/10 text-white font-medium" : "text-white/40 hover:bg-white/5 hover:text-white/70"
        )}>
            {icon}
            <span>{label}</span>
        </button>
    );
}

function ThemeCard({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
    return (
        <button className={cn(
            "flex flex-col items-center gap-3 p-4 rounded-xl border transition-all",
            active ? "bg-white/10 border-white/20 text-white shadow-xl" : "bg-white/[0.02] border-white/5 text-white/40 hover:bg-white/5 hover:border-white/10"
        )}>
            {icon}
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
}
