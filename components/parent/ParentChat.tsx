"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sun, Phone, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import ChatMessage, { type ChatMessageData, type CitedEntry } from "@/components/chat/ChatMessage";
import TypingIndicator from "@/components/chat/TypingIndicator";
import SuggestedQuestions from "@/components/chat/SuggestedQuestions";
import { SUGGESTED_QUESTIONS, FOLLOWUP_SUGGESTIONS } from "@/data/aiResponses";
import { CENTER } from "@/data/centerData";
import { AnswerContractSchema, type AnswerContract } from "@/lib/llm/contract";

const GREETING: ChatMessageData = {
  role: "assistant",
  text: `Hi — I'm ${CENTER.name}'s front desk.\n\nI can answer questions about our hours, tuition, health policies, meals, enrollment, and more \u2014 any time of day.\n\nWhat can I help you with?`,
  type: "answer",
};

// localStorage key used to persist pending needs-attention event
// ids across page reloads. The parent tab might be refreshed
// between asking a question that escalates and the operator
// resolving it — without persistence, the reply would be
// written to the backend but never surface in the parent's chat.
const PENDING_IDS_STORAGE_KEY = "brightdesk:pending-event-ids";

/** Resolve cited entry IDs to full objects for clickable pills. */
function resolveCitations(
  ids: string[],
  lookup: Map<string, { title: string; body: string }>,
): CitedEntry[] {
  return ids
    .map((id) => {
      const entry = lookup.get(id);
      if (!entry) return null;
      return { id, title: entry.title, body: entry.body };
    })
    .filter((e): e is CitedEntry => e !== null);
}

function contractToMessage(
  contract: AnswerContract,
  lookup: Map<string, { title: string; body: string }>,
): ChatMessageData {
  // Refusal — the model declined an off-topic or out-of-scope
  // question. Render the model's decline text directly; no
  // "staff is looking at this" card, no follow-up queue. The
  // parent asked something this desk isn't for, and the polite
  // "I can't help with that" is the final answer.
  if (contract.refusal === true) {
    return {
      role: "assistant",
      text: contract.answer,
      type: "refusal",
      source: null,
    };
  }

  // Low confidence and escalated both render as escalation —
  // the parent should never see a hedged model answer. Use the
  // stock response text if available, otherwise a safe fallback.
  if (contract.escalate || contract.confidence === "low") {
    const isStockResponse = contract.answer.includes("staff member is taking a look");
    return {
      role: "assistant",
      text: isStockResponse
        ? contract.answer
        : `I want to make sure you get the right answer here. A staff member is taking a look at your question and will follow up. You can also call us at ${CENTER.phone}.`,
      type: "escalated",
      source: null,
    };
  }

  return {
    role: "assistant",
    text: contract.answer,
    type: "answer",
    source: contract.cited_entries.length > 0 ? "Family Handbook" : null,
    citedEntries: resolveCitations(contract.cited_entries, lookup),
  };
}

