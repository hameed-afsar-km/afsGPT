"use client";

import { X, Moon, Sun, Monitor, Bell, Shield, User, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Key, Save, CheckCircle2 } from "lucide-react";
import { ConfirmModal } from "./confirm-modal";

interface SettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
    const { user, logout, login } = useAuth();
    const [activeTab, setActiveTab] = useState("General");
    const [apiKeys, setApiKeys] = useState<{ [key: string]: string }>({
        openai: "",
        gemini: "",
        anthropic: ""
    });
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [isClearHistoryModalOpen, setIsClearHistoryModalOpen] = useState(false);
    const [isClearFilesModalOpen, setIsClearFilesModalOpen] = useState(false);

    useEffect(() => {
        const savedKeys = localStorage.getItem("afs-keys");
        if (savedKeys) {
            try {
                setApiKeys(JSON.parse(savedKeys));
            } catch (e) {
                console.error("Error parsing API keys from local storage", e);
            }
        }
    }, [isOpen]);

    const handleSaveKeys = () => {
        localStorage.setItem("afs-keys", JSON.stringify(apiKeys));
        setSaveStatus("Saved successfully!");
        setTimeout(() => setSaveStatus(null), 3000);
    };

    const handleSwitchAccount = async () => {
        await login();
        onClose();
    };

    const clearHistory = async () => {
        if (!user) return;
        
        try {
            const q = collection(db, `users/${user.uid}/chats`);
            const snapshot = await getDocs(q);
            const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, `users/${user.uid}/chats`, d.id)));
            
            const imgQ = collection(db, `users/${user.uid}/images`);
            const imgSnapshot = await getDocs(imgQ);
            const imgDeletePromises = imgSnapshot.docs.map(d => deleteDoc(doc(db, `users/${user.uid}/images`, d.id)));

            await Promise.all([...deletePromises, ...imgDeletePromises]);
            onClose();
        } catch (error) {
            console.error("Error clearing history:", error);
        }
    };

    const clearFiles = async () => {
        try {
            const res = await fetch("/api/rag/clear-all", { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to clear files");
            setIsClearFilesModalOpen(false);
            // Optional: Show a success toast here if desired
        } catch (error) {
            console.error("Error clearing files:", error);
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
                                <SettingsTab icon={<User className="w-4 h-4" />} label="General" active={activeTab === "General"} onClick={() => setActiveTab("General")} />
                                <SettingsTab icon={<Key className="w-4 h-4" />} label="API Keys" active={activeTab === "API Keys"} onClick={() => setActiveTab("API Keys")} />
                                <SettingsTab icon={<Bell className="w-4 h-4" />} label="Notifications" active={activeTab === "Notifications"} onClick={() => setActiveTab("Notifications")} />
                                <SettingsTab icon={<Shield className="w-4 h-4" />} label="Security" active={activeTab === "Security"} onClick={() => setActiveTab("Security")} />
                                <SettingsTab icon={<Globe className="w-4 h-4" />} label="Language" active={activeTab === "Language"} onClick={() => setActiveTab("Language")} />
                            </div>

                            {/* Panel */}
                            <div className="flex-1 p-8 space-y-8 overflow-y-auto custom-scrollbar">
                                {activeTab === "General" && (
                                    <section className="space-y-4">
                                        <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider">Account & Data</h3>
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-white/90 font-medium">Switch Account</p>
                                                    <p className="text-xs text-white/40">Log out and sign in with a different Google account</p>
                                                </div>
                                                <button 
                                                    onClick={handleSwitchAccount}
                                                    className="px-4 py-2 bg-white/10 text-white text-xs font-medium rounded-lg hover:bg-white/20 transition-colors border border-white/10"
                                                >
                                                    Switch Account
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-white/90 font-medium">Clear all chats</p>
                                                    <p className="text-xs text-white/40">Permanently delete your entire chat history</p>
                                                </div>
                                                <button 
                                                    onClick={() => setIsClearHistoryModalOpen(true)}
                                                    className="px-4 py-2 bg-red-500/10 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/20 transition-colors border border-red-500/20"
                                                >
                                                    Clear history
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-white/90 font-medium">Clear uploaded files</p>
                                                    <p className="text-xs text-white/40">Permanently delete all files from the vector database</p>
                                                </div>
                                                <button 
                                                    onClick={() => setIsClearFilesModalOpen(true)}
                                                    className="px-4 py-2 bg-red-500/10 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/20 transition-colors border border-red-500/20"
                                                >
                                                    Clear files
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-white/90 font-medium">Export data</p>
                                                    <p className="text-xs text-white/40">Download a copy of your chat history</p>
                                                </div>
                                                <button 
                                                    onClick={() => alert("Export feature is coming soon!")}
                                                    className="px-4 py-2 bg-white/5 text-white/90 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors border border-white/10"
                                                >
                                                    Export
                                                </button>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {activeTab === "API Keys" && (
                                    <section className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider">API Configuration</h3>
                                            {saveStatus && (
                                                <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium animate-in fade-in slide-in-from-right-2">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    {saveStatus}
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-5">
                                            {["openai", "gemini", "anthropic"].map((provider) => (
                                                <div key={provider} className="space-y-2">
                                                    <label className="text-xs font-medium text-white/60 capitalize">
                                                        {provider === "openai" ? "OpenAI API Key" : 
                                                         provider === "gemini" ? "Google Gemini API Key" : 
                                                         "Anthropic API Key"}
                                                    </label>
                                                    <div className="relative group">
                                                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-violet-400 transition-colors" />
                                                        <input
                                                            type="password"
                                                            value={apiKeys[provider] || ""}
                                                            onChange={(e) => setApiKeys({ ...apiKeys, [provider]: e.target.value })}
                                                            placeholder={`Enter ${provider} key`}
                                                            className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/10 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.06] transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            <div className="pt-4">
                                                <button 
                                                    onClick={handleSaveKeys}
                                                    className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-900/20 transition-all active:scale-[0.98]"
                                                >
                                                    <Save className="w-4 h-4" />
                                                    Save API Keys
                                                </button>
                                                <p className="text-[10px] text-white/20 text-center mt-3 uppercase tracking-widest">
                                                    Keys are stored locally on your device
                                                </p>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {["Notifications", "Security", "Language"].includes(activeTab) && (
                                    <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50">
                                        {activeTab === "Notifications" && <Bell className="w-12 h-12 text-white/20" />}
                                        {activeTab === "Security" && <Shield className="w-12 h-12 text-white/20" />}
                                        {activeTab === "Language" && <Globe className="w-12 h-12 text-white/20" />}
                                        <p className="text-sm text-white/50">{activeTab} settings are coming soon.</p>
                                    </div>
                                )}
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
                    <ConfirmModal
                        isOpen={isClearHistoryModalOpen}
                        onClose={() => setIsClearHistoryModalOpen(false)}
                        onConfirm={clearHistory}
                        title="Clear All Chat History"
                        description="Are you absolutely sure you want to delete all your chat history? This action cannot be undone and will permanently remove all your data."
                        confirmText="Clear Everything"
                        isDestructive={true}
                    />
                    <ConfirmModal
                        isOpen={isClearFilesModalOpen}
                        onClose={() => setIsClearFilesModalOpen(false)}
                        onConfirm={clearFiles}
                        title="Clear All Uploaded Files"
                        description="Are you absolutely sure you want to delete all uploaded documents from the vector database? This action cannot be undone."
                        confirmText="Clear Files"
                        isDestructive={true}
                    />
                </div>
            )}
        </AnimatePresence>
    );
}

function SettingsTab({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
    return (
        <button 
            onClick={onClick}
            className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active ? "bg-white/10 text-white font-medium shadow-sm" : "text-white/40 hover:bg-white/5 hover:text-white/70"
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

function ThemeCard({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
    return (
        <button 
            onClick={onClick}
            className={cn(
                "flex flex-col items-center gap-3 p-4 rounded-xl border transition-all",
                active ? "bg-white/10 border-white/30 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]" : "bg-white/[0.02] border-white/5 text-white/40 hover:bg-white/5 hover:border-white/10 hover:text-white/70"
            )}
        >
            {icon}
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
}
