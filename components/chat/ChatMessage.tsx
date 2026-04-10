"use client";

import { motion } from "framer-motion";
import { AlertCircle, CheckCircle, BookOpen, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessageData {
  role: "user" | "assistant";
  text: string;
  type?: "answer" | "uncertain" | "escalated";
  source?: string | null;
  citedEntries?: string[];
  initials?: string;
}

export default function ChatMessage({ message }: { message: ChatMessageData }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn("flex gap-2.5 mb-4", isUser ? "justify-end" : "justify-start")}
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
              : message.type === "escalated"
                ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-bl-sm"
                : message.type === "uncertain"
                  ? "bg-blue-50 border border-blue-100 text-blue-900 rounded-bl-sm"
                  : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm",
          )}
        >
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

        {!isUser && message.citedEntries && message.citedEntries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
            {message.citedEntries.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200"
              >
                <BookOpen className="w-2.5 h-2.5" />
                {id.replace(/-/g, " ")}
              </span>
            ))}
          </div>
        )}
        {!isUser && message.source && !message.citedEntries?.length && (
          <div className="flex items-center gap-1 mt-1.5 ml-1">
            <BookOpen className="w-3 h-3 text-gray-400" />
            <span className="text-[11px] text-gray-400">{message.source}</span>
          </div>
        )}
        {!isUser && message.type === "answer" && (
          <div className="flex items-center gap-1 mt-0.5 ml-1">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span className="text-[11px] text-emerald-600 font-medium">Verified policy</span>
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
