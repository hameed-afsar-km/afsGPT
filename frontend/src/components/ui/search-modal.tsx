"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, MessageSquare } from "lucide-react";
import { collection, query, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";

interface MessageContent {
    id: string;
    content: string;
    role: "user" | "assistant";
}

interface ChatHistoryItem {
    id: string;
    title: string;
    createdAt: any;
}

interface HistorySection {
    section: string;
    items: ChatHistoryItem[];
}

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    chatHistory: HistorySection[];
    user: any;
    onSelectChat: (chatId: string) => void;
}

interface SearchResult {
    chatId: string;
    title: string;
    score: number;
    matchType: "title" | "message";
    snippet?: string;
}

export function SearchModal({ isOpen, onClose, chatHistory, user, onSelectChat }: SearchModalProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [chatContents, setChatContents] = useState<Record<string, MessageContent[]>>({});
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            setSearchQuery("");
        }
    }, [isOpen]);

    // Lazy load messages for full text search
    useEffect(() => {
        if (!searchQuery.trim() || !user || chatHistory.length === 0) return;

        const fetchMissingContents = async () => {
            const allItems = chatHistory.flatMap(s => s.items);
            const missingChatIds = allItems.map(item => item.id).filter(id => !(id in chatContents));

            if (missingChatIds.length === 0) return;

            setIsSearching(true);
            const newContents = { ...chatContents };

            try {
                await Promise.all(missingChatIds.map(async (chatId) => {
                    const msgsQuery = query(collection(db, `users/${user.uid}/chats/${chatId}/messages`));
                    const msgsSnap = await getDocs(msgsQuery);
                    newContents[chatId] = msgsSnap.docs.map(d => ({
                        id: d.id,
                        content: d.data().content || "",
                        role: d.data().role || "user"
                    }));
                }));

                setChatContents(newContents);
            } catch (error) {
                console.error("Error fetching chat contents for search:", error);
            } finally {
                setIsSearching(false);
            }
        };

        fetchMissingContents();
    }, [searchQuery, chatHistory, user]);

    // Rank results
    useEffect(() => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        const queryStr = searchQuery.toLowerCase();
        const allItems = chatHistory.flatMap(s => s.items);
        const ranked: SearchResult[] = [];

        allItems.forEach(item => {
            const titleLower = item.title.toLowerCase();
            let score = 0;
            let matchType: "title" | "message" | null = null;
            let snippet = "";

            if (titleLower.includes(queryStr)) {
                score = 100 + (titleLower === queryStr ? 50 : 0); // Exact match gets bonus
                matchType = "title";
            }

            // Check messages
            const messages = chatContents[item.id] || [];
            let msgScore = 0;
            let msgSnippet = "";
            for (const msg of messages) {
                const contentLower = msg.content.toLowerCase();
                const idx = contentLower.indexOf(queryStr);
                if (idx !== -1) {
                    msgScore += 10; // Add points for message matches
                    if (!msgSnippet) {
                        // Extract a snippet around the match
                        const start = Math.max(0, idx - 40);
                        const end = Math.min(msg.content.length, idx + queryStr.length + 40);
                        msgSnippet = (start > 0 ? "..." : "") + msg.content.substring(start, end) + (end < msg.content.length ? "..." : "");
                    }
                }
            }

            if (msgScore > 0 && score === 0) {
                score = msgScore;
                matchType = "message";
                snippet = msgSnippet;
            } else if (msgScore > 0 && score > 0) {
                score += msgScore; // If title matched, add message score too
                snippet = msgSnippet;
            }

            if (score > 0 && matchType) {
                ranked.push({
                    chatId: item.id,
                    title: item.title,
                    score,
                    matchType,
                    snippet
                });
            }
        });

        // Sort by score descending
        ranked.sort((a, b) => b.score - a.score);
        setResults(ranked);
    }, [searchQuery, chatHistory, chatContents]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh]"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -20 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                        >
                            <div className="relative flex items-center px-4 py-3 border-b border-white/5">
                                <Search className="w-5 h-5 text-white/40 mr-3" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Search through chats and messages..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-lg"
                                />
                                {isSearching && (
                                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mr-3" />
                                )}
                                <button
                                    onClick={onClose}
                                    className="p-1 text-white/40 hover:text-white/80 rounded-lg hover:bg-white/5 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
                                {!searchQuery.trim() ? (
                                    <div className="flex flex-col gap-1">
                                        <h3 className="px-3 py-2 text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                                            Recent Chats
                                        </h3>
                                        {chatHistory.flatMap(s => s.items).slice(0, 5).map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => {
                                                    onSelectChat(item.id);
                                                    onClose();
                                                }}
                                                className="flex flex-col text-left p-3 hover:bg-white/[0.04] rounded-xl transition-colors group"
                                            >
                                                <div className="flex items-center gap-3 w-full">
                                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 group-hover:text-violet-300 transition-colors">
                                                        <MessageSquare className="w-4 h-4 text-white/50 group-hover:text-violet-300" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="text-sm font-medium text-white/90 truncate">
                                                                {item.title}
                                                            </h4>
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                        {chatHistory.flatMap(s => s.items).length === 0 && (
                                            <div className="p-8 text-center text-white/30 text-sm">
                                                No recent conversations
                                            </div>
                                        )}
                                    </div>
                                ) : results.length === 0 ? (
                                    <div className="p-8 text-center text-white/30 text-sm">
                                        No results found for "{searchQuery}"
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {results.map((result) => (
                                            <button
                                                key={result.chatId}
                                                onClick={() => {
                                                    onSelectChat(result.chatId);
                                                    onClose();
                                                }}
                                                className="flex flex-col text-left p-3 hover:bg-white/[0.04] rounded-xl transition-colors group"
                                            >
                                                <div className="flex items-center gap-3 w-full">
                                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 group-hover:text-violet-300 transition-colors">
                                                        <MessageSquare className="w-4 h-4 text-white/50 group-hover:text-violet-300" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="text-sm font-medium text-white/90 truncate">
                                                                {result.title}
                                                            </h4>
                                                            <span className="text-[10px] uppercase tracking-wider text-white/30 ml-2 shrink-0 bg-white/5 px-2 py-0.5 rounded-full">
                                                                {result.matchType} match
                                                            </span>
                                                        </div>
                                                        {result.snippet && (
                                                            <p className="text-xs text-white/40 mt-1 truncate">
                                                                {result.snippet}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
