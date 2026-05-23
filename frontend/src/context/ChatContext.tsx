"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { 
    collection, 
    addDoc, 
    updateDoc, 
    doc, 
    serverTimestamp, 
    onSnapshot, 
    query, 
    orderBy,
    getDocs,
    writeBatch,
    deleteDoc 
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Message {
    id?: string;
    role: "user" | "assistant";
    content: string;
    timestamp: any;
    attachments?: string[];
    isNew?: boolean;
    thumbnails?: string[];
}

export interface GeneratedImage {
    id?: string;
    url: string;
    prompt: string;
    chatId: string;
    timestamp: any;
}

interface ChatContextType {
    activeChatId: string | null;
    setActiveChatId: (id: string | null) => void;
    activeChatTitle: string | null;
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    images: GeneratedImage[];
    createNewChat: (firstMessage: string) => Promise<string>;
    sendMessageToFirestore: (chatId: string, message: Message) => Promise<void>;
    deleteMessagesAfter: (chatId: string, index: number, newMessage?: Message) => Promise<void>;
    saveGeneratedImage: (chatId: string, url: string, prompt: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [activeChatTitle, setActiveChatTitle] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [images, setImages] = useState<GeneratedImage[]>([]);

    // Subscribe to user's generated images
    useEffect(() => {
        if (!user) {
            const offlineImgs = JSON.parse(localStorage.getItem("afs-offline-images") || "[]");
            setImages(offlineImgs);
            return;
        }
        const q = query(
            collection(db, `users/${user.uid}/images`),
            orderBy("timestamp", "desc")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const imgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as GeneratedImage[];
            setImages(imgs);
        });
        return () => unsubscribe();
    }, [user]);

    // Subscribe to messages and title when activeChatId changes (Firestore Mode)
    useEffect(() => {
        if (!user || !activeChatId) {
            if (!activeChatId) {
                setMessages([]);
                setActiveChatTitle(null);
            }
            return;
        }

        if (activeChatId === "IMAGES") {
            setMessages([]);
            setActiveChatTitle("Images");
            return;
        }

        // Fetch title
        const chatDocRef = doc(db, `users/${user.uid}/chats/${activeChatId}`);
        const unsubscribeTitle = onSnapshot(chatDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setActiveChatTitle(docSnap.data().title || "Untitled Chat");
            }
        });

        const q = query(
            collection(db, `users/${user.uid}/chats/${activeChatId}/messages`),
            orderBy("timestamp", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Message[];
            setMessages(msgs);
        });

