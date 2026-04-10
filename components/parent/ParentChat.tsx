"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sun, Phone, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import ChatMessage, { type ChatMessageData } from "@/components/chat/ChatMessage";
import TypingIndicator from "@/components/chat/TypingIndicator";
import SuggestedQuestions from "@/components/chat/SuggestedQuestions";
import { SUGGESTED_QUESTIONS } from "@/data/aiResponses";
import { CENTER } from "@/data/centerData";
import { AnswerContractSchema, type AnswerContract } from "@/lib/llm/contract";

const GREETING: ChatMessageData = {
  role: "assistant",
  text: `Hi there! \ud83d\udc4b I'm the Sunshine Academy front desk assistant.\n\nI can answer questions about our hours, tuition, health policies, meals, enrollment, and more \u2014 instantly, any time of day.\n\nWhat can I help you with?`,
  type: "answer",
};

function contractToMessage(contract: AnswerContract): ChatMessageData {
  if (contract.escalate) {
    return {
      role: "assistant",
      text: contract.answer,
      type: "escalated",
      source: null,
    };
  }

  if (contract.confidence === "low") {
    return {
      role: "assistant",
      text: contract.answer,
      type: "uncertain",
      source: contract.cited_entries.length > 0 ? "Family Handbook" : null,
    };
  }

  return {
    role: "assistant",
    text: contract.answer,
    type: "answer",
    source: contract.cited_entries.length > 0 ? "Family Handbook" : null,
  };
}

export function ParentChat() {
  const [messages, setMessages] = useState<ChatMessageData[]>([GREETING]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async (text?: string) => {
    const query = text || input.trim();
    if (!query) return;
    setInput("");
    setShowSuggestions(false);
    setMessages((prev) => [...prev, { role: "user", text: query, initials: "P" }]);
    setIsTyping(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });

      if (!res.ok) {
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "I'm having trouble connecting right now. Please try again in a moment, or call us directly at (505) 867-5309.",
            type: "escalated",
          },
        ]);
        return;
      }

      const raw: unknown = await res.json();
      const parsed = AnswerContractSchema.safeParse(raw);
      setIsTyping(false);
      if (!parsed.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "I'm having trouble processing that response. Please try again, or call us directly at (505) 867-5309.",
            type: "escalated",
          },
        ]);
        return;
      }
      setMessages((prev) => [...prev, contractToMessage(parsed.data)]);
    } catch {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "I'm having trouble connecting right now. Please try again in a moment, or call us directly at (505) 867-5309.",
          type: "escalated",
        },
      ]);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col items-center justify-center p-0 md:p-6">
      <div className="w-full max-w-md mx-auto flex flex-col h-screen md:h-[820px] md:rounded-3xl md:shadow-2xl overflow-hidden bg-[#F5F0E8]">
        {/* Hero Header */}
        <div className="bg-[#5B4FCF] px-5 pt-10 pb-6 flex-shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/5 -translate-y-16 translate-x-16" />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white/5 translate-y-12 -translate-x-8" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Sun className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white/70 text-[10px] font-medium tracking-wide uppercase">
                    brightdesk
                  </p>
                  <h1 className="text-white font-bold text-sm leading-tight">{CENTER.name}</h1>
                </div>
              </div>
              <a
                href={`tel:${CENTER.phone}`}
                className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center hover:bg-white/25 transition-colors"
              >
                <Phone className="w-4 h-4 text-white" />
              </a>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-white font-semibold text-sm">AI Front Desk</p>
                  <span className="bg-emerald-400 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    ● Live
                  </span>
                </div>
                <p className="text-white/70 text-xs">Always available · Instant answers</p>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-0">
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}
          <AnimatePresence>{isTyping && <TypingIndicator />}</AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Suggested questions */}
        <AnimatePresence>
          {showSuggestions && messages.length <= 1 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex-shrink-0 px-4 pb-3"
            >
              <SuggestedQuestions questions={SUGGESTED_QUESTIONS} onSelect={sendMessage} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="flex-shrink-0 bg-white border-t border-gray-100 px-4 py-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask a question..."
                rows={1}
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5B4FCF]/30 focus:border-[#5B4FCF] transition-all max-h-28 leading-relaxed"
                style={{ minHeight: "46px" }}
              />
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isTyping}
              className="h-11 w-11 rounded-2xl bg-[#5B4FCF] hover:bg-[#4A3FB8] disabled:opacity-40 shadow-lg flex items-center justify-center flex-shrink-0 transition-all active:scale-95"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-[10px] text-gray-400">Powered by BrightDesk AI</p>
            <Link
              href="/admin"
              className="text-[10px] text-gray-400 hover:text-[#5B4FCF] flex items-center gap-0.5 transition-colors"
            >
              Staff portal <ChevronRight className="w-2.5 h-2.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
