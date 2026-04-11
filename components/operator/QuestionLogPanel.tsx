"use client";

import { useEffect, useRef, useState } from "react";
import { mutate } from "swr";
import {
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { EVENTS_SWR_KEY, type EventFilter } from "./OperatorDashboard";

// Shape of error responses returned by our API routes. Matches the
// { error: string } envelope the boundary handlers produce. We parse
// the fetch response body through this schema instead of asserting
// the shape, so a malformed body falls through to a generic error
// message without runtime surprises.
const ErrorResponseSchema = z.object({ error: z.string() });

interface AnswerContract {
  answer: string;
  confidence: "high" | "low";
  cited_entries: string[];
  escalate: boolean;
  escalation_reason?: string;
}

interface NeedsAttentionEvent {
  id: string;
  docId?: string;
  question: string;
  result: AnswerContract;
  createdAt: string;
  resolvedAt?: string;
  resolvedByOverrideId?: string;
  operatorReply?: string;
}

export interface QuestionLogPanelProps {
  /** Filtered event list chosen by the parent based on the
   *  active stat-card filter. Already sorted newest-first. */
  events: NeedsAttentionEvent[];
  /** Which filter is active. Drives the empty-state copy and
   *  the header alert — the panel shouldn't need to re-derive
   *  this from events. */
  filter: EventFilter;
  /** Controlled expanded-card id. The bell dropdown in the
   *  dashboard sets this when the operator clicks a
   *  notification, which both opens the card and scrolls it
   *  into view. */
  expandedId: string | null;
  /** Called when the operator toggles a card open or closed
   *  from inside the panel itself. */
  onExpandChange: (id: string | null) => void;
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "low" }) {
  return confidence === "high" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
      High confidence
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
      Low confidence
    </span>
  );
}

/** Map internal hold reasons to operator-friendly language. */
const HOLD_REASON_LABELS: Record<string, string> = {
  hallucinated_citation: "Cited a source that doesn't exist",
  model_self_escalated: "The assistant wasn't sure",
  no_direct_coverage: "We don't have an answer for this yet",
  lexical_unsupported: "Answer doesn't match our records",
  fabricated_numeric: "Contains a number we can't verify",
  fabricated_entity: "Mentions a name we can't verify",
  medical_instruction: "Contains medical advice that needs staff review",
  specific_child_question: "About a specific child — needs a person",
  low_confidence: "The assistant wasn't sure enough to answer",
};

function formatHoldReason(reason: string | undefined): string | null {
  if (!reason) return null;
  const key = reason.replace("held_for_review:", "");
  return HOLD_REASON_LABELS[key] ?? key.replace(/_/g, " ");
}

