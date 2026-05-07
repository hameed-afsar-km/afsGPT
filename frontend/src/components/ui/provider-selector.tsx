"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ChevronDown, 
    Cpu, 
    Key, 
    RefreshCcw, 
    Check, 
    Settings2,
    Search,
    AlertCircle,
    Loader2,
    Sparkles,
    Zap,
    Brain,
    Bot
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Provider {
    id: string;
    name: string;
    icon: React.ReactNode;
    color: string;
}

const providers: Provider[] = [
    { id: "openai", name: "OpenAI", icon: <Zap className="w-4 h-4" />, color: "text-emerald-400" },
    { id: "gemini", name: "Gemini", icon: <Sparkles className="w-4 h-4" />, color: "text-blue-400" },
    { id: "anthropic", name: "Anthropic", icon: <Brain className="w-4 h-4" />, color: "text-orange-400" },
    { id: "ollama", name: "Ollama", icon: <Cpu className="w-4 h-4" />, color: "text-violet-400" },
];

export function ProviderSelector() {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState("");
    const [models, setModels] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showApiKeyInput, setShowApiKeyInput] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);

    // Load from localStorage on mount
    useEffect(() => {
        const savedProvider = localStorage.getItem("afs-provider");
        const savedModel = localStorage.getItem("afs-model");
        const savedKeys = JSON.parse(localStorage.getItem("afs-keys") || "{}");

        if (savedProvider) setSelectedProvider(savedProvider);
        if (savedModel) setSelectedModel(savedModel);
        if (savedProvider && savedKeys[savedProvider]) {
            setApiKey(savedKeys[savedProvider]);
        }
    }, []);

    // Fetch models when provider or apiKey changes
    useEffect(() => {
        if (selectedProvider) {
            fetchModels();
        }
    }, [selectedProvider]);

    const fetchModels = async () => {
        if (!selectedProvider) return;
        
        setIsLoading(true);
        setError(null);
        
        const savedKeys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
        const currentApiKey = savedKeys[selectedProvider] || "";

        try {
            const response = await fetch("/api/models", {
                method: "POST",
                body: JSON.stringify({ provider: selectedProvider, apiKey: currentApiKey }),
                headers: { "Content-Type": "application/json" }
            });

            const data = await response.json();
            if (data.error) {
                setError(data.error);
                setModels([]);
            } else {
                setModels(data.models || []);
                // If current selected model isn't in the list, clear it or pick first
                if (data.models?.length > 0 && (!selectedModel || !data.models.includes(selectedModel))) {
                    const firstModel = data.models[0];
                    setSelectedModel(firstModel);
                    localStorage.setItem("afs-model", firstModel);
                }
            }
        } catch (err) {
            setError("Failed to connect to service");
        } finally {
            setIsLoading(false);
        }
    };

    const handleProviderSelect = (providerId: string) => {
        setSelectedProvider(providerId);
        localStorage.setItem("afs-provider", providerId);
        
        const savedKeys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
        setApiKey(savedKeys[providerId] || "");
        
        // Hide API key input initially unless it's missing and needed
        setShowApiKeyInput(false);
    };

    const handleModelSelect = (model: string) => {
        setSelectedModel(model);
        localStorage.setItem("afs-model", model);
        setIsOpen(false);
    };

    const handleSaveApiKey = () => {
        if (!selectedProvider) return;
        const savedKeys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
        savedKeys[selectedProvider] = apiKey;
        localStorage.setItem("afs-keys", JSON.stringify(savedKeys));
        setShowApiKeyInput(false);
        fetchModels();
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const activeProvider = providers.find(p => p.id === selectedProvider);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-medium transition-all border",
                    isOpen 
                        ? "bg-white/10 border-white/20 text-white shadow-lg" 
                        : "bg-white/[0.03] border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5"
                )}
            >
                {activeProvider ? (
                    <>
                        <span className={activeProvider.color}>{activeProvider.icon}</span>
                        <span className="max-w-[120px] truncate">
                            {activeProvider.name} • {selectedModel || "Select Model"}
                        </span>
                    </>
                ) : (
                    <>
                        <Bot className="w-4 h-4 text-white/40" />
                        <span>Select Provider</span>
                    </>
                )}
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", isOpen && "rotate-180")} />
            </motion.button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ type: "spring", damping: 20, stiffness: 300 }}
                        className="absolute bottom-full left-0 mb-4 w-80 backdrop-blur-[40px] bg-[#0d0d0d]/80 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden z-[9999]"
                    >
                        {/* Grain effect overlay */}
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] brightness-100 contrast-150" />
                        
                        <div className="relative p-5 space-y-5">
                            {/* Provider Selection */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 ml-1">
                                    <div className="w-1 h-3 bg-violet-500 rounded-full" />
                                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">Provider</label>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {providers.map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleProviderSelect(p.id)}
                                            className={cn(
                                                "flex items-center gap-2.5 px-3 py-3 rounded-xl text-xs transition-all duration-300 border relative group overflow-hidden",
                                                selectedProvider === p.id
                                                    ? "bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                                                    : "bg-white/[0.02] border-white/5 text-white/40 hover:bg-white/5 hover:border-white/10 hover:text-white/70"
                                            )}
                                        >
                                            <span className={cn("transition-transform duration-300 group-hover:scale-110", p.color)}>{p.icon}</span>
                                            <span className="font-medium">{p.name}</span>
                                            {selectedProvider === p.id && (
                                                <motion.div 
                                                    layoutId="active-provider-glow"
                                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent"
                                                />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* API Key Section */}
                            {selectedProvider && selectedProvider !== "ollama" && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between ml-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-3 bg-fuchsia-500 rounded-full" />
                                            <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">API Configuration</label>
                                        </div>
                                        {!showApiKeyInput && (
                                            <button 
                                                onClick={() => setShowApiKeyInput(true)}
                                                className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors uppercase tracking-wider"
                                            >
                                                {apiKey ? "Change" : "Add Key"}
                                            </button>
                                        )}
                                    </div>
                                    
                                    {showApiKeyInput ? (
                                        <div className="flex gap-2">
                                            <div className="relative flex-1 group">
                                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20 group-focus-within:text-violet-400 transition-colors" />
                                                <input
                                                    type="password"
                                                    value={apiKey}
                                                    onChange={(e) => setApiKey(e.target.value)}
                                                    placeholder={`Enter ${activeProvider?.name} API Key`}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-3 text-xs text-white focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.08] transition-all"
                                                />
                                            </div>
                                            <button 
                                                onClick={handleSaveApiKey}
                                                className="bg-white text-black px-3 rounded-xl hover:bg-white/90 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : apiKey ? (
                                        <div className="flex items-center justify-between px-4 py-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl group cursor-pointer hover:bg-emerald-500/10 transition-all" onClick={() => setShowApiKeyInput(true)}>
                                            <div className="flex items-center gap-2">
                                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                <span className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-widest">Key Active</span>
                                            </div>
                                            <div className="flex gap-1">
                                                {[1,2,3,4].map(i => <div key={i} className="w-1 h-1 rounded-full bg-emerald-400/30" />)}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/5 border border-red-500/10 rounded-xl">
                                            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                                            <span className="text-[10px] text-red-400/80 font-bold uppercase tracking-widest">Action Required</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Model Selection */}
                            {selectedProvider && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between ml-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-3 bg-blue-500 rounded-full" />
                                            <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">Select Model</label>
                                        </div>
                                        <button 
                                            onClick={fetchModels}
                                            disabled={isLoading}
                                            className="p-1.5 hover:bg-white/5 rounded-lg transition-all group"
                                        >
                                            <RefreshCcw className={cn("w-3 h-3 text-white/30 group-hover:text-white/60 transition-all", isLoading && "animate-spin text-violet-400")} />
                                        </button>
                                    </div>

                                    {error ? (
                                        <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl flex items-center gap-3">
                                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                                            <span className="text-[11px] text-red-400/80 leading-snug">{error}</span>
                                        </div>
                                    ) : (
                                        <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1 pr-1.5 -mr-1.5">
                                            {models.length > 0 ? (
                                                models.map((model) => (
                                                    <button
                                                        key={model}
                                                        onClick={() => handleModelSelect(model)}
                                                        className={cn(
                                                            "w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs transition-all group relative overflow-hidden",
                                                            selectedModel === model
                                                                ? "bg-violet-500/10 text-white border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]"
                                                                : "text-white/40 hover:bg-white/5 hover:text-white/70 border border-transparent"
                                                        )}
                                                    >
                                                        <span className={cn("truncate relative z-10 font-medium", selectedModel === model ? "text-violet-200" : "")}>
                                                            {model}
                                                        </span>
                                                        {selectedModel === model ? (
                                                            <div className="flex items-center gap-1.5 relative z-10">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                                                                <Check className="w-3.5 h-3.5 text-violet-400" />
                                                            </div>
                                                        ) : (
                                                            <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-20 -rotate-90 transition-all" />
                                                        )}
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="py-10 text-center space-y-3">
                                                    {isLoading ? (
                                                        <div className="flex flex-col items-center gap-3">
                                                            <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                                                            <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] font-bold">Scanning models...</p>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <Search className="w-6 h-6 text-white/5 mx-auto" />
                                                            <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] font-bold">No models found</p>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        {/* Footer */}
                        <div className="bg-white/[0.02] border-t border-white/5 p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Settings2 className="w-3.5 h-3.5 text-white/20" />
                                <span className="text-[10px] text-white/20 uppercase tracking-tighter font-bold">Afs AI Config</span>
                            </div>
                            {selectedProvider === "ollama" && (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-violet-500/10 border border-violet-500/20">
                                    <div className="w-1 h-1 rounded-full bg-violet-400 animate-pulse" />
                                    <span className="text-[9px] text-violet-400 font-bold uppercase tracking-wider">Local Mode</span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
