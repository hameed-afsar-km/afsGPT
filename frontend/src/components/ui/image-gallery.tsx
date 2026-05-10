import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChat, GeneratedImage } from "@/context/ChatContext";
import { X, MessageSquare, Download } from "lucide-react";

export function ImageGallery() {
    const { images, setActiveChatId } = useChat();
    const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

    return (
        <div className="flex-1 w-full h-full overflow-y-auto custom-scrollbar p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400">
                        Generated Images
                    </h1>
                    <span className="text-white/40 text-sm">
                        {images.length} {images.length === 1 ? 'image' : 'images'}
                    </span>
                </div>

                {images.length === 0 ? (
                    <div className="text-center py-32 text-white/30 text-lg">
                        No images generated yet. Ask the AI to generate some!
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {images.map((img) => (
                            <motion.div
                                key={img.id}
                                layoutId={`img-${img.id}`}
                                className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer border border-white/10 bg-white/5"
                                onClick={() => setSelectedImage(img)}
                                whileHover={{ scale: 1.02, y: -4 }}
                                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={img.url}
                                    alt={img.prompt}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-4 flex flex-col justify-end">
                                    <p className="text-white/90 text-sm line-clamp-2 font-medium">
                                        {img.prompt}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
                        onClick={() => setSelectedImage(null)}
                    >
                        <motion.div
                            layoutId={`img-${selectedImage.id}`}
                            className="relative max-w-5xl max-h-[90vh] w-full flex flex-col md:flex-row gap-6 bg-[#0A0A0B] border border-white/10 rounded-3xl p-6 shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setSelectedImage(null)}
                                className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="flex-1 rounded-2xl overflow-hidden border border-white/5 bg-black">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={selectedImage.url}
                                    alt={selectedImage.prompt}
                                    className="w-full h-full object-contain"
                                />
                            </div>

                            <div className="w-full md:w-80 flex flex-col gap-6 py-2">
                                <div className="space-y-3">
                                    <h3 className="text-white/40 uppercase tracking-wider text-xs font-bold">Prompt</h3>
                                    <p className="text-white/90 text-sm leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/10">
                                        {selectedImage.prompt}
                                    </p>
                                </div>

                                <div className="flex-1" />

                                <div className="flex flex-col gap-3 mt-auto">
                                    <button
                                        onClick={() => {
                                            const link = document.createElement("a");
                                            link.href = selectedImage.url;
                                            link.download = `generated-image-${selectedImage.id}.jpg`;
                                            link.click();
                                        }}
                                        className="w-full flex items-center justify-center gap-2 py-3.5 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl border border-white/10 transition-all"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download Image
                                    </button>

                                    <button
                                        onClick={() => {
                                            setActiveChatId(selectedImage.chatId);
                                        }}
                                        className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 font-semibold rounded-xl border border-violet-500/30 transition-all shadow-[0_0_20px_rgba(139,92,246,0.1)]"
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                        Go to Chat
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
