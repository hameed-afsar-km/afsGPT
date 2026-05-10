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
}

interface ChatContextType {
    activeChatId: string | null;
    setActiveChatId: (id: string | null) => void;
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    createNewChat: (firstMessage: string) => Promise<string>;
    sendMessageToFirestore: (chatId: string, message: Message) => Promise<void>;
    deleteMessagesAfter: (chatId: string, index: number) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);

    // Subscribe to messages when activeChatId changes
    useEffect(() => {
        if (!user || !activeChatId) {
            if (!activeChatId) setMessages([]);
            return;
        }

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

        return () => unsubscribe();
    }, [user, activeChatId]);

    const createNewChat = async (firstMessage: string) => {
        if (!user) throw new Error("User must be logged in");

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
            const provider = localStorage.getItem("afs-provider");
            const model = localStorage.getItem("afs-model");
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
                    await updateDoc(doc(db, `users/${user.uid}/chats`, chatId), {
                        title: data.title
                    });
                }
            }
        } catch (error) {
            console.error("Failed to generate title", error);
        }
    };

    const sendMessageToFirestore = async (chatId: string, message: Message) => {
        if (!user) return;

        await addDoc(collection(db, `users/${user.uid}/chats/${chatId}/messages`), {
            ...message,
            timestamp: serverTimestamp(),
        });

        // Update the chat's updatedAt field
        await updateDoc(doc(db, `users/${user.uid}/chats`, chatId), {
            updatedAt: serverTimestamp(),
        });
    };

    const deleteMessagesAfter = async (chatId: string, index: number) => {
        if (!user) return;
        const q = query(
            collection(db, `users/${user.uid}/chats/${chatId}/messages`),
            orderBy("timestamp", "asc")
        );
        const snapshot = await getDocs(q);
        // We want to delete the message at 'index' and everything after it
        // because handleSendMessage will append the NEW version of the edited message.
        const docsToDelete = snapshot.docs.slice(index);
        
        if (docsToDelete.length > 0) {
            const batch = writeBatch(db);
            docsToDelete.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    };

    return (
        <ChatContext.Provider value={{ 
            activeChatId, 
            setActiveChatId, 
            messages, 
            setMessages,
            createNewChat,
            sendMessageToFirestore,
            deleteMessagesAfter
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
