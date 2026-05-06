"use client";

import { motion } from "framer-motion";

export function GlobalBackground() {
    return (
        <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-0 bg-black">
            <div className="absolute -top-[10%] -left-[10%] w-[70%] h-[70%] bg-purple-600/20 rounded-full mix-blend-screen filter blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
            <div className="absolute -bottom-[10%] -right-[10%] w-[70%] h-[70%] bg-purple-900/30 rounded-full mix-blend-screen filter blur-[120px] animate-[pulse_12s_ease-in-out_infinite] delay-700" />
            <div className="absolute top-[20%] left-[20%] w-[60%] h-[60%] bg-violet-800/20 rounded-full mix-blend-screen filter blur-[140px] animate-[pulse_10s_ease-in-out_infinite] delay-1000" />
            <div className="absolute bottom-[20%] left-[10%] w-[50%] h-[50%] bg-purple-700/15 rounded-full mix-blend-screen filter blur-[120px] animate-[pulse_11s_ease-in-out_infinite] delay-500" />
            <div className="absolute top-[10%] right-[10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full mix-blend-screen filter blur-[100px] animate-[pulse_9s_ease-in-out_infinite] delay-[1500ms]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]" />
        </div>
    );
}
