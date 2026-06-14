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
  VolumeX,
  FileText,
  X,
  Copy,
  Check,
  Download,
  Pencil,
  AlertCircle,
  Square,
  ImageIcon,
  Maximize2,
  Minimize2,
  Globe,
  Telescope,
  Zap,
  Key,
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
import { ImageGallery } from "./image-gallery";

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
  isNew?: boolean;
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
  const [typingChatIds, setTypingChatIds] = useState<Set<string>>(new Set());
  const [generatingChatIds, setGeneratingChatIds] = useState<Set<string>>(new Set());
  const [isRecording, setIsRecording] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState<number>(-1);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [recentCommand, setRecentCommand] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [playingMsgIndex, setPlayingMsgIndex] = useState<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioAbortControllerRef = useRef<AbortController | null>(null);

  const {
    activeChatId,
    setActiveChatId,
    messages,
    setMessages,
    createNewChat,
    sendMessageToFirestore,
    deleteMessagesAfter,
    images,
    saveGeneratedImage,
    activeChatTitle,
  } = useChat();

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 60,
    maxHeight: 200,
  });
  const [inputFocused, setInputFocused] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const commandPaletteRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const stopGeneration = () => {
    if (activeChatId) {
      const controller = abortControllersRef.current.get(activeChatId);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(activeChatId);
      }
      setResearchingChatIds(prev => { const n = new Set(prev); n.delete(activeChatId); return n; });
      setAnalyzingImageChatIds(prev => { const n = new Set(prev); n.delete(activeChatId); return n; });
      setTypingChatIds(prev => { const n = new Set(prev); n.delete(activeChatId); return n; });
      setGeneratingChatIds(prev => { const n = new Set(prev); n.delete(activeChatId); return n; });
    }
  };

  // ── RAG state ────────────────────────────────────────────────────────────
  const [ragSessionId, setRagSessionId] = useState<string | null>(null);
  const [ragFileName, setRagFileName] = useState<string | null>(null);
  const [fileAttachedToNextMessage, setFileAttachedToNextMessage] = useState<
    Array<{ name: string; thumbnail?: string; sessionId?: string }>
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [processingSessions, setProcessingSessions] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Vision / LLaVA state ─────────────────────────────────────────────────
  const [attachedImage, setAttachedImage] = useState<{ base64: string; name: string } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editImagePrefix, setEditImagePrefix] = useState("");
  const [useFreeTier, setUseFreeTier] = useState(true);

  // Load free-tier preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("afs-free-tier");
    if (saved !== null) {
      setUseFreeTier(saved === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("afs-free-tier", String(useFreeTier));
  }, [useFreeTier]);

  const [showCodeModal, setShowCodeModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<any>(null);
  const [isCheckingModel, setIsCheckingModel] = useState(false);
  const [isPullingModel, setIsPullingModel] = useState(false);
  const [isModelInstalled, setIsModelInstalled] = useState(false);
  const [fullscreenCode, setFullscreenCode] = useState<{ code: string; language: string; title: string } | null>(null);
  const [intentsByChat, setIntentsByChat] = useState<Record<string, string | null>>({});
  const [researchModeByChat, setResearchModeByChat] = useState<Record<string, boolean>>({});
  const [researchingChatIds, setResearchingChatIds] = useState<Set<string>>(new Set());
  const [analyzingImageChatIds, setAnalyzingImageChatIds] = useState<Set<string>>(new Set());
  
  const currentChatKey = activeChatId || 'new_chat';
  const activeIntent = intentsByChat[currentChatKey] || null;
  const isResearchMode = researchModeByChat[currentChatKey] || false;

  const setActiveIntent = (intent: string | null) => {
    setIntentsByChat(prev => ({ ...prev, [currentChatKey]: intent }));
  };
  const setIsResearchMode = (mode: boolean) => {
    setResearchModeByChat(prev => ({ ...prev, [currentChatKey]: mode }));
  };

  const isTyping = activeChatId ? typingChatIds.has(activeChatId) : false;
  const isResearching = activeChatId ? researchingChatIds.has(activeChatId) : false;
  const isAnalyzingImage = activeChatId ? analyzingImageChatIds.has(activeChatId) : false;
  const isGenerating = activeChatId ? generatingChatIds.has(activeChatId) : false;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!(target instanceof HTMLElement)) return;
      
      // Close Attach Menu if clicking outside
      if (showAttachMenu && !target.closest('.attach-menu-container')) {
        setShowAttachMenu(false);
      }
      // Close Actions Menu if clicking outside
      if (showActionsMenu && !target.closest('.actions-menu-container')) {
        setShowActionsMenu(false);
      }
      // Close Command Palette if clicking outside
      if (showCommandPalette && !target.closest('.command-palette-container')) {
        setShowCommandPalette(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAttachMenu, showActionsMenu, showCommandPalette]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if ((messages.length > 0 || activeChatId) && !isChatMode) {
      setIsChatMode(true);
    } else if (messages.length === 0 && !activeChatId && isChatMode) {
      setIsChatMode(false);
    }
  }, [messages, isChatMode, activeChatId, isTyping, isGenerating]);

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
      icon: <Globe className="w-4 h-4" />,
      label: "Research",
      description: "Toggle Deep Web Research Mode",
      prefix: "/research",
    },
    {
      icon: <ImageIcon className="w-4 h-4" />,
      label: "Generate Image",
      description: "Create images with AI",
      prefix: "/image",
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

  // Poll processing sessions until ready
  useEffect(() => {
    if (processingSessions.size === 0) return;
    const intervals = new Map<string, ReturnType<typeof setInterval>>();
    for (const sid of processingSessions) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/rag/status/${sid}`);
          const data = await res.json();
          if (data.ready || data.error) {
            clearInterval(interval);
            intervals.delete(sid);
            setProcessingSessions(prev => {
              const next = new Set(prev);
              next.delete(sid);
              return next;
            });
            // Update attachment with thumbnail if available
            if (data.thumbnail) {
              setFileAttachedToNextMessage(prev =>
                prev.map(att =>
                  att.sessionId === sid ? { ...att, thumbnail: data.thumbnail } : att
                )
              );
            }
          }
        } catch { /* ignore polling errors */ }
      }, 2000);
      intervals.set(sid, interval);
    }
    return () => {
      for (const interval of intervals.values()) clearInterval(interval);
    };
  }, [processingSessions]);

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
          selectCommandSuggestion(activeSuggestion);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowCommandPalette(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() || attachedImage) {
        if (attachedImage) {
          sendImageForAnalysis(value.trim(), attachedImage.base64, attachedImage.name);
        } else {
          handleSendMessage();
        }
      }
    }
  };

  const stopTTS = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (audioAbortControllerRef.current) {
      audioAbortControllerRef.current.abort();
      audioAbortControllerRef.current = null;
    }
    setPlayingMsgIndex(null);
  };

  const playTTS = async (text: string, index: number) => {
    if (playingMsgIndex === index) {
      stopTTS();
      return;
    }
    stopTTS();

    setPlayingMsgIndex(index);
    const controller = new AbortController();
    audioAbortControllerRef.current = controller;

    try {
      // Split by punctuation, keeping punctuation with the sentence
      const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
      const cleanedSentences = sentences.map(s => s.trim()).filter(s => s.length > 0);

      if (cleanedSentences.length === 0) return;

      let nextIndexToFetch = 0;

      const backendWsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:8001";
      const BACKEND_URL = backendWsUrl.replace(/^ws/, "http");

      const fetchNext = async (i: number): Promise<HTMLAudioElement | null> => {
        if (i >= cleanedSentences.length || controller.signal.aborted) return null;
        try {
          const res = await fetch(`${BACKEND_URL}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: cleanedSentences[i] }),
            signal: controller.signal
          });
          if (res.ok && res.status !== 204) {
            const blob = await res.blob();
            if (blob.size > 0) {
              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              audio.preload = "auto";
              audio.load(); // Force pre-decoding and buffering
              return audio;
            }
          }
        } catch (e) {
          // ignore aborts
        }
        return null;
      };

      // Pre-fetch storage
      const activePromises: { [key: number]: Promise<HTMLAudioElement | null> } = {};
      const getUrl = (i: number) => {
        if (!activePromises[i]) {
          activePromises[i] = fetchNext(i);
        }
        return activePromises[i];
      };

      // Trigger pre-fetch for first 2 chunks
      getUrl(0);
      if (cleanedSentences.length > 1) {
        getUrl(1);
      }

      for (let i = 0; i < cleanedSentences.length; i++) {
        if (controller.signal.aborted) break;

        // Pre-fetch up to 2 chunks ahead concurrently
        for (let j = 1; j <= 2; j++) {
          if (i + j < cleanedSentences.length) {
            getUrl(i + j);
          }
        }

        const audio = await getUrl(i);
        if (!audio) continue;

        currentAudioRef.current = audio;

        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          controller.signal.addEventListener('abort', () => {
            audio.pause();
            resolve();
          });
          audio.play().catch(() => resolve());
        });

        if (audio.src) {
          URL.revokeObjectURL(audio.src);
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("TTS playback error:", error);
      }
    } finally {
      setPlayingMsgIndex((prev) => prev === index ? null : prev);
    }
  };

  const handleSendMessage = async (overrideText?: string, historyLimit?: number, bypassCodeCheck = false) => {
    const textToSend = overrideText || value;
    if (textToSend.trim()) {
      const content = textToSend.trim();

      if (!bypassCodeCheck) {
        const provider = localStorage.getItem("afs-provider");
        const rawModel = localStorage.getItem("afs-model");
        const model = rawModel === "Use default models (Qwen 1.5B + Gemma 2B + Moondream)" ? "qwen2.5-coder:1.5b" : rawModel;
        const codeKeywords = ["code", "function", "script", "python", "javascript", "react", "html", "css", "bug", "debug", "api"];
        const isCodeRelated = activeIntent === "code" || codeKeywords.some(keyword => content.toLowerCase().includes(keyword));
        
        if (provider === "ollama" && model !== "qwen2.5-coder:1.5b" && isCodeRelated) {
          setPendingMessage({ text: content, limit: historyLimit });
          setShowCodeModal(true);
          
          setIsCheckingModel(true);
          try {
            const res = await fetch("/api/models", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ provider: "ollama" })
            });
            const data = await res.json();
            setIsModelInstalled(data.models?.includes("qwen2.5-coder:1.5b"));
          } catch (e) {
            setIsModelInstalled(false);
          }
          setIsCheckingModel(false);
          return;
        }
      }

      const userMessage: any = {
        role: "user",
        content: content,
        timestamp: new Date(),
        attachments:
          fileAttachedToNextMessage.length > 0
            ? fileAttachedToNextMessage.map(f => f.name)
            : [],
        thumbnails:
          fileAttachedToNextMessage.length > 0
            ? fileAttachedToNextMessage.map(f => f.thumbnail).filter(Boolean)
            : [],
      };

      // Clear the attachment after it's added to the message
      if (fileAttachedToNextMessage.length > 0) {
        setFileAttachedToNextMessage([]);
      }

      const baseMessages = historyLimit !== undefined ? messages.slice(0, historyLimit) : messages;
      const currentMessages = [...baseMessages, userMessage];

      setMessages(currentMessages);
      setIsChatMode(true);
      setValue("");
      adjustHeight(true);

      setIsRecording(false);

      const imageKeywords = /\b(generate|create|draw|make|produce|render|paint|design|illustrate|show me)\b.{0,40}\b(image|picture|photo|illustration|art|artwork|painting|drawing|portrait|landscape|wallpaper)\b/i;
      const isImageRequest = activeIntent === "image" || imageKeywords.test(content) || /^(imagine|visualize|depict)\b/i.test(content);

      if (activeChatId) {
        setGeneratingChatIds(prev => new Set(prev).add(activeChatId));
        if (!isImageRequest && !isResearchMode) {
          setTypingChatIds(prev => new Set(prev).add(activeChatId));
        }
      }

      startTransition(async () => {
        let chatId = activeChatId;
        let controller: AbortController | undefined;

        try {
          // Create new chat if this is the first message
          if (!chatId) {
            chatId = await createNewChat(content);
            if (chatId) {
              setGeneratingChatIds(prev => new Set(prev).add(chatId!));
              if (!isImageRequest && !isResearchMode) {
                setTypingChatIds(prev => new Set(prev).add(chatId!));
              }
              if (isResearchMode) setResearchModeByChat(prev => ({ ...prev, [chatId!]: true, 'new_chat': false }));
              if (activeIntent) setIntentsByChat(prev => ({ ...prev, [chatId!]: activeIntent, 'new_chat': null }));
            }
          }

          if (chatId) {
            controller = new AbortController();
            abortControllersRef.current.set(chatId, controller);
          }

          // Save user message to Firestore
          if (chatId) {
            if (historyLimit !== undefined) {
              await deleteMessagesAfter(chatId, historyLimit, userMessage);
            } else {
              await sendMessageToFirestore(chatId, userMessage);
            }
          }

          if (isImageRequest && chatId) {
            // Show a loading placeholder in the chat
            const loadingMsg: any = {
              role: "assistant",
              content: "__IMAGE_GENERATING__",
              timestamp: new Date(),
              isNew: true,
            };
            setMessages(prev => [...prev, loadingMsg]);

            try {
              const imgRes = await fetch("/api/generate-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: content }),
              });
              const imgData = await imgRes.json();
              if (imgData.error) throw new Error(imgData.error);

              // New API returns a base64 dataUrl directly
              const imageUrl = imgData.dataUrl;
              const imageMsg: any = {
                role: "assistant",
                content: `__IMAGE__:${imageUrl}`,
                timestamp: new Date(),
                isNew: true,
              };
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = imageMsg;
                return updated;
              });
              await sendMessageToFirestore(chatId, imageMsg);
              await saveGeneratedImage(chatId, imageUrl, imgData.prompt || content);
            } catch (imgError: any) {
              const errMsg: any = {
                role: "assistant",
                content: `❌ Image generation failed: ${imgError.message}`,
                timestamp: new Date(),
              };
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = errMsg;
                return updated;
              });
            } finally {
              if (chatId) setTypingChatIds(prev => { const n = new Set(prev); n.delete(chatId!); return n; });
              if (chatId) setGeneratingChatIds(prev => { const n = new Set(prev); n.delete(chatId!); return n; });
            }
            return;
          }
          // ── End Image Generation ───────────────────────────────────

          let responseContent: string | undefined;

          if (isResearchMode) {
            // ── Research Agent mode ───────────────────────────
            if (chatId) setResearchingChatIds(prev => new Set(prev).add(chatId!));
            const provider = localStorage.getItem("afs-provider") || "ollama";
            const rawModel = localStorage.getItem("afs-model");
            const model = (rawModel === "Use default models (Qwen 1.5B + Gemma 2B + Moondream)" ? "gemma2:2b" : rawModel) || "gemma2:2b";
            const keys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
            const apiKey = keys[provider] || "";

            const resRes = await fetch("/api/research", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller?.signal,
              body: JSON.stringify({ query: content, provider, model, apiKey, freeTier: useFreeTier }),
            });
            const resData = await resRes.json();
            if (chatId) setResearchingChatIds(prev => { const n = new Set(prev); n.delete(chatId!); return n; });
            if (resData.error) {
              responseContent = `❌ Research Error: ${resData.error}`;
            } else {
              responseContent = `> 🌐 *Researched from the web using Afs AI Research Agent*\n\n${resData.answer}`;
            }
          } else if (ragSessionId) {
            // ── RAG mode: query the document ──────────────────
            const provider = localStorage.getItem("afs-provider") || "gemini";
            const rawModel = localStorage.getItem("afs-model");
            const model = (rawModel === "Use default models (Qwen 1.5B + Gemma 2B + Moondream)" ? (provider === "gemini" ? "gemini-1.5-flash" : "gpt-4o-mini") : rawModel) || "gemini-1.5-flash";
            const keys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
            const apiKey = keys[provider] || "";

            try {
              let ragRes: Response | undefined;
              let ragData: any;
              let retries = 0;
              const MAX_RETRIES = 60;
              while (retries < MAX_RETRIES) {
                if (controller?.signal.aborted) break;
                ragRes = await fetch("/api/rag/query", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  signal: controller?.signal,
                  body: JSON.stringify({
                    session_id: ragSessionId,
                    question: content,
                    provider,
                    model,
                    apiKey,
                    freeTier: useFreeTier,
                  }),
                });
                ragData = await ragRes.json();
                if (ragData.status === "processing") {
                  retries++;
                  if (retries === 1) {
                    const waitMsg: any = {
                      role: "assistant",
                      content: "_✨ Reading your document… automatically retrying when ready._",
                      timestamp: new Date(),
                      isNew: true,
                    };
                    setMessages((prev) => [...prev, waitMsg]);
                    if (chatId) await sendMessageToFirestore(chatId, waitMsg);
                  }
                  await new Promise(r => setTimeout(r, 2000));
                  continue;
                }
                break;
              }
              if (controller?.signal.aborted) {
                // user cancelled — noop
              } else if (ragData?.status === "processing") {
                responseContent = `⏱️ Document indexing timed out after ${MAX_RETRIES * 2}s. Please try asking again in a moment.`;
              } else if (!ragRes || !ragRes.ok) {
                const detail = ragData?.detail || "Unknown error";
                responseContent = `❌ RAG Error: ${detail}`;
              } else {
                responseContent = ragData.answer;
                setProcessingSessions(prev => {
                  const next = new Set(prev);
                  if (ragSessionId) next.delete(ragSessionId);
                  return next;
                });
              }
            } catch (ragError: any) {
              if (ragError.name === "AbortError") throw ragError;
              console.error("RAG query fetch failed:", ragError);
              responseContent = `❌ RAG query failed — the backend may not be running. Start the RAG server with: \`python rag/server.py\` (Error: ${ragError.message})`;
            }
          } else {
            // ── Normal AI chat mode ───────────────────────────
            const provider = localStorage.getItem("afs-provider");
            const rawModel = localStorage.getItem("afs-model");
            const isDefault = rawModel === "Use default models (Qwen 1.5B + Gemma 2B + Moondream)";
            const codeKeywords = ["code", "function", "script", "python", "javascript", "react", "html", "css", "bug", "debug", "api"];
            const isCodeRelated = content.toLowerCase().split(/\s+/).some(word => codeKeywords.includes(word));
            
            let model = rawModel;
            if (isDefault) {
              model = isCodeRelated ? "qwen2.5-coder:1.5b" : "gemma2:2b";
            }
            const keys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
            const apiKey = provider ? keys[provider] : "";

            const sanitizedMessages = currentMessages.map((m: any) => {
              let content = m.content;
              if (typeof content === "string" && content.startsWith("__IMAGE_UPLOAD__:")) {
                const newlineIdx = content.indexOf("\n");
                content = newlineIdx !== -1 ? content.slice(newlineIdx + 1) : "[Image]";
              }
              return { role: m.role, content };
            });
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller?.signal,
              body: JSON.stringify({
                messages: sanitizedMessages,
                provider,
                model,
                apiKey: useFreeTier ? "" : apiKey,
                freeTier: useFreeTier,
              }),
            });
            const data = await response.json();
            if (data.error) {
              responseContent = `Error: ${data.error}`;
            } else {
              responseContent = data.content;
            }
          }

          if (responseContent === undefined) {
            if (chatId) {
              setTypingChatIds(prev => { const n = new Set(prev); n.delete(chatId!); return n; });
              setGeneratingChatIds(prev => { const n = new Set(prev); n.delete(chatId!); return n; });
              abortControllersRef.current.delete(chatId);
            }
            return;
          }

          const aiMessage: any = {
            role: "assistant",
            content: responseContent,
            timestamp: new Date(),
            isNew: true,
          };

          // Isolation check: only update local UI state if we are still in the same chat
          if (activeChatIdRef.current === chatId) {
            setMessages((prev) => [...prev, aiMessage]);
            setTypingChatIds(prev => {
              const next = new Set(prev);
              if (chatId) next.delete(chatId);
              return next;
            });
            // We don't remove from generatingChatIds here, it will be set by TypewriterText.onComplete
          } else {
            // Background update: if we are not in the same chat, just stop the typing indicator for that chat
            setTypingChatIds(prev => {
              const next = new Set(prev);
              if (chatId) next.delete(chatId);
              return next;
            });
            // Also stop generating for background chats if not animating (optional)
          }
          if (chatId) abortControllersRef.current.delete(chatId);
          if (chatId) await sendMessageToFirestore(chatId, aiMessage);
          
          // Clear one-shot intents after message is sent
          if (activeIntent && activeIntent !== "research") {
            if (chatId) setIntentsByChat(prev => ({ ...prev, [chatId!]: null }));
          }
        } catch (error: any) {
          if (error.name === "AbortError") {
            const abortMsg: any = {
              role: "assistant",
              content: "_Generation cancelled by user._",
              timestamp: new Date(),
              isNew: true
            };
            if (chatId && activeChatIdRef.current === chatId) {
              setMessages((prev) => [...prev, abortMsg]);
              setTypingChatIds(prev => {
                const next = new Set(prev);
                if (chatId) next.delete(chatId);
                return next;
              });
              setGeneratingChatIds(prev => {
                const next = new Set(prev);
                if (chatId) next.delete(chatId);
                return next;
              });
              setResearchingChatIds(prev => {
                const next = new Set(prev);
                if (chatId) next.delete(chatId);
                return next;
              });
            }
            if (chatId) await sendMessageToFirestore(chatId, abortMsg);
            if (chatId) abortControllersRef.current.delete(chatId);
            return;
          }
          console.error("Chat error:", error);
          const errorMessage: any = {
            role: "assistant",
            content:
              "I encountered a connection error. Please check if your provider is configured correctly.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMessage]);
          if (chatId) {
            setTypingChatIds(prev => {
              const next = new Set(prev);
              if (chatId) next.delete(chatId);
              return next;
            });
            setGeneratingChatIds(prev => {
              const next = new Set(prev);
              if (chatId) next.delete(chatId);
              return next;
            });
            setResearchingChatIds(prev => {
              const next = new Set(prev);
              if (chatId) next.delete(chatId);
              return next;
            });
            abortControllersRef.current.delete(chatId);
          }
        }
      });
    }
  };

  const uploadFilesToRAG = async (files: File[]) => {
    let currentSessionId = ragSessionId;
    const newAttached: Array<{ name: string; thumbnail?: string; sessionId?: string }> = [];
    setIsUploading(true);

    const provider = localStorage.getItem("afs-provider") || "gemini";
    const keys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
    const apiKey = keys[provider] || "";

    const nextProcessing = new Set(processingSessions);

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
        if (apiKey) {
          form.append("apiKey", apiKey);
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
          newAttached.push({ name: file.name, thumbnail: data.thumbnail, sessionId: data.session_id });
          if (data.processing) {
            nextProcessing.add(data.session_id);
          }
        }
      } catch (err: any) {
        const errMsg: any = {
          role: "assistant",
          content: `❌ Could not reach the RAG server. If you are using Render, please ensure your backend is awake and you have provided a valid API key in settings to enable Cloud Mode.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg]);
        setIsChatMode(true);
        break;
      }
    }

    setProcessingSessions(nextProcessing);

    if (currentSessionId) {
      setRagSessionId(currentSessionId);
    }
    if (newAttached.length > 0) {
      setRagFileName((prev) =>
        prev ? `${prev}, ${newAttached.map(f => f.name).join(", ")}` : newAttached.map(f => f.name).join(", "),
      );
      setFileAttachedToNextMessage((prev) => [...prev, ...newAttached]);
    }
    setIsUploading(false);
  };

  const handleAttachFile = () => {
    fileInputRef.current?.click();
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Optimize: Resize image before sending to speed up analysis
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 512;
        const MAX_HEIGHT = 512;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Use compressed JPEG for faster transfer and processing
        const base64 = canvas.toDataURL("image/jpeg", 0.7);
        setAttachedImage({ base64, name: file.name });
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const sendImageForAnalysis = async (question: string, imageBase64: string, imageName: string) => {
    let chatId = activeChatId;
    if (!chatId) {
      chatId = await createNewChat(question || "Image Analysis");
      if (chatId) {
        setGeneratingChatIds(prev => new Set(prev).add(chatId!));
        if (isResearchMode) setResearchModeByChat(prev => ({ ...prev, [chatId!]: true, 'new_chat': false }));
        if (activeIntent) setIntentsByChat(prev => ({ ...prev, [chatId!]: activeIntent, 'new_chat': null }));
      }
    }
    if (!chatId) return;

    setAnalyzingImageChatIds(prev => new Set(prev).add(chatId!));

    const userMessage: Message = {
      role: "user",
      content: `__IMAGE_UPLOAD__:${imageBase64}\n${question || "Describe this image in detail."}`,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    
    // Save user message to Firestore immediately (Optimistic)
    await sendMessageToFirestore(chatId, userMessage);

    setAttachedImage(null);
    setValue("");
    adjustHeight(true);
    setIsChatMode(true);

    try {
      const controller = new AbortController();
      abortControllersRef.current.set(chatId, controller);
      
      const savedProvider = localStorage.getItem("afs-provider") || "gemini";
      const keys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
      const apiKey = keys[savedProvider] || "";
      const savedModel = localStorage.getItem("afs-model") || "gemini-1.5-flash";

      const res = await fetch("/api/rag/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          image_base64: imageBase64,
          question: question || "Describe this image in detail.",
          provider: savedProvider,
          model: savedModel,
          apiKey: useFreeTier ? "" : apiKey,
          freeTier: useFreeTier,
        }),
      });

      const data = await res.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.answer || data.error || data.detail || "No response from LLaVA.",
        timestamp: new Date(),
        isNew: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      await sendMessageToFirestore(chatId, assistantMessage);
    } catch (err) {
      console.error("Image analysis error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, image analysis failed.", timestamp: new Date() },
      ]);
    } finally {
      if (chatId) {
        setAnalyzingImageChatIds(prev => { const n = new Set(prev); n.delete(chatId!); return n; });
        setGeneratingChatIds(prev => { const n = new Set(prev); n.delete(chatId!); return n; });
        abortControllersRef.current.delete(chatId);
        if (activeIntent && activeIntent !== "research") {
          setIntentsByChat(prev => ({ ...prev, [chatId!]: null }));
        }
      }
    }
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
    setProcessingSessions(new Set());
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
    const prefix = selectedCommand.prefix;

    if (prefix === "/research") {
      const newState = !isResearchMode;
      setIsResearchMode(newState);
      setActiveIntent(newState ? "research" : null);
      setValue("");
      setRecentCommand("Research Mode " + (newState ? "ON" : "OFF"));
    } else if (prefix === "/code") {
      setActiveIntent(activeIntent === "code" ? null : "code");
      setValue("");
      setRecentCommand("Coding Intent " + (activeIntent !== "code" ? "Active" : "Cleared"));
    } else if (prefix === "/brainstorm") {
      setActiveIntent(activeIntent === "brainstorm" ? null : "brainstorm");
      setValue("");
      setRecentCommand("Brainstorming Intent " + (activeIntent !== "brainstorm" ? "Active" : "Cleared"));
    } else if (prefix === "/image") {
      setActiveIntent(activeIntent === "image" ? null : "image");
      setValue("");
      setRecentCommand("Image Generation Intent " + (activeIntent !== "image" ? "Active" : "Cleared"));
    } else {
      setValue(prefix + " ");
    }

    setShowCommandPalette(false);
    setShowActionsMenu(false);
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
      <AnimatePresence>
        {showCodeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
            >
              <div className="flex items-center gap-3 text-violet-400 mb-4">
                <Code2 className="w-6 h-6" />
                <h3 className="text-lg font-semibold text-white">Better Coding Experience</h3>
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-6">
                We noticed you're asking about code. For the best experience, we recommend switching to the specialized <strong>qwen2.5-coder:7b</strong> model.
                {!isCheckingModel && !isModelInstalled && (
                  <span className="block mt-2 text-yellow-400/80 text-xs">
                    <AlertCircle className="inline-block w-3.5 h-3.5 mr-1 mb-0.5" />
                    This model is not currently installed.
                  </span>
                )}
              </p>
              
              <div className="flex flex-col gap-3">
                {isCheckingModel ? (
                  <button disabled className="w-full py-2.5 bg-violet-600/50 rounded-xl text-sm font-medium flex justify-center text-white">
                    <LoaderIcon className="w-4 h-4 animate-spin" />
                  </button>
                ) : isPullingModel ? (
                  <button disabled className="w-full py-2.5 bg-violet-600/50 rounded-xl text-sm font-medium flex items-center justify-center gap-2 text-white">
                    <LoaderIcon className="w-4 h-4 animate-spin" />
                    Installing Model...
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (!isModelInstalled) {
                        setIsPullingModel(true);
                        try {
                          const res = await fetch("/api/models/pull", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ model: "qwen2.5-coder:7b" })
                          });
                          if (res.ok) setIsModelInstalled(true);
                        } catch (e) {
                          console.error("Failed to pull model", e);
                        }
                        setIsPullingModel(false);
                      }
                      localStorage.setItem("afs-model", "qwen2.5-coder:7b");
                      setShowCodeModal(false);
                      handleSendMessage(pendingMessage?.text, pendingMessage?.limit, true);
                      setPendingMessage(null);
                    }}
                    className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium transition-colors text-white"
                  >
                    {isModelInstalled ? "Yes, use qwen2.5-coder:7b" : "Install & Use"}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowCodeModal(false);
                    handleSendMessage(pendingMessage?.text, pendingMessage?.limit, true);
                    setPendingMessage(null);
                  }}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-colors text-white/70"
                >
                  No, continue with current model
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
      {/* Hidden image input for LLaVA */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageInputChange}
      />
      <div
        className="h-screen w-full bg-transparent text-white relative overflow-hidden flex flex-col"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >

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
            className="fixed w-[60rem] h-[60rem] rounded-full pointer-events-none z-0 opacity-[0.03] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500 blur-[120px] hidden md:block"
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

        {/* ─── Images Gallery View ─────────────────────────────────────── */}
        {activeChatId === "IMAGES" ? (
          <ImageGallery />
        ) : (
          <>
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
              "w-full max-w-4xl mx-auto px-4 md:px-10 transition-all duration-1000 ease-in-out",
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
                      className="text-4xl md:text-5xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/40 px-2"
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
                    className="backdrop-blur-xl bg-white/[0.02] rounded-2xl border border-white/[0.08]"
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
                        "flex w-full transition-all duration-500",
                        editingMessageIndex === idx
                          ? "justify-center"
                          : msg.role === "user"
                          ? "justify-end"
                          : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "flex flex-col group transition-all duration-500",
                          editingMessageIndex === idx ? "w-full" : "max-w-[85%]",
                          msg.role === "user"
                            ? editingMessageIndex === idx
                              ? "items-stretch"
                              : "items-end ml-4 md:ml-16"
                            : editingMessageIndex === idx
                            ? "items-stretch"
                            : "items-start mr-4 md:mr-16",
                        )}
                      >
                        <div
                          className={cn(
                            "w-full rounded-[1.5rem] md:rounded-[1.8rem] px-5 py-4 text-sm leading-relaxed backdrop-blur-xl border transition-all duration-500",
                            editingMessageIndex === idx
                              ? "bg-white/[0.05] border-white/[0.12] shadow-2xl"
                              : msg.role === "user"
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
                            <div className="flex flex-wrap gap-2 mb-4">
                              {msg.attachments.map((att: string, i: number) => {
                                const thumbnail = msg.thumbnails?.[i];
                                return (
                                  <div
                                    key={i}
                                    className="flex flex-col gap-1 p-1 bg-white/5 rounded-xl border border-white/10 group/att"
                                  >
                                    {thumbnail ? (
                                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-black/30 border border-white/10 p-0.5">
                                        <img 
                                          src={thumbnail} 
                                          alt={att} 
                                          className="w-full h-full object-contain rounded-md" 
                                        />
                                      </div>
                                    ) : (
                                      <div className="w-10 h-10 flex items-center justify-center">
                                        <FileText className="w-5 h-5 text-violet-400" />
                                      </div>
                                    )}
                                    <span className="text-[9px] text-white/50 font-medium truncate max-w-[70px] text-center px-1">
                                      {att}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {msg.role === "user" && editingMessageIndex === idx ? (
                            <div className="flex flex-col w-full gap-4 mt-2">
                              <textarea
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white/90 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 resize-y min-h-[120px] transition-all"
                                autoFocus
                              />
                              <div className="flex justify-end gap-3">
                                <button
                                  onClick={() => { setEditingMessageIndex(null); setEditImagePrefix(""); }}
                                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-white/60 transition-all border border-white/5"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingMessageIndex(null);
                                    const finalText = editImagePrefix ? editImagePrefix + editValue : editValue;
                                    setEditImagePrefix("");
                                    handleSendMessage(finalText, idx);
                                  }}
                                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-white text-black hover:bg-white/90 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                                >
                                  Save & Submit
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
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
                                {msg.content === "__IMAGE_GENERATING__" ? (
                                  <div className="w-full max-w-lg rounded-[2rem] overflow-hidden relative border border-white/[0.07] bg-[#060608] shadow-[0_0_60px_rgba(139,92,246,0.12)]">
                                    {/* Pixel Grid Canvas */}
                                    <div className="relative w-full aspect-[4/3] flex flex-col items-center justify-center gap-6 p-8">

                                      {/* Animated pixel grid */}
                                      <div className="absolute inset-0 grid"
                                        style={{ gridTemplateColumns: "repeat(16, 1fr)", gridTemplateRows: "repeat(12, 1fr)" }}
                                      >
                                        {Array.from({ length: 192 }).map((_, i) => (
                                          <motion.div
                                            key={i}
                                            className="border-[0.5px] border-white/[0.03]"
                                            animate={{
                                              backgroundColor: [
                                                "rgba(0,0,0,0)",
                                                `hsl(${260 + (i % 60)}deg, 70%, ${20 + (i % 20)}%)`,
                                                "rgba(0,0,0,0)"
                                              ],
                                            }}
                                            transition={{
                                              duration: 2.5,
                                              repeat: Infinity,
                                              delay: (i * 0.013) % 2.5,
                                              ease: "easeInOut",
                                            }}
                                          />
                                        ))}
                                      </div>

                                      {/* Dark overlay so the grid doesn't overpower */}
                                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

                                      {/* Center content */}
                                      <div className="relative z-10 flex flex-col items-center gap-5">
                                        {/* Waveform bars */}
                                        <div className="flex items-end gap-[3px] h-10">
                                          {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6, 1, 0.75, 0.45, 0.85, 0.6].map((h, i) => (
                                            <motion.div
                                              key={i}
                                              className="w-[3px] rounded-full bg-gradient-to-t from-violet-600 to-fuchsia-400"
                                              style={{ height: `${h * 100}%` }}
                                              animate={{ scaleY: [0.3, 1, 0.3] }}
                                              transition={{
                                                duration: 1.2,
                                                repeat: Infinity,
                                                delay: i * 0.08,
                                                ease: "easeInOut",
                                              }}
                                            />
                                          ))}
                                        </div>

                                        {/* Label */}
                                        <div className="flex flex-col items-center gap-1">
                                          <motion.p
                                            className="text-[13px] font-semibold text-white/80 tracking-widest uppercase"
                                            animate={{ opacity: [0.4, 1, 0.4] }}
                                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                          >
                                            Generating Image
                                          </motion.p>
                                          <p className="text-[10px] text-white/25 tracking-[0.4em] uppercase font-medium">
                                            Please wait…
                                          </p>
                                        </div>
                                      </div>

                                      {/* Progress bar at bottom */}
                                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
                                        <motion.div
                                          className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-blue-500"
                                          animate={{ x: ["-100%", "100%"] }}
                                          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                      </div>
                                    </div>
                                  </div>

                                ) : msg.content.startsWith("__IMAGE__:") ? (
                                  <div className="w-full max-w-lg aspect-[4/3] rounded-[2rem] overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] group/img relative bg-[#050505]">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={msg.content.replace("__IMAGE__:", "")}
                                      alt="Generated image"
                                      className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                      <button
                                        onClick={() => {
                                          const link = document.createElement("a");
                                          link.href = msg.content.replace("__IMAGE__:", "");
                                          link.download = `generated-image-${Date.now()}.jpg`;
                                          link.click();
                                        }}
                                        className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all transform scale-90 group-hover/img:scale-100"
                                        title="Download Image"
                                      >
                                        <Download className="w-5 h-5" />
                                      </button>
                                    </div>
                                  </div>
                                ) : msg.role === "user" && msg.content.startsWith("__IMAGE_UPLOAD__:") ? (() => {
                                    const withoutPrefix = msg.content.replace("__IMAGE_UPLOAD__:", "");
                                    const newlineIdx = withoutPrefix.indexOf("\n");
                                    const imgSrc = newlineIdx !== -1 ? withoutPrefix.slice(0, newlineIdx) : withoutPrefix;
                                    const question = newlineIdx !== -1 ? withoutPrefix.slice(newlineIdx + 1) : "";
                                    return (
                                      <div className="flex flex-col gap-3">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={imgSrc}
                                          alt="Uploaded for analysis"
                                          className="max-w-[260px] rounded-2xl border border-white/10 object-cover shadow-lg"
                                        />
                                        {question && (
                                          <p className="text-sm text-white/90 font-light tracking-wide">{question}</p>
                                        )}
                                      </div>
                                    );
                                  })() : msg.role === "assistant" &&
                                idx === messages.length - 1 && (msg as any).isNew ? (
                                  <TypewriterText 
                                    content={msg.content} 
                                    chatTitle={activeChatTitle}
                                    onExpand={(code, lang, title) => setFullscreenCode({ code, language: lang, title })}
                                    onComplete={() => {
                                      if (activeChatId) {
                                        setGeneratingChatIds(prev => {
                                          const next = new Set(prev);
                                          next.delete(activeChatId);
                                          return next;
                                        });
                                      }
                                    }}
                                    isStopped={!generatingChatIds.has(activeChatId || "") && idx === messages.length - 1}
                                  />
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
                                      pre: ({ children }: any) => {
                                        const codeProps = children?.props || {};
                                        return (
                                          <CodeBlock 
                                            {...codeProps}
                                            chatTitle={activeChatTitle} 
                                            onExpand={(code: string, lang: string, title: string) => setFullscreenCode({ code, language: lang, title })} 
                                          />
                                        );
                                      },
                                      code: (props: any) => (
                                        <CodeBlock 
                                          {...props} 
                                          chatTitle={activeChatTitle} 
                                          onExpand={(code: string, lang: string, title: string) => setFullscreenCode({ code, language: lang, title })} 
                                        />
                                      ),
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
                            </>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 px-2">
                          {msg.role === "assistant" && (
                            <button
                              onClick={() => playTTS(msg.content, idx)}
                              className={cn(
                                "p-1.5 rounded-full transition-colors",
                                playingMsgIndex === idx
                                  ? "bg-violet-500/20 text-violet-400 hover:bg-violet-500/30"
                                  : "hover:bg-white/10 text-white/30 hover:text-white/70"
                              )}
                              title={playingMsgIndex === idx ? "Stop reading" : "Read aloud"}
                            >
                              {playingMsgIndex === idx ? (
                                <Square className="w-3.5 h-3.5 fill-current" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          {msg.role === "user" && editingMessageIndex !== idx && (
                            <button
                              onClick={() => {
                                if (msg.content.startsWith("__IMAGE_UPLOAD__:")) {
                                  const withoutPrefix = msg.content.replace("__IMAGE_UPLOAD__:", "");
                                  const newlineIdx = withoutPrefix.indexOf("\n");
                                  const imgSrc = newlineIdx !== -1 ? withoutPrefix.slice(0, newlineIdx) : withoutPrefix;
                                  const question = newlineIdx !== -1 ? withoutPrefix.slice(newlineIdx + 1) : "";
                                  setEditImagePrefix(`__IMAGE_UPLOAD__:${imgSrc}\n`);
                                  setEditValue(question);
                                } else {
                                  setEditValue(msg.content);
                                  setEditImagePrefix("");
                                }
                                setEditingMessageIndex(idx);
                              }}
                              className="p-1.5 rounded-full hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
                              title="Edit message"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <CopyButton 
                            text={msg.content.startsWith("__IMAGE_UPLOAD__:") ? (() => { const wp = msg.content.replace("__IMAGE_UPLOAD__:", ""); const ni = wp.indexOf("\n"); return ni !== -1 ? wp.slice(ni + 1) : ""; })() : msg.content}
                            className="p-1.5 rounded-full hover:bg-white/10 text-white/30 hover:text-white/70"
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {isTyping && !isResearching && !isAnalyzingImage && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex justify-start"
                    >
                      <div className="bg-white/[0.03] border border-white/[0.05] rounded-[2.2rem] rounded-tl-none px-7 py-5 backdrop-blur-xl shadow-2xl ml-4">
                        <ThinkingLoader />
                      </div>
                    </motion.div>
                  )}
                  {isAnalyzingImage && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex justify-start"
                    >
                      <div className="bg-white/[0.03] border border-fuchsia-500/[0.15] rounded-[2.2rem] rounded-tl-none px-7 py-5 backdrop-blur-xl shadow-2xl ml-4 flex items-center gap-3">
                        <div className="flex gap-1.5">
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              className="w-1.5 h-1.5 rounded-full bg-fuchsia-400"
                              animate={{ y: [0, -6, 0], opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
                            />
                          ))}
                        </div>
                        <motion.span
                          className="text-[11px] font-black uppercase tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-400 via-white to-violet-400 bg-[length:200%_auto]"
                          animate={{ backgroundPosition: ["200% center", "-200% center"] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        >
                          Analyzing Image
                        </motion.span>
                      </div>
                    </motion.div>
                  )}
                  {isResearching && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex justify-start"
                    >
                      <div className="bg-cyan-500/[0.05] border border-cyan-500/[0.2] rounded-[2.2rem] rounded-tl-none px-7 py-5 backdrop-blur-xl shadow-2xl ml-4 flex items-center gap-4">
                        <div className="relative w-7 h-7 flex items-center justify-center">
                          <motion.div
                            className="absolute inset-0 rounded-full border-2 border-cyan-400/40"
                            animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                          />
                          <Globe className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <motion.span
                            className="text-[11px] font-black uppercase tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-white to-sky-400 bg-[length:200%_auto]"
                            animate={{ backgroundPosition: ["200% center", "-200% center"] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          >
                            Researching the web
                          </motion.span>
                          <span className="text-[9px] text-cyan-400/60 uppercase tracking-wider">Plan · Search · Synthesize</span>
                        </div>
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
          <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none bg-gradient-to-t from-black via-black/80 to-transparent pt-10 md:pt-16 pb-2">
            <div className="max-w-4xl mx-auto px-4 md:px-6 pb-4 md:pb-6">
              <motion.div
                layoutId="input-box"
                className="pointer-events-auto backdrop-blur-xl bg-white/[0.05] rounded-[1.5rem] border border-white/[0.08]"
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
      </>
    )} {/* end IMAGES ternary */}

        <AnimatePresence>
          {showCommandPalette && (
            <motion.div
              ref={commandPaletteRef}
              className="fixed left-1/2 -translate-x-1/2 bottom-[140px] w-[95%] md:w-full max-w-lg backdrop-blur-xl bg-[#0A0A0B]/90 rounded-3xl z-50 border border-white/10 overflow-hidden p-3 command-palette-container"
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

      <AnimatePresence>
        {fullscreenCode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, scale: 1, backdropFilter: "blur(20px)" }}
            exit={{ opacity: 0, scale: 0.98, backdropFilter: "blur(0px)" }}
            className="fixed inset-0 z-[100] flex flex-col bg-black/80 p-6 md:p-12"
          >
            <div className="flex items-center justify-between mb-6 pb-6 border-b border-white/10">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-violet-400 lowercase bg-violet-500/10 border border-violet-500/20 px-2 py-1 rounded-md">
                    {fullscreenCode.language}
                  </span>
                  <h3 className="text-lg font-semibold text-white/90 tracking-tight">Full Screen Code View</h3>
                </div>
                <p className="text-xs text-white/40 italic ml-0.5">{fullscreenCode.title}</p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    try { navigator.clipboard.writeText(fullscreenCode.code); } catch {}
                    const btn = document.getElementById('modal-copy-btn');
                    if (btn) {
                      const toast = document.createElement('span');
                      toast.className = "pointer-events-none absolute left-1/2 bottom-full mb-1 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white whitespace-nowrap z-[110]";
                      toast.style.background = "linear-gradient(135deg, #7c3aed, #a855f7)";
                      toast.style.boxShadow = "0 4px 15px rgba(139,92,246,0.5)";
                      toast.style.animation = "copied-toast 1.8s ease forwards";
                      toast.innerText = "✓ Copied!";
                      btn.appendChild(toast);
                      setTimeout(() => toast.remove(), 2000);
                    }
                  }}
                  id="modal-copy-btn"
                  className="relative flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-bold text-white/60 hover:text-white/90 transition-all border border-white/10 active:scale-95"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy Code</span>
                </button>
                <button
                  onClick={() => setFullscreenCode(null)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-red-500/20 rounded-2xl text-xs font-bold text-white/60 hover:text-red-400 transition-all border border-white/10 hover:border-red-500/30 group"
                >
                  <X className="w-4 h-4 transition-transform group-hover:rotate-90" />
                  <span>Close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar rounded-2xl bg-black/40 border border-white/5 shadow-2xl">
              <SyntaxHighlighter
                language={fullscreenCode.language === "text" ? "javascript" : fullscreenCode.language}
                style={vscDarkPlus}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  background: "transparent",
                  padding: "2.5rem",
                  fontSize: "15px",
                  lineHeight: "1.7",
                }}
                showLineNumbers={true}
                wrapLongLines={false}
              >
                {fullscreenCode.code}
              </SyntaxHighlighter>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  function renderInputContent() {
    return (
      <>
        {/* Attached Image Preview */}
        <AnimatePresence>
          {attachedImage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="px-5 pt-4 pb-2 border-b border-white/[0.05] flex items-center gap-3"
            >
              <div className="relative group/img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachedImage.base64}
                  alt={attachedImage.name}
                  title={attachedImage.name}
                  className="h-14 w-14 rounded-xl object-cover border border-white/10"
                />
                <button
                  onClick={() => setAttachedImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                >
                  <XIcon className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                {fileAttachedToNextMessage.map((att, idx) => (
                  <motion.div
                    key={`${att.name}-${idx}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-xs group transition-colors hover:bg-white/10"
                  >
                    {processingSessions.has(att.sessionId ?? "") ? (
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
                        <span className="text-violet-400/70 text-[10px] font-medium">Reading...</span>
                      </div>
                    ) : att.thumbnail ? (
                      <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-black/30 p-0.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={att.thumbnail} alt={att.name} className="w-full h-full object-contain rounded-md" />
                      </div>
                    ) : (
                      <FileText className="w-4 h-4 text-violet-400" />
                    )}
                    <span className="text-white/80 max-w-[120px] truncate font-medium">
                      {att.name}
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

        <div className="p-3 md:p-4 relative">
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
          {activeIntent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              className={cn(
                "absolute top-4 right-6 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg border",
                activeIntent === "research" ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" :
                activeIntent === "code" ? "bg-violet-500/10 border-violet-500/30 text-violet-400" :
                activeIntent === "image" ? "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400" :
                "bg-amber-500/10 border-amber-500/30 text-amber-400"
              )}
            >
              {activeIntent === "research" ? <Globe className="w-3.5 h-3.5 animate-pulse" /> :
               activeIntent === "code" ? <Code2 className="w-3.5 h-3.5" /> :
               activeIntent === "image" ? <ImageIcon className="w-3.5 h-3.5" /> :
               <Lightbulb className="w-3.5 h-3.5" />}
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                {activeIntent === "research" ? "Research Mode" :
                 activeIntent === "code" ? "Coding Mode" :
                 activeIntent === "image" ? "Image Gen" :
                 "Brainstorming"}
              </span>
              <button 
                onClick={() => {
                  if (activeIntent === "research") setIsResearchMode(false);
                  setActiveIntent(null);
                }}
                className="hover:text-white transition-colors"
              >
                <X className="w-3 h-3 ml-1" />
              </button>
            </motion.div>
          )}
          <div className="relative">
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
                "w-full px-4 py-2 md:py-3 pr-12 md:pr-4",
                "resize-none",
                "bg-transparent",
                "border-none",
                "text-white/90 text-sm leading-relaxed",
                "focus:outline-none",
                "placeholder:text-white/20",
                "min-h-[44px] md:min-h-[60px]",
                isRecording && "opacity-0 pointer-events-none",
              )}
              showRing={false}
            />
            {/* Mobile send button */}
            <motion.button
              onClick={() => {
                if (isGenerating) { stopGeneration(); return; }
                if (attachedImage) {
                  sendImageForAnalysis(value.trim(), attachedImage.base64, attachedImage.name);
                } else {
                  handleSendMessage();
                }
              }}
              disabled={(!isGenerating && !value.trim() && !attachedImage) || isUploading}
              className={cn(
                "md:hidden absolute bottom-1.5 right-1.5 p-2 rounded-xl transition-all duration-300",
                "flex items-center justify-center",
                (value.trim() || isGenerating || attachedImage) && !isUploading
                  ? "bg-white text-black"
                  : "bg-white/5 text-white/20",
              )}
            >
              {isGenerating ? (
                <Square className="w-4 h-4 fill-current" />
              ) : (
                <SendIcon className="w-4 h-4" />
              )}
            </motion.button>
          </div>
        </div>

        <div className="px-3 md:px-5 pb-3 md:pb-5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 md:gap-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full sm:w-auto">
            {/* Attachments Dropdown */}
            <div className="relative attach-menu-container">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className={cn(
                  "p-2 md:p-2.5 rounded-xl transition-all duration-300",
                  showAttachMenu ? "bg-white/15 text-white" : "text-white/30 hover:text-white/90 hover:bg-white/5"
                )}
              >
                <Paperclip className="w-4 h-4 md:w-5 md:h-5" />
              </motion.button>
              
              <AnimatePresence>
                {showAttachMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full left-0 mb-3 w-48 bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-1.5 z-50"
                  >
                    <button
                      onClick={() => { handleAttachFile(); setShowAttachMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 rounded-xl text-xs font-medium text-white/70 hover:text-white transition-all"
                    >
                      <FileText className="w-4 h-4 text-violet-400" />
                      <span>Attach Document</span>
                    </button>
                    <button
                      onClick={() => { imageInputRef.current?.click(); setShowAttachMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 rounded-xl text-xs font-medium text-white/70 hover:text-white transition-all"
                    >
                      <ImageIcon className="w-4 h-4 text-fuchsia-400" />
                      <span>Upload Image</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Quick Actions Dropdown */}
            <div className="relative actions-menu-container">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                className={cn(
                  "p-2 md:p-2.5 rounded-xl transition-all duration-300",
                  showActionsMenu ? "bg-white/15 text-white" : "text-white/30 hover:text-white/90 hover:bg-white/5"
                )}
              >
                <Command className="w-4 h-4 md:w-5 md:h-5" />
              </motion.button>

              <AnimatePresence>
                {showActionsMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full left-0 mb-3 w-56 bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-1.5 z-50"
                  >
                    {commandSuggestions.map((cmd, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectCommandSuggestion(idx)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all",
                          activeIntent === cmd.prefix.slice(1) || (cmd.prefix === "/research" && isResearchMode)
                            ? "bg-white/10 text-white"
                            : "text-white/50 hover:bg-white/5 hover:text-white"
                        )}
                      >
                        <span className="text-violet-400">{cmd.icon}</span>
                        <div className="flex flex-col items-start">
                          <span>{cmd.label}</span>
                          <span className="text-[9px] opacity-40 font-normal">{cmd.description}</span>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Voice Call */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsCallOpen(true)}
              title="Start Voice Call"
              className="p-2 md:p-2.5 rounded-xl transition-colors text-white/30 hover:text-violet-400 hover:bg-violet-500/10"
            >
              <Mic className="w-4 h-4 md:w-5 md:h-5" />
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setUseFreeTier(!useFreeTier)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 md:gap-1.5 md:px-2.5 md:py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border",
                useFreeTier
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/15"
              )}
              title={useFreeTier ? "Free Tier — click to use your own API key" : "Custom API — click to switch to free tier"}
            >
              {useFreeTier ? <Zap className="w-3 h-3" /> : <Key className="w-3 h-3" />}
              <span>{useFreeTier ? "Free Tier" : "Custom API"}</span>
            </motion.button>
            <div className="h-5 md:h-6 w-[1px] bg-white/10 mx-1" />
            <ProviderSelector />
          </div>

          <motion.button
            onClick={() => {
              if (isGenerating) { stopGeneration(); return; }
              if (attachedImage) {
                sendImageForAnalysis(value.trim(), attachedImage.base64, attachedImage.name);
              } else {
                handleSendMessage();
              }
            }}
            disabled={(!isGenerating && !value.trim() && !attachedImage) || isUploading}
            className={cn(
              "hidden md:flex px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-300",
              "items-center gap-2",
              (value.trim() || isGenerating || attachedImage) && !isUploading
                ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                : "bg-white/5 text-white/20",
            )}
          >
            {isGenerating ? (
              <Square className="w-4 h-4 fill-current" />
            ) : (
              <>
                <SendIcon className="w-4 h-4" />
                <span>Send</span>
              </>
            )}
          </motion.button>
        </div>
      </>
    );
  }
}