        return () => {
            unsubscribe();
            unsubscribeTitle();
        };
    }, [user, activeChatId]);

    // Load offline chats and messages when user is null (Guest Mode)
    useEffect(() => {
        if (user || !activeChatId) return;

        if (activeChatId === "IMAGES") {
            setMessages([]);
            setActiveChatTitle("Images");
            return;
        }

        // Load offline chats from LocalStorage
        const offlineChats = JSON.parse(localStorage.getItem("afs-offline-chats") || "[]");
        const activeChat = offlineChats.find((c: any) => c.id === activeChatId);
        if (activeChat) {
            setActiveChatTitle(activeChat.title || "Untitled Chat");
        } else {
            setActiveChatTitle("Untitled Chat");
        }

        // Load offline messages for this chat
        const allOfflineMessages = JSON.parse(localStorage.getItem("afs-offline-messages") || "{}");
        const chatMessages = allOfflineMessages[activeChatId] || [];
        setMessages(chatMessages);
    }, [user, activeChatId]);

    // Sync offline data when user logs in (when user changes from null to a valid user)
    useEffect(() => {
        if (!user) return;

        const syncOfflineData = async () => {
            const offlineChats = JSON.parse(localStorage.getItem("afs-offline-chats") || "[]");
            const allOfflineMessages = JSON.parse(localStorage.getItem("afs-offline-messages") || "{}");
            const offlineImages = JSON.parse(localStorage.getItem("afs-offline-images") || "[]");

            if (offlineChats.length === 0 && offlineImages.length === 0) return;

            console.log("[Offline Sync] Synchronizing offline data to Firebase for user:", user.uid);

            try {
                // Map to track the new Firestore chatId for each offline chatId
                const offlineToOnlineChatIdMap: { [key: string]: string } = {};

                // 1. Sync chats and their messages
                for (const offlineChat of offlineChats) {
                    // Create chat in Firestore
                    const chatRef = await addDoc(collection(db, `users/${user.uid}/chats`), {
                        title: offlineChat.title,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    });

                    offlineToOnlineChatIdMap[offlineChat.id] = chatRef.id;

                    const chatMessages = allOfflineMessages[offlineChat.id] || [];
                    for (const msg of chatMessages) {
                        // Add messages to Firestore
                        await addDoc(collection(db, `users/${user.uid}/chats/${chatRef.id}/messages`), {
                            role: msg.role,
                            content: msg.content,
                            timestamp: serverTimestamp(),
                            attachments: msg.attachments || [],
                            thumbnails: msg.thumbnails || [],
                        });
                    }

                    // If this synced chat was the active chat, update activeChatId to the new Firestore chatId
                    if (activeChatId === offlineChat.id) {
                        setActiveChatId(chatRef.id);
                    }
                }

                // 2. Sync generated images
                for (const img of offlineImages) {
                    const onlineChatId = offlineToOnlineChatIdMap[img.chatId] || img.chatId;
                    await addDoc(collection(db, `users/${user.uid}/images`), {
                        chatId: onlineChatId.startsWith("offline_") ? "" : onlineChatId,
                        url: img.url,
                        prompt: img.prompt,
                        timestamp: serverTimestamp(),
                    });
                }

                console.log("[Offline Sync] Synchronization completed successfully.");

                // Clear offline data from LocalStorage
                localStorage.removeItem("afs-offline-chats");
                localStorage.removeItem("afs-offline-messages");
                localStorage.removeItem("afs-offline-images");

            } catch (error) {
                console.error("[Offline Sync] Synchronization failed:", error);
            }
        };

        syncOfflineData();
    }, [user]);

    const createNewChat = async (firstMessage: string) => {
        if (!user) {
            // Guest/Offline Mode creation
            const newChatId = "offline_" + Date.now();
            const tempTitle = "New Chat...";
            const newChat = {
                id: newChatId,
                title: tempTitle,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const offlineChats = JSON.parse(localStorage.getItem("afs-offline-chats") || "[]");
            offlineChats.unshift(newChat);
            localStorage.setItem("afs-offline-chats", JSON.stringify(offlineChats));

            setActiveChatId(newChatId);
            
            // Asynchronously generate title
            generateAndSetTitle(newChatId, firstMessage);
            return newChatId;
        }

        const tempTitle = "New Chat...";

        const chatRef = await addDoc(collection(db, `users/${user.uid}/chats`), {
            title: tempTitle,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        setActiveChatId(chatRef.id);
        
        // Asynchronously generate title
        generateAndSetTitle(chatRef.id, firstMessage);

        return chatRef.id;
    };

    const generateAndSetTitle = async (chatId: string, firstMessage: string) => {
        try {
            const provider = localStorage.getItem("afs-provider") || "ollama";
            const model = localStorage.getItem("afs-model") || "gemma2:2b";
            const keys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
            const apiKey = provider ? keys[provider] : "";

            const response = await fetch("/api/chat/title", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: firstMessage, provider, model, apiKey }),
            });
            if (response.ok) {
                const data = await response.json();
                if (data.title) {
                    if (user) {
                        await updateDoc(doc(db, `users/${user.uid}/chats`, chatId), {
                            title: data.title
                        });
                    } else {
                        // Offline title update
                        const offlineChats = JSON.parse(localStorage.getItem("afs-offline-chats") || "[]");
                        const chatIndex = offlineChats.findIndex((c: any) => c.id === chatId);
                        if (chatIndex !== -1) {
                            offlineChats[chatIndex].title = data.title;
                            localStorage.setItem("afs-offline-chats", JSON.stringify(offlineChats));
                            if (activeChatId === chatId) {
                                setActiveChatTitle(data.title);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Failed to generate title", error);
        }
    };

    const sendMessageToFirestore = async (chatId: string, message: Message) => {
        if (!user) {
            // Save to offline messages in LocalStorage
            const allOfflineMessages = JSON.parse(localStorage.getItem("afs-offline-messages") || "{}");
            if (!allOfflineMessages[chatId]) {
                allOfflineMessages[chatId] = [];
            }
            
            // Create serializable timestamp
            const serializableMessage = {
                ...message,
                timestamp: new Date().toISOString()
            };
            
            allOfflineMessages[chatId].push(serializableMessage);
            localStorage.setItem("afs-offline-messages", JSON.stringify(allOfflineMessages));

            // Update offline chat's updatedAt field
            const offlineChats = JSON.parse(localStorage.getItem("afs-offline-chats") || "[]");
            const chatIndex = offlineChats.findIndex((c: any) => c.id === chatId);
            if (chatIndex !== -1) {
                offlineChats[chatIndex].updatedAt = new Date().toISOString();
                // Sort chats by updatedAt desc
                offlineChats.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
                localStorage.setItem("afs-offline-chats", JSON.stringify(offlineChats));
            }
            return;
        }

        await addDoc(collection(db, `users/${user.uid}/chats/${chatId}/messages`), {
            ...message,
            timestamp: serverTimestamp(),
        });

        // Update the chat's updatedAt field
        await updateDoc(doc(db, `users/${user.uid}/chats`, chatId), {
            updatedAt: serverTimestamp(),
        });
    };

    const deleteMessagesAfter = async (chatId: string, index: number, newMessage?: Message) => {
        if (!user) {
            const allOfflineMessages = JSON.parse(localStorage.getItem("afs-offline-messages") || "{}");
            if (allOfflineMessages[chatId]) {
                allOfflineMessages[chatId] = allOfflineMessages[chatId].slice(0, index);
                if (newMessage) {
                    allOfflineMessages[chatId].push({
                        ...newMessage,
                        timestamp: new Date().toISOString()
                    });
                }
                localStorage.setItem("afs-offline-messages", JSON.stringify(allOfflineMessages));
            }
            return;
        }

        const q = query(
            collection(db, `users/${user.uid}/chats/${chatId}/messages`),
            orderBy("timestamp", "asc")
        );
        const snapshot = await getDocs(q);
        const docsToDelete = snapshot.docs.slice(index);
        
        const batch = writeBatch(db);
        
        if (docsToDelete.length > 0) {
            docsToDelete.forEach(d => batch.delete(d.ref));
        }

        if (newMessage) {
            const newMessageRef = doc(collection(db, `users/${user.uid}/chats/${chatId}/messages`));
            batch.set(newMessageRef, {
                ...newMessage,
                timestamp: serverTimestamp()
            });
            const chatRef = doc(db, `users/${user.uid}/chats`, chatId);
            batch.update(chatRef, { updatedAt: serverTimestamp() });
        }
        
        await batch.commit();
    };

    const saveGeneratedImage = async (chatId: string, url: string, prompt: string) => {
        if (!user) {
            const offlineImgs = JSON.parse(localStorage.getItem("afs-offline-images") || "[]");
            offlineImgs.unshift({
                chatId,
                url,
                prompt,
                timestamp: new Date().toISOString()
            });
            localStorage.setItem("afs-offline-images", JSON.stringify(offlineImgs));
            setImages(offlineImgs);
            return;
        }

        await addDoc(collection(db, `users/${user.uid}/images`), {
            chatId,
            url,
            prompt,
            timestamp: serverTimestamp()
        });
    };

    return (
        <ChatContext.Provider value={{ 
            activeChatId, 
            setActiveChatId, 
            activeChatTitle,
            messages, 
            setMessages,
            images,
            createNewChat,
            sendMessageToFirestore,
            deleteMessagesAfter,
            saveGeneratedImage
        }}>
            {children}
        </ChatContext.Provider>
    );
}

export const useChat = () => {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error("useChat must be used within a ChatProvider");
    }
    return context;
};
