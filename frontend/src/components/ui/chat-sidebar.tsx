"use client";
import {
    Plus,
    MessageSquare,
    Search,
    MoreHorizontal,
    UserCircle,
    Settings,
    History,
    PanelLeftClose,
    PanelLeftOpen,
    Pencil,
    Trash2,
    Check,
    X,
    LogOut,
    LogIn,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import {
    collection,
    query,
    onSnapshot,
    orderBy,
    addDoc,
    deleteDoc,
    doc,
    updateDoc,
    serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SettingsDialog } from "./settings-dialog";

interface ChatHistoryItem {
    id: string;
    title: string;
    createdAt: any;
}

interface HistorySection {
    section: string;
    items: ChatHistoryItem[];
}


import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useChat } from "@/context/ChatContext";

export function ChatSidebar() {
    const { user, login, logout } = useAuth();
    const { activeChatId, setActiveChatId } = useChat();
    const [isOpen, setIsOpen] = useState(true);
    const [chatHistory, setChatHistory] = useState<HistorySection[]>([]);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    useEffect(() => {
        if (!user) {
            setChatHistory([]);
            return;
        }

        const q = query(
            collection(db, `users/${user.uid}/chats`),
            orderBy("updatedAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ChatHistoryItem[];

            // Group by date (simplified for demo)
            const grouped: HistorySection[] = [
                {
                    section: "Recent Chats",
                    items: items
                }
            ];
            setChatHistory(grouped);
        });

        return () => unsubscribe();
    }, [user]);

    const handleNewChat = () => {
        setActiveChatId(null);
    };

    const handleDelete = async (id: string) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, `users/${user.uid}/chats`, id));
            if (activeChatId === id) setActiveChatId(null);
            setMenuOpenId(null);
        } catch (error) {
            console.error("Error deleting chat:", error);
        }
    };

    const startEditing = (item: ChatHistoryItem) => {
        setEditingId(item.id);
        setEditValue(item.title);
        setMenuOpenId(null);
    };

    const saveRename = async () => {
        if (editingId && editValue.trim() && user) {
            try {
                await updateDoc(doc(db, `users/${user.uid}/chats`, editingId), {
                    title: editValue,
                    updatedAt: serverTimestamp()
                });
            } catch (error) {
                console.error("Error renaming chat:", error);
            }
        }
        setEditingId(null);
    };

    return (
        <>
            <motion.div
                initial={false}
                animate={{ width: isOpen ? 260 : 0 }}
                className={cn(
                    "relative flex flex-col backdrop-blur-xl bg-white/[0.02] border-r border-white/5 h-screen overflow-hidden shrink-0",
                    !isOpen && "border-none"
                )}
            >
                {/* Grain Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay" 
                     style={{ 
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` 
                     }} 
                />

                <div className="flex flex-col h-full w-[260px] relative z-10">
                    {/* Header */}
                    <div className="p-3 flex items-center justify-between">
                        <motion.button
                            onClick={handleNewChat}
                            whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/90 text-sm font-medium transition-colors w-full group"
                        >
                            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                                <Plus className="w-4 h-4" />
                            </div>
                            <span>New chat</span>
                        </motion.button>

                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 text-white/40 hover:text-white/90 rounded-lg transition-colors ml-1"
                        >
                            <PanelLeftClose className="w-4 h-4" />
                        </button>
                    </div>

                    {/* History */}
                    <div className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
                        {user ? (
                            chatHistory.map((section) => (
                                <div key={section.section} className="mb-6">
                                    <h3 className="px-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                                        {section.section}
                                    </h3>
                                    <div className="space-y-0.5">
                                        {section.items.map((item) => (
                                            <div key={item.id} className="relative group/item">
                                                {editingId === item.id ? (
                                                    <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-lg mx-1">
                                                        <input
                                                            autoFocus
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && saveRename()}
                                                            onBlur={saveRename}
                                                            className="bg-transparent text-sm text-white outline-none flex-1 min-w-0"
                                                        />
                                                        <div className="flex gap-1">
                                                            <button onClick={saveRename} className="p-0.5 hover:text-green-400">
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => setEditingId(null)} className="p-0.5 hover:text-red-400">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/60 transition-all group relative overflow-hidden",
                                                            activeChatId === item.id 
                                                                ? "bg-white/5 text-white/90 shadow-sm" 
                                                                : "hover:bg-white/[0.03] hover:text-white/80"
                                                        )}
                                                    >
                                                        <button 
                                                            onClick={() => setActiveChatId(item.id)}
                                                            className="flex-1 flex items-center gap-3 overflow-hidden"
                                                        >
                                                            <MessageSquare className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-70" />
                                                            <span className="truncate text-left">{item.title}</span>
                                                        </button>
                                                        
                                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setMenuOpenId(menuOpenId === item.id ? null : item.id);
                                                                }}
                                                                className={cn(
                                                                    "p-1 hover:bg-white/10 rounded transition-colors",
                                                                    menuOpenId === item.id && "bg-white/10 opacity-100"
                                                                )}
                                                            >
                                                                <MoreHorizontal className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <AnimatePresence>
                                                    {menuOpenId === item.id && (
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                                            className="absolute right-0 top-full mt-1 z-50 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl p-1 min-w-[120px] overflow-hidden"
                                                        >
                                                            <button
                                                                onClick={() => startEditing(item)}
                                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white rounded transition-colors text-left"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                                <span>Rename</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(item.id)}
                                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors text-left"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                <span>Delete</span>
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                            )) : (
                            <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-4">
                                <div className="p-3 rounded-full bg-white/5">
                                    <LogIn className="w-6 h-6 text-white/20" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm text-white/90 font-medium">Please sign in</p>
                                    <p className="text-xs text-white/40">Log in to save your chat history and settings.</p>
                                </div>
                                <button
                                    onClick={login}
                                    className="w-full py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-white/90 transition-colors"
                                >
                                    Sign in with Google
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-3 border-t border-white/5 space-y-1">
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/[0.03] hover:text-white/90 transition-all group"
                        >
                            <Settings className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                            <span>Settings</span>
                        </button>
                        {user ? (
                            <button
                                onClick={logout}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/[0.03] hover:text-white/90 transition-all group"
                            >
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt="Avatar" className="w-5 h-5 rounded-full" />
                                ) : (
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-500 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                                        {user.displayName?.[0] || user.email?.[0] || "U"}
                                    </div>
                                )}
                                <span className="flex-1 text-left truncate">{user.displayName || user.email}</span>
                                <LogOut className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40" />
                            </button>
                        ) : (
                            <button
                                onClick={login}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/[0.03] hover:text-white/90 transition-all group"
                            >
                                <LogIn className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                                <span>Sign in</span>
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Open Toggle (when closed) */}
            {!isOpen && (
                <div className="fixed top-4 left-4 z-50">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="p-2.5 bg-[#0d0d0d] border border-white/10 text-white/60 hover:text-white/90 rounded-xl transition-all shadow-xl backdrop-blur-md"
                    >
                        <PanelLeftOpen className="w-5 h-5" />
                    </button>
                </div>
            )}

            <SettingsDialog isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </>
    );
}