function TypewriterText({ 
  content, 
  onComplete, 
  isStopped, 
  chatTitle, 
  onExpand 
}: { 
  content: string, 
  onComplete?: () => void, 
  isStopped?: boolean,
  chatTitle: string | null,
  onExpand: (code: string, lang: string, title: string) => void
}) {
  const [displayedContent, setDisplayedContent] = useState("");
  const [index, setIndex] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const hasCalledOnComplete = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Reset completion flag if content changes
    hasCalledOnComplete.current = false;
    setDisplayedContent("");
    setIndex(0);
  }, [content]);

  useEffect(() => {
    if (isStopped) {
      setDisplayedContent(content);
      setIndex(content.length);
      if (!hasCalledOnComplete.current) {
        hasCalledOnComplete.current = true;
        onCompleteRef.current?.();
      }
      return;
    }

    if (index < content.length) {
      const charsPerTick = content.length > 1000 ? 30 : content.length > 500 ? 15 : 8;
      
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, index + charsPerTick));
        setIndex((prev) => prev + charsPerTick);
      }, 5);
      return () => clearTimeout(timeout);
    } else {
      if (!hasCalledOnComplete.current) {
        hasCalledOnComplete.current = true;
        onCompleteRef.current?.();
      }
    }
  }, [content, index, isStopped]);

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
        pre: ({ children }: any) => {
          const codeProps = children?.props || {};
          return (
            <CodeBlock 
              {...codeProps}
              chatTitle={chatTitle} 
              onExpand={onExpand} 
            />
          );
        },
        code: (props: any) => (
          <CodeBlock 
            {...props} 
            chatTitle={chatTitle} 
            onExpand={onExpand} 
          />
        ),
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
    <div className="flex items-center gap-5 px-2">
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-gradient-to-t from-violet-500 to-fuchsia-400 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.3)]"
            animate={{
              y: [0, -8, 0],
              opacity: [0.3, 1, 0.3],
              scale: [1, 1.25, 1],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <div className="flex flex-col">
        <motion.span
          className="text-[11px] font-black uppercase tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-white to-fuchsia-400 bg-[length:200%_auto]"
          animate={{
            backgroundPosition: ["200% center", "-200% center"],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          Thinking
        </motion.span>
      </div>
    </div>
  );
}

function CopyButton({ text, showLabel = false, className }: { text: string, showLabel?: boolean, className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "relative flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all active:scale-95",
        copied ? "text-emerald-400 bg-emerald-500/10" : "text-white/40 hover:text-white/90 hover:bg-white/5",
        className
      )}
      title="Copy to clipboard"
    >
      {copied && (
        <span
          className="pointer-events-none absolute left-1/2 bottom-full mb-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest text-white whitespace-nowrap z-50"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            boxShadow: "0 4px 15px rgba(139,92,246,0.5)",
            animation: "copied-toast 1.8s ease forwards",
          }}
        >
          ✓ Copied!
        </span>
      )}
      <span style={copied ? { animation: "check-pop 0.3s ease forwards" } : {}}>
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </span>
      {showLabel && <span className="text-xs font-bold uppercase tracking-wider">{copied ? "Copied" : "Copy"}</span>}
    </button>
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
@keyframes copied-toast {
  0%   { opacity: 0; transform: translateX(-50%) translateY(0px) scale(0.8); }
  15%  { opacity: 1; transform: translateX(-50%) translateY(-28px) scale(1); }
  70%  { opacity: 1; transform: translateX(-50%) translateY(-28px) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-36px) scale(0.9); }
}
@keyframes check-pop {
  0%   { transform: scale(0) rotate(-12deg); opacity: 0; }
  60%  { transform: scale(1.2) rotate(4deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
@keyframes downloaded-toast {
  0%   { opacity: 0; transform: translateX(-50%) translateY(0px) scale(0.8); }
  15%  { opacity: 1; transform: translateX(-50%) translateY(-28px) scale(1); }
  70%  { opacity: 1; transform: translateX(-50%) translateY(-28px) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-36px) scale(0.9); }
}
@keyframes download-pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.9); }
  100% { opacity: 1; transform: scale(1); }
}
`;

if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.innerHTML = rippleKeyframes;
  document.head.appendChild(style);
}

function CodeBlock({ className, children, chatTitle, onExpand, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'downloaded'>('idle');
  const [isFullScreen, setIsFullScreen] = useState(false);
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
    navigator.clipboard.writeText(String(children).replace(/\n$/, "")).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className="my-4 rounded-xl overflow-hidden border border-white/10 bg-[#0d0d0d] shadow-xl transition-all duration-500 hover:border-violet-500/30 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)] group/block"
    >
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-white/10">
        <span className="text-xs font-mono text-white/50 lowercase">{language}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onExpand(String(children).replace(/\n$/, ""), language, chatTitle || "Untitled")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] uppercase tracking-wider font-bold text-white/40 hover:text-violet-300 hover:bg-white/10 hover:border-violet-500/30 active:scale-95 transition-all duration-300 bg-white/5 border border-white/5 group/btn"
            title="Expand to Full Screen"
          >
            <Maximize2 className="w-3.5 h-3.5 pointer-events-none transition-transform group-hover/btn:rotate-12" />
            <span className="pointer-events-none">Expand</span>
          </button>
          <button
            onClick={() => {
              if (downloadStatus !== 'idle') return;
              
              const codeText = String(children).replace(/\n$/, "");
              
              // 1. Try to extract filename from code comments
              const extractFilename = (code: string) => {
                const lines = code.split('\n').slice(0, 5);
                for (const line of lines) {
                  // Look for patterns like // filename: app.js, # file: main.py, or even just // index.js
                  const match = line.match(/(?:\/\/|#|--|\/\*)\s*(?:filename|file|title)?[:\s]*([a-zA-Z0-9._-]+\.[a-zA-Z0-9]+)/i);
                  if (match) return match[1];
                }
                return null;
              };

              const extractedName = extractFilename(codeText);
              
              setDownloadStatus('downloading');

              // Simulate download delay for animation
              setTimeout(() => {
                const blob = new Blob([codeText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                
                let fileName = extractedName;
                if (!fileName) {
                  let ext = "txt";
                  if (language === "javascript") ext = "js";
                  else if (language === "python") ext = "py";
                  else if (language === "typescript") ext = "ts";
                  else if (language === "html") ext = "html";
                  else if (language === "css") ext = "css";
                  else if (language !== "text") ext = language;
                  
                  const safeTitle = chatTitle ? chatTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "code_snippet";
                  fileName = `${safeTitle}.${ext}`;
                }
                
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                setDownloadStatus('downloaded');
                setTimeout(() => setDownloadStatus('idle'), 2500);
              }, 800);
            }}
            disabled={downloadStatus !== 'idle'}
            className={cn(
              "relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] uppercase tracking-wider font-bold transition-all duration-300 active:scale-95 border border-white/5 group/btn",
              downloadStatus === 'downloading' ? "text-fuchsia-400 bg-fuchsia-500/10 cursor-wait" : 
              downloadStatus === 'downloaded' ? "text-emerald-400 bg-emerald-500/10" : 
              "text-white/40 hover:text-fuchsia-300 hover:bg-white/10 hover:border-fuchsia-500/30 bg-white/5"
            )}
            title="Download Code"
          >
            {downloadStatus === 'downloaded' && (
              <span
                className="pointer-events-none absolute left-1/2 bottom-full mb-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest text-white whitespace-nowrap z-50"
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  boxShadow: "0 4px 15px rgba(16,185,129,0.5)",
                  animation: "downloaded-toast 1.8s ease forwards",
                }}
              >
                ✓ Downloaded!
              </span>
            )}
            
            {downloadStatus === 'downloading' ? (
              <LoaderIcon className="w-3.5 h-3.5 animate-spin pointer-events-none" />
            ) : downloadStatus === 'downloaded' ? (
              <Check className="w-3.5 h-3.5 animate-[check-pop_0.3s_ease_forwards] pointer-events-none" />
            ) : (
              <Download className="w-3.5 h-3.5 transition-transform group-hover/btn:-translate-y-0.5 pointer-events-none" />
            )}
            
            <span className="pointer-events-none">
              {downloadStatus === 'downloading' ? "Downloading..." : 
               downloadStatus === 'downloaded' ? "Done!" : "Download"}
            </span>
          </button>
          <button
            onClick={handleCopy}
            className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] uppercase tracking-wider font-bold hover:bg-white/10 active:scale-95 transition-all duration-300 bg-white/5 border border-white/5 select-none overflow-visible group/btn"
            style={{ color: copied ? "rgb(52 211 153)" : "rgba(255,255,255,0.4)" }}
            title="Copy Code"
          >
            {/* Floating "Copied!" toast — pure CSS, no re-render */}
            {copied && (
              <span
                className="pointer-events-none absolute left-1/2 bottom-full mb-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest text-white whitespace-nowrap z-50"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                  boxShadow: "0 4px 15px rgba(139,92,246,0.5)",
                  animation: "copied-toast 1.8s ease forwards",
                }}
              >
                ✓ Copied!
              </span>
            )}
            <span
              className="w-3.5 h-3.5 flex items-center justify-center shrink-0 pointer-events-none"
              style={copied ? { animation: "check-pop 0.3s ease forwards" } : {}}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 transition-transform group-hover/btn:scale-110" />
              )}
            </span>
            <span className="pointer-events-none">{copied ? "Copied!" : "Copy"}</span>
          </button>
        </div>
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
