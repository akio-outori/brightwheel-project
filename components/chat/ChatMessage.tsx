"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle, BookOpen, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CitedEntry {
  id: string;
  title: string;
  body: string;
}

export interface ChatMessageData {
  role: "user" | "assistant";
  text: string;
  type?: "answer" | "uncertain" | "escalated";
  source?: string | null;
  citedEntries?: CitedEntry[];
  initials?: string;
}

export default function ChatMessage({ message }: { message: ChatMessageData }) {
  const isUser = message.role === "user";
  const [openEntry, setOpenEntry] = useState<CitedEntry | null>(null);

  return (
    <>
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
                  : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm",
            )}
          >
            {message.type === "escalated" && (
              <div className="flex items-center gap-1.5 mb-2 text-amber-700 font-semibold text-xs">
                <AlertCircle className="w-3.5 h-3.5" />
                Forwarded to staff
              </div>
            )}
            <p className="whitespace-pre-line">{message.text}</p>
          </div>

          {!isUser && message.citedEntries && message.citedEntries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
              {message.citedEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setOpenEntry(entry)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 hover:ring-indigo-300 transition-colors cursor-pointer"
                >
                  <BookOpen className="w-2.5 h-2.5" />
                  {entry.title}
                </button>
              ))}
            </div>
          )}
          {!isUser && message.type === "answer" && (
            <div className="flex items-center gap-1 mt-1 ml-1">
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

      {/* Citation modal */}
      <AnimatePresence>
        {openEntry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => setOpenEntry(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">
                    Cited source
                  </p>
                  <h2 className="mt-0.5 text-base font-semibold text-gray-900">
                    {openEntry.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenEntry(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-y-auto px-5 py-4 text-sm leading-relaxed text-gray-700">
                {openEntry.body.split(/\n{2,}/).map((para, i) => (
                  <p key={i} className="mb-3 whitespace-pre-wrap last:mb-0">
                    {para}
                  </p>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
