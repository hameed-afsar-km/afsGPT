"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
    const [ollamaMode, setOllamaMode] = useState<"default" | "custom">("default");
    const [mounted, setMounted] = useState(false);


    // Set mounted on client
    useEffect(() => {
        setMounted(true);
    }, []);

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

    const fetchModels = async (providerId?: string) => {
        const targetProvider = providerId || selectedProvider;
        if (!targetProvider) return;
        
        setIsLoading(true);
        setError(null);
        
        const savedKeys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
        const currentApiKey = savedKeys[targetProvider] || "";

        try {
            const response = await fetch("/api/models", {
                method: "POST",
                body: JSON.stringify({ provider: targetProvider, apiKey: currentApiKey }),
                headers: { "Content-Type": "application/json" }
            });

            const data = await response.json();
            if (data.error) {
                setError(data.error);
                setModels([]);
            } else {
                setModels(data.models || []);
                
                if (data.models?.length > 0) {
                    if (selectedModel && !data.models.includes(selectedModel)) {
                        if (targetProvider === "ollama" && selectedModel === "Use default models (Qwen 2.5 Coder + Llama 3.2 Vision)") {
                            setOllamaMode("default");
                        } else if (targetProvider === "ollama") {
                            // It's a real custom model that they entered manually before, or we don't have the tag
                            setOllamaMode("custom");
                        } else {
                            setSelectedModel(data.models[0]);
                        }
                    } else if (!selectedModel) {
                        if (targetProvider === "ollama") {
                            setOllamaMode("default");
                            setSelectedModel("Use default models (Qwen 2.5 Coder + Llama 3.2 Vision)");
                        } else {
                            setSelectedModel(data.models[0]);
                        }
                    } else if (targetProvider === "ollama") {
                        setOllamaMode("custom");
                    }
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
        const savedKeys = JSON.parse(localStorage.getItem("afs-keys") || "{}");
        setApiKey(savedKeys[providerId] || "");
        setShowApiKeyInput(false);
        fetchModels(providerId);
    };

    const handleModelSelect = (model: string) => {
        setSelectedModel(model);
    };

    const handleApply = () => {
        if (selectedProvider) localStorage.setItem("afs-provider", selectedProvider);
        if (selectedModel) {
            localStorage.setItem("afs-model", selectedModel);
        }
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

    const activeProvider = providers.find(p => p.id === selectedProvider);
    const [searchQuery, setSearchQuery] = useState("");

    const filteredModels = selectedProvider === "ollama" && ollamaMode === "default" 
        ? ["Use default models (Qwen 2.5 Coder + Llama 3.2 Vision)"]
        : models.filter(m => m.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="relative">
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

            {/* Redesigned Modal-style Dropdown with Portal */}
            {mounted && createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <>
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsOpen(false)}
                                className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9998]"
                            />

                            {/* Modal Content */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-2xl max-h-[85vh] backdrop-blur-[50px] bg-[#0a0a0a]/90 border border-white/10 rounded-[2rem] shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden z-[9999] flex flex-col"
                            >
                                {/* Grain effect overlay */}
                                <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] brightness-100 contrast-150" />
                                
                                {/* Header */}
                                <div className="relative p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center border border-white/10">
                                            <Bot className="w-5 h-5 text-violet-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-semibold text-white tracking-tight">Model Browser</h2>
                                            <p className="text-xs text-white/40 font-medium">Configure your AI intelligence</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setIsOpen(false)}
                                        className="p-2 hover:bg-white/5 rounded-xl text-white/30 hover:text-white transition-colors"
                                    >
                                        <ChevronDown className="w-6 h-6 rotate-90" />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                                    {/* Left Side: Providers */}
                                    <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/5 p-4 space-y-4 bg-black/20">
                                        <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 ml-2">Provider</label>
                                        <div className="space-y-1.5">
                                            {providers.map((p) => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => handleProviderSelect(p.id)}
                                                    className={cn(
                                                        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition-all duration-300 border relative group",
                                                        selectedProvider === p.id
                                                            ? "bg-white/10 border-white/20 text-white shadow-lg"
                                                            : "bg-white/[0.02] border-white/5 text-white/40 hover:bg-white/5 hover:border-white/10 hover:text-white/70"
                                                    )}
                                                >
                                                    <span className={cn("transition-transform duration-300 group-hover:scale-110", p.color)}>{p.icon}</span>
                                                    <span className="font-medium">{p.name}</span>
                                                    {selectedProvider === p.id && (
                                                        <motion.div 
                                                            layoutId="active-provider-indicator"
                                                            className="absolute left-0 w-1 h-6 bg-violet-500 rounded-full"
                                                        />
                                                    )}
                                                </button>
                                            ))}
                                        </div>

                                        {/* API Status in Provider List */}
                                        {selectedProvider && selectedProvider !== "ollama" && (
                                            <div className="pt-4 mt-4 border-t border-white/5">
                                                <div className="flex items-center justify-between px-2 mb-2">
                                                    <span className="text-[10px] uppercase tracking-wider font-bold text-white/20">API Key</span>
                                                    <button 
                                                        onClick={() => setShowApiKeyInput(true)}
                                                        className="text-[10px] font-bold text-violet-400 hover:text-violet-300"
                                                    >
                                                        {apiKey ? "Edit" : "Add"}
                                                    </button>
                                                </div>
                                                {apiKey ? (
                                                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                                                        <Check className="w-3 h-3 text-emerald-400" />
                                                        <span className="text-[10px] text-emerald-400/70 font-medium">Configured</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 px-3 py-2 bg-red-500/5 border border-red-500/10 rounded-xl">
                                                        <AlertCircle className="w-3 h-3 text-red-400" />
                                                        <span className="text-[10px] text-red-400/70 font-medium">Missing Key</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Side: Models & Config */}
                                    <div className="flex-1 flex flex-col bg-white/[0.01]">
                                        {showApiKeyInput && selectedProvider !== "ollama" ? (
                                            <div className="p-8 flex flex-col items-center justify-center h-full space-y-6 text-center">
                                                <div className="w-16 h-16 rounded-3xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                                                    <Key className="w-8 h-8 text-violet-400" />
                                                </div>
                                                <div className="space-y-2">
                                                    <h3 className="text-xl font-semibold text-white">Enter API Key</h3>
                                                    <p className="text-sm text-white/40 max-w-[280px]">Required to fetch and use models from {activeProvider?.name}</p>
                                                </div>
                                                <div className="flex gap-2 w-full max-w-sm">
                                                    <input
                                                        type="password"
                                                        autoFocus
                                                        value={apiKey}
                                                        onChange={(e) => setApiKey(e.target.value)}
                                                        placeholder={`${activeProvider?.name} API Key`}
                                                        className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-all"
                                                    />
                                                    <button 
                                                        onClick={handleSaveApiKey}
                                                        className="bg-white text-black px-6 rounded-2xl font-bold hover:bg-white/90 transition-all"
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                                <button 
                                                    onClick={() => setShowApiKeyInput(false)}
                                                    className="text-xs text-white/30 hover:text-white/60 transition-colors"
                                                >
                                                    Back to model selection
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="p-6 flex flex-col h-full space-y-4">
                                                {selectedProvider === "ollama" && (
                                                    <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 shrink-0">
                                                        <button
                                                            onClick={() => { setOllamaMode("default"); setSelectedModel("Use default models (Qwen 2.5 Coder + Llama 3.2 Vision)"); }}
                                                            className={cn("flex-1 text-xs py-2 rounded-lg font-bold transition-all", ollamaMode === "default" ? "bg-violet-500/20 text-violet-300 shadow-sm" : "text-white/40 hover:text-white/70")}
                                                        >
                                                            Use default models
                                                        </button>
                                                        <button
                                                            onClick={() => { setOllamaMode("custom"); if (models.length > 0) setSelectedModel(models[0]); }}
                                                            className={cn("flex-1 text-xs py-2 rounded-lg font-bold transition-all", ollamaMode === "custom" ? "bg-violet-500/20 text-violet-300 shadow-sm" : "text-white/40 hover:text-white/70")}
                                                        >
                                                            Custom Models
                                                        </button>
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 shrink-0">
                                                    <Search className="w-4 h-4 text-white/20" />
                                                    <input 
                                                        type="text"
                                                        placeholder="Search models..."
                                                        value={searchQuery}
                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                        className="bg-transparent border-none focus:outline-none text-sm text-white placeholder:text-white/20 flex-1"
                                                    />
                                                    {isLoading && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
                                                </div>

                                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                                                    {error ? (
                                                        <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                                                            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                                                                <AlertCircle className="w-6 h-6 text-red-400" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <p className="text-sm font-semibold text-red-400">Connection Failed</p>
                                                                <p className="text-xs text-white/30">{error}</p>
                                                            </div>
                                                            <button 
                                                                onClick={() => fetchModels()}
                                                                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-medium text-white transition-all border border-white/10"
                                                            >
                                                                Retry Connection
                                                            </button>
                                                        </div>
                                                    ) : filteredModels.length > 0 ? (
                                                        <div className="grid grid-cols-1 gap-1.5">
                                                            {filteredModels.map((model) => (
                                                                <div key={model} className="flex flex-col gap-2">
                                                                    <button
                                                                        onClick={() => handleModelSelect(model)}
                                                                        className={cn(
                                                                            "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm transition-all group relative overflow-hidden",
                                                                            selectedModel === model
                                                                                ? "bg-violet-500/10 text-white border border-violet-500/20"
                                                                                : "text-white/40 hover:bg-white/5 hover:text-white/80 border border-transparent"
                                                                        )}
                                                                    >
                                                                        <div className="flex items-center gap-3 relative z-10">
                                                                            <div className={cn(
                                                                                "w-2 h-2 rounded-full transition-all",
                                                                                selectedModel === model ? "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]" : "bg-white/10"
                                                                            )} />
                                                                            <span className="font-medium">{model}</span>
                                                                        </div>
                                                                        {selectedModel === model && (
                                                                            <Check className="w-4 h-4 text-violet-400 relative z-10" />
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                                                            <Search className="w-10 h-10 text-white/5" />
                                                            <p className="text-xs text-white/20 font-bold uppercase tracking-widest">No models found</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="p-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-between px-6">
                                    <div className="flex items-center gap-2">
                                        <Settings2 className="w-4 h-4 text-white/20" />
                                        <span className="text-[10px] text-white/20 uppercase tracking-widest font-bold">Afs AI Intelligence Hub</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] text-white/20">Selected: <span className="text-violet-400/80">{selectedModel || "None"}</span></span>
                                        <button 
                                            onClick={handleApply}
                                            className="px-5 py-1.5 bg-white text-black rounded-full text-xs font-bold hover:bg-white/90 transition-all shadow-lg"
                                        >
                                            Apply Model
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
            document.body
            )}
        </div>
    );
}
