"use client";

import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle,
  BookOpen,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessageData {
  role: "user" | "assistant";
  text: string;
  type?: "answer" | "uncertain" | "escalated" | "direct_provider";
  source?: string | null;
  initials?: string;
}

export default function ChatMessage({ message }: { message: ChatMessageData }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "flex gap-2.5 mb-4",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-[#5B4FCF] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
      )}

      <div className={cn("max-w-[78%]", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
            isUser
              ? "bg-[#5B4FCF] text-white rounded-br-sm"
              : message.type === "direct_provider"
                ? "bg-rose-50 border border-rose-200 text-rose-900 rounded-bl-sm"
                : message.type === "escalated"
                  ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-bl-sm"
                  : message.type === "uncertain"
                    ? "bg-blue-50 border border-blue-100 text-blue-900 rounded-bl-sm"
                    : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm",
          )}
        >
          {message.type === "direct_provider" && (
            <div className="flex items-center gap-1.5 mb-2 text-rose-700 font-semibold text-xs">
              <Stethoscope className="w-3.5 h-3.5" />
              Sent directly to your care team
            </div>
          )}
          {message.type === "escalated" && (
            <div className="flex items-center gap-1.5 mb-2 text-amber-700 font-semibold text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              Forwarded to staff
            </div>
          )}
          {message.type === "uncertain" && (
            <div className="flex items-center gap-1.5 mb-2 text-blue-600 font-semibold text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              Best match — confirm with staff if needed
            </div>
          )}
          <p className="whitespace-pre-line">{message.text}</p>
        </div>

        {!isUser && message.source && (
          <div className="flex items-center gap-1 mt-1.5 ml-1">
            <BookOpen className="w-3 h-3 text-gray-400" />
            <span className="text-[11px] text-gray-400">{message.source}</span>
          </div>
        )}
        {!isUser && message.type === "answer" && (
          <div className="flex items-center gap-1 mt-0.5 ml-1">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span className="text-[11px] text-emerald-600 font-medium">
              Verified policy
            </span>
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-gray-600">
          {message.initials || "P"}
        </div>
      )}
    </motion.div>
  );
}
