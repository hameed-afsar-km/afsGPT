"use client";

import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ChevronRight, Sparkles } from "lucide-react";

export default function LandingPage() {
  const [textIndex, setTextIndex] = useState(0);
  const rotatingTexts = [
    "Without Limits.",
    "That Speaks.",
    "That Sees.",
    "That Reasons.",
    "At Scale.",
  ];

  // Mouse Parallax Logic
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const smoothX = useSpring(mouseX, { damping: 50, stiffness: 400 });
  const smoothY = useSpring(mouseY, { damping: 50, stiffness: 400 });

  const backgroundX = useTransform(smoothX, [-500, 500], [20, -20]);
  const backgroundY = useTransform(smoothY, [-500, 500], [20, -20]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX - window.innerWidth / 2;
      const y = e.clientY - window.innerHeight / 2;
      mouseX.set(x);
      mouseY.set(y);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % rotatingTexts.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.3 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
    },
  };

  const tickerItems = "WORKFLOW AUTOMATION ✦ MEMORY ENABLED ✦ LIVE WEB SEARCH ✦ AI ORCHESTRATION ✦ ";

  return (
    <div className="relative min-h-screen w-full bg-black text-white overflow-hidden font-sans selection:bg-purple-500/40">
      {/* Mobile Animated Gradient Background */}
      <motion.div 
        className="absolute inset-0 z-0 block md:hidden opacity-100"
        animate={{
          background: [
            "linear-gradient(45deg, #0a0014 0%, #1a0b2e 50%, #050014 100%)",
            "linear-gradient(45deg, #050014 0%, #2d1052 50%, #0a0014 100%)",
            "linear-gradient(45deg, #0a0014 0%, #1a0b2e 50%, #050014 100%)",
          ]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
      
      {/* Desktop Parallax Background Layer */}
      <motion.div 
        style={{ 
          x: backgroundX, 
          y: backgroundY,
          backgroundImage: "url('/bg.jpeg')",
          scale: 1.1 
        }}
        className="absolute inset-0 bg-cover bg-center opacity-100 z-0 hidden md:block"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent z-10" />
      </motion.div>
      
      {/* Grid Overlay */}
      <motion.div 
        style={{ 
          x: useTransform(smoothX, [-500, 500], [10, -10]),
          y: useTransform(smoothY, [-500, 500], [10, -10]),
          backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), 
                           linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)`,
          backgroundSize: '80px 80px'
        }}
        className="absolute inset-0 z-20 opacity-[0.1]" 
      />

      {/* Navbar */}
      <nav className="fixed top-4 md:top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center justify-between w-[90%] md:w-auto gap-4 md:gap-12 px-4 md:px-8 py-3 md:py-4 backdrop-blur-2xl bg-white/5 border border-white/10 rounded-full shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <Link href="/" className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <span className="text-lg font-black tracking-tighter uppercase">afsGPT</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {['Vision', 'Voice', 'Agents', 'Docs'].map((item) => (
            <Link key={item} href="#" className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/50 hover:text-white transition-colors">
              {item}
            </Link>
          ))}
        </div>
        <Link 
          href="/chat"
          className="px-6 py-2 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-full hover:scale-105 transition-transform"
        >
          Open App
        </Link>
      </nav>

      <main className="relative z-30 pt-28 md:pt-32 lg:pt-0 lg:flex items-center min-h-screen px-6 md:px-20 max-w-[1600px] mx-auto translate-y-4 md:translate-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-20 w-full items-center pb-32">
          
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="lg:col-span-8 flex flex-col space-y-10 items-center text-center lg:items-start lg:text-left w-full mx-auto translate-y-8 md:translate-y-12"
          >
            <motion.div variants={itemVariants} className="flex items-center justify-center lg:justify-start gap-3 mt-12">
              <span className="w-8 md:w-12 h-[1px] bg-purple-500" />
              <span className="text-[11px] uppercase tracking-[0.4em] font-bold text-purple-400">Advanced Intelligence Hub</span>
              <span className="w-8 md:w-12 h-[1px] bg-purple-500 lg:hidden" />
            </motion.div>

            <motion.h1 
              variants={itemVariants}
              className="text-2xl sm:text-5xl md:text-7xl lg:text-[90px] font-black tracking-tighter leading-none lg:leading-[0.85] uppercase w-full"
            >
              Intelligence <br className="hidden lg:block" />
              <div className="relative h-[1.5em] overflow-hidden flex justify-center lg:justify-start w-full -mt-1 md:-mt-4">
                <AnimatePresence>
                  <motion.span
                    key={textIndex}
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={{ y: "-100%", opacity: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 flex items-center justify-center lg:justify-start text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-purple-600 font-black whitespace-nowrap leading-none w-full"
                  >
                    {rotatingTexts[textIndex]}
                  </motion.span>
                </AnimatePresence>
              </div>
            </motion.h1>

            <motion.p 
              variants={itemVariants}
              className="max-w-2xl text-base sm:text-lg md:text-xl text-white/70 leading-relaxed font-medium mx-auto lg:mx-0 px-4 lg:px-0 -mt-12"
            >
              Experience the ultimate multimodal workspace. AfsGPT empowers you to 
              chat with complex documents, generate high-fidelity visuals, and 
              engage in real-time voice conversations with an agent that researches 
              the web as it speaks.
            </motion.p>

            <motion.div 
              variants={itemVariants}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6 pt-4 sm:pt-6 pb-20 w-[90%] sm:w-auto mx-auto lg:mx-0 justify-center lg:justify-start"
            >
              <Link href="/chat" className="w-full sm:w-auto">
                <motion.div
                  initial="rest"
                  whileHover="hover"
                  animate="rest"
                  className="relative w-full justify-center px-8 sm:px-12 py-4 sm:py-5 bg-white overflow-hidden cursor-pointer group rounded-sm shadow-2xl flex items-center gap-3"
                >
                  <motion.div 
                    className="absolute inset-0 bg-[#581C87]"
                    variants={{
                      rest: { top: "100%" },
                      hover: { top: "0%" }
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  />
                  
                  <motion.span 
                    variants={{
                      rest: { color: "#581C87" },
                      hover: { color: "#FFFFFF" }
                    }}
                    className="relative z-10 font-black text-sm uppercase tracking-[0.2em] transition-colors duration-200"
                  >
                    Start for free
                  </motion.span>

                  <motion.div
                    variants={{
                      rest: { color: "#581C87", x: 0 },
                      hover: { color: "#FFFFFF", x: 4 }
                    }}
                    className="relative z-10 transition-colors duration-200"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </motion.div>
                </motion.div>
              </Link>
              
              <button className="w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 bg-transparent border border-white/10 text-white/40 font-black text-sm uppercase tracking-[0.2em] rounded-sm hover:bg-white/5 hover:text-white transition-all text-center">
                Contact Sales
              </button>
            </motion.div>
          </motion.div>
        </div>
      </main>

      {/* Scrolling Text Carousel Footer - Moving Right */}
      <footer className="fixed bottom-0 w-full z-[100] bg-black border-t border-white/20 py-5 overflow-hidden">
        <motion.div 
          className="flex whitespace-nowrap"
          animate={{ x: ["-50%", "0%"] }}
          transition={{ 
            duration: 25, 
            repeat: Infinity, 
            ease: "linear" 
          }}
        >
          <div className="flex gap-12 items-center text-[13px] font-black uppercase tracking-[0.5em] text-white">
            {[...Array(6)].map((_, i) => (
              <span key={i} className="flex gap-12 items-center">
                {tickerItems}
              </span>
            ))}
          </div>
        </motion.div>
      </footer>

      {/* Grain Overlay */}
      <div className="fixed inset-0 pointer-events-none z-[110] opacity-[0.03] mix-blend-overlay">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <filter id="noiseFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#noiseFilter)" />
        </svg>
      </div>
    </div>
  );
}
