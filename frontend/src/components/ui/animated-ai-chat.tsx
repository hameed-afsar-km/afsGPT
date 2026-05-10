"use client";

import { useEffect, useRef, useCallback, useTransition } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Code2,
  Lightbulb,
  Search,
  Paperclip,
  PlusIcon,
  SendIcon,
  XIcon,
  LoaderIcon,
  Sparkles,
  Command,
  Mic,
  MicOff,
  Volume2,
  FileText,
  X,
  Copy,
  Check,
} from "lucide-react";
import { ProviderSelector } from "./provider-selector";
import { VoiceCallModal } from "./voice-call-modal";
import { motion, AnimatePresence } from "framer-motion";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useChat } from "@/context/ChatContext";

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY),
      );

      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

interface CommandSuggestion {
  icon: React.ReactNode;
  label: string;
  description: string;
  prefix: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  containerClassName?: string;
  showRing?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, containerClassName, showRing = true, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);

    return (
      <div className={cn("relative", containerClassName)}>
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "transition-all duration-200 ease-in-out",
            "placeholder:text-muted-foreground",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "custom-scrollbar overflow-y-auto",
            showRing
              ? "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              : "",
            className,
          )}
          ref={ref}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />

        {showRing && isFocused && (
          <motion.span
            className="absolute inset-0 rounded-md pointer-events-none ring-2 ring-offset-0 ring-violet-500/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}

        {props.onChange && (
          <div
            className="absolute bottom-2 right-2 opacity-0 w-2 h-2 bg-violet-500 rounded-full"
            style={{
              animation: "none",
            }}
            id="textarea-ripple"
          />
        )}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";

export function AnimatedAIChat() {
  const [value, setValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [activeSuggestion, setActiveSuggestion] = useState<number>(-1);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [recentCommand, setRecentCommand] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 60,
    maxHeight: 200,
  });
  const [inputFocused, setInputFocused] = useState(false);
  const {
    activeChatId,
    setActiveChatId,
    messages,
    setMessages,
    createNewChat,
    sendMessageToFirestore,
  } = useChat();
  const [isChatMode, setIsChatMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const commandPaletteRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── RAG state ────────────────────────────────────────────────────────────
  const [ragSessionId, setRagSessionId] = useState<string | null>(null);
  const [ragFileName, setRagFileName] = useState<string | null>(null);
  const [fileAttachedToNextMessage, setFileAttachedToNextMessage] = useState<
    string[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (messages.length > 0 && !isChatMode) {
      setIsChatMode(true);
    } else if (messages.length === 0 && isChatMode) {
      setIsChatMode(false);
    }
  }, [messages, isChatMode, isTyping]);

  const commandSuggestions: CommandSuggestion[] = [
    {
      icon: <Code2 className="w-4 h-4" />,
      label: "Code",
      description: "Write or debug code",
      prefix: "/code",
    },
    {
      icon: <Lightbulb className="w-4 h-4" />,
      label: "Brainstorm",
      description: "Generate new ideas",
      prefix: "/brainstorm",
    },
    {
      icon: <Search className="w-4 h-4" />,
      label: "Research",
      description: "Search for information",
      prefix: "/research",
    },
  ];

  useEffect(() => {
    if (value.startsWith("/") && !value.includes(" ")) {
      setShowCommandPalette(true);

      const matchingSuggestionIndex = commandSuggestions.findIndex((cmd) =>
        cmd.prefix.startsWith(value),
      );

      if (matchingSuggestionIndex >= 0) {
        setActiveSuggestion(matchingSuggestionIndex);
      } else {
        setActiveSuggestion(-1);
      }
    } else {
      setShowCommandPalette(false);
    }
  }, [value]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const commandButton = document.querySelector("[data-command-button]");

      if (
        commandPaletteRef.current &&
        !commandPaletteRef.current.contains(target) &&
        !commandButton?.contains(target)
      ) {
        setShowCommandPalette(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandPalette) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestion((prev) =>
          prev < commandSuggestions.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestion((prev) =>
          prev > 0 ? prev - 1 : commandSuggestions.length - 1,
        );
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        if (activeSuggestion >= 0) {
          const selectedCommand = commandSuggestions[activeSuggestion];
          setValue(selectedCommand.prefix + " ");
          setShowCommandPalette(false);

          setRecentCommand(selectedCommand.label);
          setTimeout(() => setRecentCommand(null), 3500);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowCommandPalette(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        handleSendMessage();
      }
    }
  };

  const playTTS = async (text: string) => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
      }
    } catch (error) {
      console.error("TTS playback error:", error);
    }
  };

  const handleSendMessage = async (overrideText?: string) => {
    const textToSend = overrideText || value;
    if (textToSend.trim()) {
      const content = textToSend.trim();
      const userMessage: any = {
        role: "user",
        content: content,
        timestamp: new Date(),
        attachments:
          fileAttachedToNextMessage.length > 0
            ? [...fileAttachedToNextMessage]
            : [],
      };

      // Clear the attachment after it's added to the message
      if (fileAttachedToNextMessage.length > 0) {
        setFileAttachedToNextMessage([]);
      }

      const currentMessages = [...messages, userMessage];
      setMessages(currentMessages);
      setIsChatMode(true);
      setValue("");
      adjustHeight(true);

      setIsTyping(true);
      setIsRecording(false);

      startTransition(async () => {
        try {
          let chatId = activeChatId;

          // Create new chat if this is the first message
          if (!chatId) {
            chatId = await createNewChat(content);
          }

          // Save user message to Firestore
          await sendMessageToFirestore(chatId, userMessage);

          let responseContent: string;

          if (ragSessionId) {
            // ── RAG mode: query the document ──────────────────
            const ragRes = await fetch("/api/rag/query", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session_id: ragSessionId,
                question: content,
              }),
            });
            const ragData = await ragRes.json();
            if (!ragRes.ok) {
              responseContent = `❌ RAG Error: ${ragData.detail || "Unknown error"}`;
            } else {
              responseContent = ragData.answer;
            }
          } else {
            // ── Normal AI chat mode ───────────────────────────
            const provider = localStorage.getItem("afs-provider");
            const model = localStorage.getItem("afs-model");
            const keys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
            const apiKey = provider ? keys[provider] : "";

            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: currentMessages,
                provider,
                model,
                apiKey,
              }),
            });
            const data = await response.json();
            if (data.error) {
              responseContent = `Error: ${data.error}`;
            } else {
              responseContent = data.content;
            }
          }

          const aiMessage: any = {
            role: "assistant",
            content: responseContent,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, aiMessage]);
          setIsTyping(false);
          await sendMessageToFirestore(chatId, aiMessage);
        } catch (error) {
          console.error("Chat error:", error);
          const errorMessage: any = {
            role: "assistant",
            content:
              "I encountered a connection error. Please check if your provider is configured correctly.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMessage]);
          setIsTyping(false);
        }
      });
    }
  };

  const uploadFilesToRAG = async (files: File[]) => {
    let currentSessionId = ragSessionId;
    const newAttached: string[] = [];
    setIsUploading(true);

    for (const file of files) {
      const allowed = [".pdf", ".txt", ".csv", ".xlsx", ".xls"];
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!allowed.includes(ext)) {
        const errMsg: any = {
          role: "assistant",
          content: `⚠️ Unsupported file type **${ext}**. Please upload a PDF, TXT, CSV, or XLSX file.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg]);
        setIsChatMode(true);
        continue;
      }

      try {
        const form = new FormData();
        form.append("file", file);
        if (currentSessionId) {
          form.append("session_id", currentSessionId);
        }

        const res = await fetch("/api/rag/upload", {
          method: "POST",
          body: form,
        });
        const data = await res.json();

        if (!res.ok) {
          const errMsg: any = {
            role: "assistant",
            content: `❌ Upload failed: ${data.detail || "Unknown error"}`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errMsg]);
          setIsChatMode(true);
        } else {
          currentSessionId = data.session_id;
          newAttached.push(file.name);
        }
      } catch (err: any) {
        const errMsg: any = {
          role: "assistant",
          content: `❌ Could not reach the RAG server. Make sure it's running on port 8001.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg]);
        setIsChatMode(true);
        break;
      }
    }

    if (currentSessionId) {
      setRagSessionId(currentSessionId);
    }
    if (newAttached.length > 0) {
      setRagFileName((prev) =>
        prev ? `${prev}, ${newAttached.join(", ")}` : newAttached.join(", "),
      );
      setFileAttachedToNextMessage((prev) => [...prev, ...newAttached]);
    }
    setIsUploading(false);
  };

  const handleAttachFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) uploadFilesToRAG(Array.from(files));
    // reset so the same file can be re-selected
    e.target.value = "";
  };

  const clearRagSession = () => {
    setRagSessionId(null);
    setRagFileName(null);
    setFileAttachedToNextMessage([]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) uploadFilesToRAG(Array.from(files));
  };

  const removeAttachment = (index: number) => {
    setFileAttachedToNextMessage((prev) => prev.filter((_, i) => i !== index));
  };

  const selectCommandSuggestion = (index: number) => {
    const selectedCommand = commandSuggestions[index];
    setValue(selectedCommand.prefix + " ");
    setShowCommandPalette(false);

    setRecentCommand(selectedCommand.label);
    setTimeout(() => setRecentCommand(null), 2000);
  };

  const toggleRecording = () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  };

  const startRecording = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech Recognition.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setValue(transcript);

      // Auto-send the voice message once recognition completes
      handleSendMessage(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    (window as any).currentRecognition = recognition;
  };

  const stopRecording = () => {
    if ((window as any).currentRecognition) {
      (window as any).currentRecognition.stop();
    }
    setIsRecording(false);
  };

  return (
    <>
      <VoiceCallModal
        isOpen={isCallOpen}
        onClose={() => setIsCallOpen(false)}
      />
      {/* Hidden real file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.csv,.xlsx,.xls"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <div
        className="h-screen w-full bg-transparent text-white relative overflow-hidden flex flex-col"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Branding */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-center items-center z-50 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
              <Sparkles className="w-4 h-4 text-violet-400" />
            </div>
            <span className="text-xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-300 to-indigo-400 font-sans uppercase">
              afsGPT
            </span>
          </motion.div>
        </div>
        {/* Drag Overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-violet-500/10 backdrop-blur-sm border-2 border-dashed border-violet-500/50 flex flex-col items-center justify-center gap-4 rounded-3xl m-4"
            >
              <div className="w-20 h-20 bg-violet-500/20 rounded-full flex items-center justify-center animate-bounce">
                <FileText className="w-10 h-10 text-violet-400" />
              </div>
              <h3 className="text-2xl font-bold text-violet-300 tracking-tight">
                Drop document to analyze
              </h3>
              <p className="text-violet-400/60 font-medium">
                Supports PDF, TXT, CSV, XLSX
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Background spotlight */}
        {inputFocused && (
          <motion.div
            className="fixed w-[60rem] h-[60rem] rounded-full pointer-events-none z-0 opacity-[0.03] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500 blur-[120px]"
            animate={{
              x: mousePosition.x - 480,
              y: mousePosition.y - 480,
            }}
            transition={{
              type: "spring",
              damping: 30,
              stiffness: 120,
              mass: 0.5,
            }}
          />
        )}

        {/* Scrollable area that fills the screen */}
        <div
          ref={scrollRef}
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden relative z-10 custom-scrollbar scroll-smooth",
            isChatMode ? "block" : "flex items-center justify-center",
          )}
        >
          <div
            className={cn(
              "w-full max-w-4xl mx-auto px-10 transition-all duration-1000 ease-in-out",
              isChatMode ? "py-16" : "py-0",
            )}
          >
            <AnimatePresence mode="wait">
              {!isChatMode ? (
                <motion.div
                  key="initial-view"
                  className="space-y-12 w-full"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02, filter: "blur(10px)" }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="text-center space-y-3">
                    <motion.h1
                      className="text-5xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/40"
                      layoutId="main-title"
                    >
                      How can I help today?
                    </motion.h1>
                    <motion.p
                      className="text-base text-white/30"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      Ask anything, from code to creative writing
                    </motion.p>
                  </div>

                  <motion.div
                    layoutId="input-box"
                    className="backdrop-blur-3xl bg-white/[0.02] rounded-2xl border border-white/[0.08]"
                    transition={{ type: "spring", damping: 25, stiffness: 120 }}
                  >
                    {renderInputContent()}
                  </motion.div>

                  <motion.div
                    className="flex flex-wrap items-center justify-center gap-3"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    {commandSuggestions.map((suggestion, index) => (
                      <motion.button
                        key={suggestion.prefix}
                        onClick={() => selectCommandSuggestion(index)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.08] rounded-2xl text-sm text-white/50 hover:text-white/90 transition-all border border-white/[0.05]"
                        whileHover={{
                          scale: 1.02,
                          backgroundColor: "rgba(255,255,255,0.06)",
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {suggestion.icon}
                        <span>{suggestion.label}</span>
                      </motion.button>
                    ))}
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="chat-view"
                  className="space-y-8 pb-64"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  {messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        type: "spring",
                        damping: 20,
                        stiffness: 100,
                        delay: idx === messages.length - 1 ? 0.1 : 0,
                      }}
                      className={cn(
                        "flex w-full",
                        msg.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] flex flex-col group",
                          msg.role === "user"
                            ? "items-end ml-16"
                            : "items-start mr-16",
                        )}
                      >
                        <div
                          className={cn(
                            "w-full rounded-[1.8rem] px-6 py-4 text-sm leading-relaxed backdrop-blur-3xl border transition-all duration-500",
                            msg.role === "user"
                              ? "bg-white/[0.08] border-white/[0.1] text-white/90 rounded-tr-none"
                              : "bg-white/[0.03] border-white/[0.05] text-white/80 rounded-tl-none",
                          )}
                        >
                          {msg.role === "user" && (
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-white/40">
                                You
                              </span>
                            </div>
                          )}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-col gap-2 mb-3">
                              {msg.attachments.map((att: string, i: number) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl border border-white/20 w-fit"
                                >
                                  <FileText className="w-4 h-4 text-violet-300" />
                                  <span className="text-xs text-white/90 font-medium">
                                    {att}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {msg.role === "assistant" && (
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center border border-violet-500/30">
                                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                </div>
                                <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-violet-400/80">
                                  Afs AI
                                </span>
                              </div>
                            </div>
                          )}
                          <div className="text-sm leading-relaxed text-white/90">
                            {msg.role === "assistant" &&
                            idx === messages.length - 1 ? (
                              <TypewriterText content={msg.content} />
                            ) : (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => (
                                    <p className="mb-2 last:mb-0 font-light tracking-wide">
                                      {children}
                                    </p>
                                  ),
                                  strong: ({ children }) => (
                                    <strong className="font-bold text-violet-300 drop-shadow-[0_0_8px_rgba(167,139,250,0.3)]">
                                      {children}
                                    </strong>
                                  ),
                                  pre: ({ children }) => <>{children}</>,
                                  code: CodeBlock as any,
                                  ul: ({ children }) => (
                                    <ul className="list-disc ml-4 mb-2 space-y-1">
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="list-decimal ml-4 mb-2 space-y-1">
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children }) => (
                                    <li className="font-light">{children}</li>
                                  ),
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 px-2">
                          {msg.role === "assistant" && (
                            <button
                              onClick={() => playTTS(msg.content)}
                              className="p-1.5 rounded-full hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
                              title="Read aloud"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() =>
                              navigator.clipboard.writeText(msg.content)
                            }
                            className="p-1.5 rounded-full hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
                            title={
                              msg.role === "user"
                                ? "Copy prompt"
                                : "Copy output"
                            }
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {isTyping && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex justify-start"
                    >
                      <div className="bg-white/[0.03] border border-white/[0.05] rounded-[2.2rem] rounded-tl-none px-7 py-5 backdrop-blur-3xl shadow-2xl ml-4">
                        <ThinkingLoader />
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Sticky Input Field in Chat Mode */}
        {isChatMode && (
          <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none bg-gradient-to-t from-black via-black/80 to-transparent pt-16 pb-2">
            <div className="max-w-4xl mx-auto px-6 pb-6">
              <motion.div
                layoutId="input-box"
                className="pointer-events-auto backdrop-blur-3xl bg-white/[0.05] rounded-[1.5rem] border border-white/[0.08]"
                transition={{ type: "spring", damping: 25, stiffness: 120 }}
              >
                {renderInputContent()}
              </motion.div>
              <p className="text-[10px] text-center text-white/20 mt-3 tracking-widest uppercase">
                Afs AI can make mistakes.
              </p>
            </div>
          </div>
        )}

        {/* Command Palette Overlay */}
        <AnimatePresence>
          {showCommandPalette && (
            <motion.div
              ref={commandPaletteRef}
              className="fixed left-1/2 -translate-x-1/2 bottom-[140px] w-full max-w-lg backdrop-blur-3xl bg-[#0A0A0B]/90 rounded-3xl z-50 border border-white/10 overflow-hidden p-3"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <div className="space-y-1.5">
                {commandSuggestions.map((suggestion, index) => (
                  <motion.div
                    key={suggestion.prefix}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 rounded-2xl transition-all cursor-pointer",
                      activeSuggestion === index
                        ? "bg-white/10 text-white translate-x-1"
                        : "text-white/50 hover:bg-white/5",
                    )}
                    onClick={() => selectCommandSuggestion(index)}
                  >
                    <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-white/60">
                      {suggestion.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm tracking-wide">
                        {suggestion.label}
                      </div>
                      <div className="text-[11px] text-white/30">
                        {suggestion.description}
                      </div>
                    </div>
                    <div className="text-white/20 text-[10px] font-mono px-2 py-1 rounded-lg border border-white/5 bg-black/20">
                      {suggestion.prefix}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );

  function renderInputContent() {
    return (
      <>
        {/* Analysis Status & Attachments Header */}
        {(fileAttachedToNextMessage.length > 0 || isUploading || ragFileName) && (
          <div className="px-5 pt-4 pb-2 border-b border-white/[0.05] flex items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <AnimatePresence mode="popLayout">
                {isUploading && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/20 border border-violet-500/30 rounded-xl text-[10px] font-bold uppercase tracking-widest text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.1)]"
                  >
                    <LoaderIcon className="w-3 h-3 animate-spin" />
                    Analyzing
                  </motion.div>
                )}
                {fileAttachedToNextMessage.length === 0 && !isUploading && ragFileName && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-medium text-white/40 italic"
                  >
                    <FileText className="w-3 h-3 text-violet-400/50" />
                    Document context active
                  </motion.div>
                )}
                {fileAttachedToNextMessage.map((fileName, idx) => (
                  <motion.div
                    key={`${fileName}-${idx}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-xs group transition-colors hover:bg-white/10"
                  >
                    <FileText className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-white/80 max-w-[150px] truncate font-medium">
                      {fileName}
                    </span>
                    <button
                      onClick={() => removeAttachment(idx)}
                      className="text-white/20 hover:text-red-400 transition-colors ml-1 p-0.5 rounded-md hover:bg-white/10"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {ragFileName && !isUploading && (
              <button
                onClick={clearRagSession}
                className="text-[10px] font-bold uppercase tracking-widest text-white/20 hover:text-red-400/60 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        )}

        <div className="p-4 relative">
          <AnimatePresence>
            {isRecording && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex items-center justify-center bg-red-500/10 backdrop-blur-xl"
              >
                <div className="flex items-center gap-4">
                  <motion.div
                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                  />
                  <span className="text-red-400 text-sm font-medium tracking-widest uppercase">
                    Listening...
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Ask anything..."
            containerClassName="w-full"
            className={cn(
              "w-full px-4 py-3",
              "resize-none",
              "bg-transparent",
              "border-none",
              "text-white/90 text-sm leading-relaxed",
              "focus:outline-none",
              "placeholder:text-white/20",
              "min-h-[60px]",
              isRecording && "opacity-0 pointer-events-none",
            )}
            showRing={false}
          />
        </div>

        <div className="px-5 pb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* RAG status removed from here and moved to top header */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleAttachFile}
              disabled={isUploading}
              title="Attach document for RAG analysis"
              className={cn(
                "p-2.5 rounded-xl transition-colors",
                isUploading
                  ? "text-violet-400 cursor-wait opacity-50"
                  : fileAttachedToNextMessage.length > 0
                    ? "text-violet-400 bg-violet-500/10 shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                    : "text-white/30 hover:text-white/90 hover:bg-white/5",
              )}
            >
              <Paperclip className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                setShowCommandPalette((prev) => !prev);
              }}
              className={cn(
                "p-2.5 rounded-xl transition-colors",
                showCommandPalette
                  ? "bg-white/10 text-white"
                  : "text-white/30 hover:text-white/90 hover:bg-white/5",
              )}
            >
              <Command className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsCallOpen(true)}
              title="Start Voice Call"
              className="p-2.5 rounded-xl transition-colors text-white/30 hover:text-violet-400 hover:bg-violet-500/10"
            >
              <Mic className="w-5 h-5" />
            </motion.button>
            <div className="h-6 w-[1px] bg-white/10 mx-1" />
            <ProviderSelector />
          </div>

          <motion.button
            onClick={() => handleSendMessage()}
            disabled={isTyping || !value.trim() || isUploading}
            className={cn(
              "px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-300",
              "flex items-center gap-2",
              value.trim() && !isUploading
                ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                : "bg-white/5 text-white/20",
            )}
          >
            {isTyping ? (
              <LoaderIcon className="w-4 h-4 animate-spin" />
            ) : (
              <SendIcon className="w-4 h-4" />
            )}
            <span>Send</span>
          </motion.button>
        </div>
      </>
    );
  }
}

function TypewriterText({ content }: { content: string }) {
  const [displayedContent, setDisplayedContent] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Reset if content changes completely (new message)
    setDisplayedContent("");
    setIndex(0);
  }, [content]);

  useEffect(() => {
    if (index < content.length) {
      // High-performance typewriter: type significantly more characters per tick
      // for an ultra-fast "premium" feel.
      const charsPerTick = content.length > 1000 ? 30 : content.length > 500 ? 15 : 8;
      
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, index + charsPerTick));
        setIndex((prev) => prev + charsPerTick);
      }, 5);
      return () => clearTimeout(timeout);
    }
  }, [content, index]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 font-light tracking-wide">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-bold text-violet-300 drop-shadow-[0_0_8px_rgba(167,139,250,0.3)]">
            {children}
          </strong>
        ),
        pre: ({ children }) => <>{children}</>,
        code: CodeBlock as any,
        ul: ({ children }) => (
          <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>
        ),
        li: ({ children }) => <li className="font-light">{children}</li>,
      }}
    >
      {displayedContent}
    </ReactMarkdown>
  );
}

function ThinkingLoader() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 bg-violet-400 rounded-full"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <motion.span
        className="text-[10px] font-bold uppercase tracking-[0.3em] bg-clip-text text-transparent bg-gradient-to-r from-white/40 via-white to-white/40 bg-[length:200%_auto]"
        animate={{
          backgroundPosition: ["200% center", "-200% center"],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        Thinking...
      </motion.span>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center ml-1">
      {[1, 2, 3].map((dot) => (
        <motion.div
          key={dot}
          className="w-1.5 h-1.5 bg-white/90 rounded-full mx-0.5"
          initial={{ opacity: 0.3 }}
          animate={{
            opacity: [0.3, 0.9, 0.3],
            scale: [0.85, 1.1, 0.85],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: dot * 0.15,
            ease: "easeInOut",
          }}
          style={{
            boxShadow: "0 0 4px rgba(255, 255, 255, 0.3)",
          }}
        />
      ))}
    </div>
  );
}

const rippleKeyframes = `
@keyframes ripple {
  0% { transform: scale(0.5); opacity: 0.6; }
  100% { transform: scale(2); opacity: 0; }
}
`;

if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.innerHTML = rippleKeyframes;
  document.head.appendChild(style);
}

function CodeBlock({ className, children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const isInline = !match && !String(children).includes('\n');

  if (isInline) {
    return (
      <code className="bg-white/10 px-1.5 py-0.5 rounded text-violet-200 text-xs font-mono" {...props}>
        {children}
      </code>
    );
  }

  const language = match ? match[1] : "text";

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-white/10 bg-[#0d0d0d] shadow-xl">
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-white/10">
        <span className="text-xs font-mono text-white/50 lowercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-white/40 hover:text-white/80 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="p-0 overflow-x-auto text-sm font-mono text-white/80 custom-scrollbar max-w-full">
        <SyntaxHighlighter
          language={language === "text" ? "javascript" : language}
          style={vscDarkPlus}
          PreTag="div"
          customStyle={{
            margin: 0,
            background: "transparent",
            padding: "1rem",
          }}
          wrapLongLines={true}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
