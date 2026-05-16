"use client";

import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, Variants } from "framer-motion";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ChevronRight, Sparkles, Code2, User2, Globe, Phone, Mail } from "lucide-react";

export default function LandingPage() {
  const [textIndex, setTextIndex] = useState(0);
  const [navTextIndex, setNavTextIndex] = useState(0);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const rotatingTexts = [
    "Without Limits.",
    "That Speaks.",
    "That Sees.",
    "That Reasons.",
    "At Scale.",
  ];
  const navPrefixes = ["Developed By", "Designed By", "Engineered By", "Architected By"];

  const GithubLogo = () => (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-purple-400">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );

  const LinkedinLogo = () => (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-purple-400">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );

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
    const navInterval = setInterval(() => {
      setNavTextIndex((prev) => (prev + 1) % navPrefixes.length);
    }, 4000);
    return () => {
      clearInterval(interval);
      clearInterval(navInterval);
    };
  }, []);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.3 },
    },
  };

  const itemVariants: Variants = {
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
        <div className="hidden md:flex items-center min-w-[320px] justify-center">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold text-white/40">
            <div className="relative h-[1.2em] overflow-hidden min-w-[140px] text-right">
              <AnimatePresence mode="wait">
                <motion.span
                  key={navTextIndex}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 flex items-center justify-end text-purple-400"
                >
                  {navPrefixes[navTextIndex]}
                </motion.span>
              </AnimatePresence>
            </div>
            <span className="text-white/20">:</span>
            <span className="text-white/70 whitespace-nowrap">Hameed Afsar K M</span>
          </div>
        </div>
        <Link href="/chat">
          <motion.div
            whileHover={{ scale: 1.05, backgroundColor: "#fff", boxShadow: "0 0 20px rgba(255,255,255,0.4)" }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-2 bg-white/90 text-black text-[10px] font-black uppercase tracking-widest rounded-full transition-colors"
          >
            Open App
          </motion.div>
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

              <button
                onClick={() => setIsContactOpen(true)}
                className="w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 bg-transparent border border-white/10 text-white/40 font-black text-sm uppercase tracking-[0.2em] rounded-sm hover:bg-white/5 hover:text-white transition-all text-center"
              >
                Contact Developer
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
            duration: 30,
            repeat: Infinity,
            ease: "linear"
          }}
        >
          <div className="flex items-center text-[13px] font-black uppercase tracking-[0.4em] text-white">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex items-center">
                <span className="mx-12">WORKFLOW AUTOMATION</span>
                <span className="text-white/40">✦</span>
                <span className="mx-12">MEMORY ENABLED</span>
                <span className="text-white/40">✦</span>
                <span className="mx-12">LIVE WEB SEARCH</span>
                <span className="text-white/40">✦</span>
                <span className="mx-12">AI ORCHESTRATION</span>
                <span className="text-white/40">✦</span>
              </div>
            ))}
          </div>
        </motion.div>
      </footer>

      {/* Contact Developer Modal */}
      <AnimatePresence>
        {isContactOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsContactOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-[#0A0A0B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-8 md:p-12"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">Get in touch</h2>
                    <p className="text-white/40 text-sm font-medium">Have a project in mind or just want to say hi? Drop me a message.</p>
                  </div>

                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    <a href="mailto:hameedafsar2006@gmail.com" className="flex items-center gap-4 group cursor-pointer">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-purple-500 transition-colors shrink-0">
                        <Mail className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold">Email</p>
                        <p className="text-sm font-bold text-white/80 truncate group-hover:text-purple-400 transition-colors">hameedafsar2006@gmail.com</p>
                      </div>
                    </a>

                    <a href="tel:+919489475038" className="flex items-center gap-4 group cursor-pointer">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-purple-500 transition-colors shrink-0">
                        <Phone className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold">Phone</p>
                        <p className="text-sm font-bold text-white/80 group-hover:text-purple-400 transition-colors">+91 94894 75038</p>
                      </div>
                    </a>

                    <a href="https://someuniqueportfolio.vercel.app/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 group cursor-pointer">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-purple-500 transition-colors shrink-0">
                        <Globe className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold">Portfolio</p>
                        <p className="text-sm font-bold text-white/80 group-hover:text-purple-400 transition-colors">Visit Website</p>
                      </div>
                    </a>

                    <a href="https://github.com/hameed-afsar-km" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 group cursor-pointer">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-purple-500 transition-colors shrink-0">
                        <GithubLogo />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold">GitHub</p>
                        <p className="text-sm font-bold text-white/80 group-hover:text-purple-400 transition-colors">View Profile</p>
                      </div>
                    </a>

                    <a href="https://www.linkedin.com/in/hameedafsar-km/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 group cursor-pointer">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-purple-500 transition-colors shrink-0">
                        <LinkedinLogo />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold">LinkedIn</p>
                        <p className="text-sm font-bold text-white/80 group-hover:text-purple-400 transition-colors">Connect Now</p>
                      </div>
                    </a>
                  </div>
                </div>

                <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/30 font-bold ml-1">Your Name</label>
                    <input type="text" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition-colors" placeholder="Hameed Afsar" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/30 font-bold ml-1">Your Email</label>
                    <input type="email" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition-colors" placeholder="hameed@example.com" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/30 font-bold ml-1">Message</label>
                    <textarea rows={4} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition-colors resize-none" placeholder="What's on your mind?" />
                  </div>
                  <button className="w-full bg-white text-black py-4 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                    Send Message
                  </button>
                </form>
              </div>

              <button
                onClick={() => setIsContactOpen(false)}
                className="absolute top-6 right-6 text-white/20 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