export default function QuestionLogPanel({
  events,
  filter,
  expandedId,
  onExpandChange,
}: QuestionLogPanelProps) {
  // Per-card refs keyed by event id so we can scroll the
  // currently expanded card into view whenever `expandedId`
  // changes — particularly after the bell dropdown jumps to a
  // specific event.
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useEffect(() => {
    if (!expandedId) return;
    const el = cardRefs.current.get(expandedId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [expandedId]);

  const unresolvedCount = events.filter((e) => !e.resolvedAt && e.result.escalate).length;

  return (
    <div>
      {/* Escalation alert — only when the current filter actually
          includes unresolved escalations. Suppress on the "By
          staff" filter where everything is already resolved. */}
      {unresolvedCount > 0 && filter !== "resolved" && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {unresolvedCount} question{unresolvedCount !== 1 ? "s" : ""} need your attention
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              A parent asked something we don&apos;t have an answer for yet. Your response closes
              the loop.
            </p>
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-400">
          {filter === "unresolved"
            ? "All caught up — nothing waiting for you."
            : filter === "resolved"
              ? "No staff replies yet in this window."
              : "No parent questions in the feed."}
        </div>
      )}

      {/* Question cards */}
      <div className="space-y-2.5">
        {events.map((item) => {
          const confidence = item.result.confidence;
          const holdReason = formatHoldReason(item.result.escalation_reason);

          return (
            <div
              key={item.id}
              ref={(el) => {
                cardRefs.current.set(item.id, el);
              }}
              className={cn(
                "bg-white rounded-2xl border overflow-hidden transition-all shadow-sm hover:shadow-md",
                item.result.escalate ? "border-amber-200" : "border-gray-100",
              )}
            >
              <button
                className="w-full text-left px-4 py-4 flex items-start gap-3"
                onClick={() => onExpandChange(expandedId === item.id ? null : item.id)}
              >
                {/* Status icon */}
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    item.resolvedAt
                      ? "bg-emerald-50"
                      : item.result.escalate
                        ? "bg-amber-50"
                        : "bg-gray-100",
                  )}
                >
                  {item.resolvedAt ? (
                    <Clock className="w-4 h-4 text-emerald-500" />
                  ) : item.result.escalate ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Clock className="w-4 h-4 text-gray-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 leading-snug">
                    {item.question}
                  </p>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5">
                    <span className="text-xs text-gray-400">
                      {format(new Date(item.createdAt), "h:mm a")}
                    </span>
                    {item.result.escalate && !item.resolvedAt && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                        Needs review
                      </span>
                    )}
                    {item.resolvedAt && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">
                        Resolved
                      </span>
                    )}
                  </div>
                </div>

                {expandedId === item.id ? (
                  <ChevronUp className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                )}
              </button>

              {expandedId === item.id && (
                <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      AI Confidence
                    </p>
                    <ConfidenceBadge confidence={confidence} />
                  </div>
                  {item.result.cited_entries.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                        Cited entries
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {item.result.cited_entries.map((id) => (
                          <span
                            key={id}
                            className="text-xs bg-violet-50 border border-violet-100 text-[#5B4FCF] font-semibold rounded-full px-3 py-1"
                          >
                            {id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {item.result.answer && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                        Suggested response
                      </p>
                      <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3 border border-gray-100">
                        {item.result.answer}
                      </p>
                    </div>
                  )}
                  {holdReason && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">
                        Why it was flagged
                      </p>
                      <p className="text-xs text-amber-700 leading-relaxed">{holdReason}</p>
                    </div>
                  )}
                  {item.result.escalate && !item.resolvedAt && (
                    <ReplyForm eventId={item.id} question={item.question} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Inline reply form — the operator's "answer the parent" action.
//
// Primary action: write a reply the specific parent who asked will
// see in their chat. That reply is always stored on the event and
// delivered via /api/parent-replies polling.
//
// Optional action: "also add to handbook" checkbox. Many
// escalations are one-off child-specific questions that should NOT
// become reusable handbook entries — "my son fell at pickup, is he
// okay?" is a human moment, not a policy update. The operator
// opts in explicitly when the answer generalizes ("Yes, we offer
// summer camp — 8am to 4pm, $240/week"). When checked, the SAME
// reply text is used as the override body — one message, two
// surfaces — and a title input appears for the handbook entry.
// -----------------------------------------------------------------------

function ReplyForm({ eventId }: { eventId: string; question?: string }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [addToHandbook, setAddToHandbook] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !saving && reply.trim().length > 0 && (!addToHandbook || title.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const payload: {
        replyToParent: string;
        handbookOverride?: {
          title: string;
          category: "general";
          sourcePages: number[];
          replacesEntryId: null;
        };
      } = {
        replyToParent: reply.trim(),
      };
      if (addToHandbook) {
        payload.handbookOverride = {
          title: title.trim(),
          category: "general",
          sourcePages: [],
          replacesEntryId: null,
        };
      }

      const res = await fetch(`/api/needs-attention/${eventId}/resolve-with-entry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const rawDetail: unknown = await res.json().catch(() => ({}));
        const parsed = ErrorResponseSchema.safeParse(rawDetail);
        throw new Error(parsed.success ? parsed.data.error : `Failed (HTTP ${res.status})`);
      }
      await Promise.all([mutate(EVENTS_SWR_KEY), mutate("/api/handbook")]);
      setOpen(false);
      setReply("");
      setTitle("");
      setAddToHandbook(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2 bg-[#5B4FCF] hover:bg-[#4A3FB8] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Answer this parent
      </button>
    );
  }

  return (
    <div className="space-y-2.5 border border-[#5B4FCF]/20 rounded-xl p-3 bg-[#5B4FCF]/5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#5B4FCF]">Your reply to the parent</p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="Write what you'd say to this parent..."
        rows={4}
        autoFocus
        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-[#5B4FCF]/30"
      />

      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={addToHandbook}
          onChange={(e) => setAddToHandbook(e.target.checked)}
          className="mt-0.5 accent-[#5B4FCF]"
        />
        <span className="text-xs text-gray-600 leading-snug">
          Also add to handbook so future parents get this answer automatically
          <span className="block text-[10px] text-gray-400 mt-0.5">
            Skip for one-off questions about a specific child.
          </span>
        </span>
      </label>

      {addToHandbook && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Handbook entry title (e.g. Summer camp availability)"
          className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5B4FCF]/30"
        />
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-2 bg-[#5B4FCF] hover:bg-[#4A3FB8] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Send className="w-3.5 h-3.5" />
        )}
        {saving ? "Sending..." : addToHandbook ? "Send reply & save to handbook" : "Send reply"}
      </button>
    </div>
  );
}