export function ParentChat() {
  const [messages, setMessages] = useState<ChatMessageData[]>([GREETING]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [entryLookup, setEntryLookup] = useState<Map<string, { title: string; body: string }>>(
    new Map(),
  );
  // Ids of needs-attention events this client is waiting on a
  // staff reply for. /api/ask returns one whenever it logs an
  // event; we stash it here and poll /api/parent-replies for the
  // staff's response. Once a reply arrives, the id is removed.
  //
  // Persisted to localStorage so a page refresh between the
  // escalation and the operator's reply doesn't strand the
  // parent — the next mount picks up polling where we left off
  // and the reply still shows up in the chat.
  const [pendingEventIds, setPendingEventIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(PENDING_IDS_STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
    } catch {
      return [];
    }
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch handbook once on mount for citation resolution
  useEffect(() => {
    fetch("/api/handbook")
      .then((r) => r.json())
      .then(
        (data: {
          document?: {
            entries?: Array<{ id: string; title: string; body: string }>;
            overrides?: Array<{ id: string; title: string; body: string }>;
          };
        }) => {
          const map = new Map<string, { title: string; body: string }>();
          for (const e of data.document?.entries ?? [])
            map.set(e.id, { title: e.title, body: e.body });
          for (const o of data.document?.overrides ?? [])
            map.set(o.id, { title: o.title, body: o.body });
          setEntryLookup(map);
        },
      )
      .catch(() => {}); // Non-critical — citations just won't resolve
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Mirror pendingEventIds to localStorage on every change so a
  // refresh doesn't strand a still-in-flight escalation. The
  // polling effect reads this state, and the lazy-init reader
  // above restores from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (pendingEventIds.length === 0) {
        window.localStorage.removeItem(PENDING_IDS_STORAGE_KEY);
      } else {
        window.localStorage.setItem(PENDING_IDS_STORAGE_KEY, JSON.stringify(pendingEventIds));
      }
    } catch {
      // quota exceeded / private mode / disabled storage — best-effort.
    }
  }, [pendingEventIds]);

  // Poll /api/parent-replies while we have pending escalations.
  // When a reply lands, inject it as a new assistant bubble and
  // drop the id from the pending set. The loop stops when there's
  // nothing left to wait on — no pending ids, no polling.
  useEffect(() => {
    if (pendingEventIds.length === 0) return;

    let cancelled = false;

    async function poll() {
      try {
        const qs = pendingEventIds.join(",");
        const res = await fetch(`/api/parent-replies?ids=${encodeURIComponent(qs)}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          replies?: Array<{ id: string; reply: string; resolvedAt: string }>;
        };
        if (cancelled || !data.replies || data.replies.length === 0) return;

        const resolvedIds = new Set(data.replies.map((r) => r.id));
        setMessages((prev) => [
          ...prev,
          ...data.replies!.map<ChatMessageData>((r) => ({
            role: "assistant",
            text: r.reply,
            type: "staff_reply",
            source: null,
          })),
        ]);
        setPendingEventIds((prev) => prev.filter((id) => !resolvedIds.has(id)));
      } catch {
        // Network blip — try again on the next tick.
      }
    }

    // Poll once immediately (catches the case where the operator
    // replied before the effect ran), then every 5s.
    void poll();
    const handle = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [pendingEventIds]);

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
            text: `I'm having trouble connecting right now. Please try again in a moment, or call us directly at ${CENTER.phone}.`,
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
            text: `I'm having trouble processing that response. Please try again, or call us directly at ${CENTER.phone}.`,
            type: "escalated",
          },
        ]);
        return;
      }
      setMessages((prev) => [...prev, contractToMessage(parsed.data, entryLookup)]);

      // If this question was logged as a needs-attention event,
      // remember its id so the polling effect can pick up the
      // staff reply when it arrives. The field lives alongside
      // the contract at the top level of the response and is
      // absent on grounded-answer paths.
      if (typeof raw === "object" && raw !== null && "needs_attention_event_id" in raw) {
        const eventId = (raw as { needs_attention_event_id?: unknown }).needs_attention_event_id;
        if (typeof eventId === "string" && eventId.length > 0) {
          setPendingEventIds((prev) => (prev.includes(eventId) ? prev : [...prev, eventId]));
        }
      }
    } catch {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `I'm having trouble connecting right now. Please try again in a moment, or call us directly at ${CENTER.phone}.`,
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

        {/* Suggested questions — initial set or follow-up after escalation */}
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
          {!showSuggestions &&
            !isTyping &&
            messages.length > 1 &&
            messages[messages.length - 1]?.type === "escalated" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex-shrink-0 px-4 pb-3"
              >
                <p className="text-xs text-gray-500 mb-2 ml-1">
                  While you wait, I can help with these:
                </p>
                <SuggestedQuestions questions={FOLLOWUP_SUGGESTIONS} onSelect={sendMessage} />
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
