import { AnimatedAIChat } from "@/components/ui/animated-ai-chat"
import { ChatSidebar } from "@/components/ui/chat-sidebar"
import { GlobalBackground } from "@/components/ui/global-background"
import { DisclaimerModal } from "@/components/ui/disclaimer-modal"

export default function ChatPage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans relative">
      <DisclaimerModal />
      <GlobalBackground />
      <ChatSidebar />
      <main className="flex-1 relative z-10 overflow-hidden flex flex-col items-center justify-center">
        <AnimatedAIChat />
      </main>
    </div>
  );
}
