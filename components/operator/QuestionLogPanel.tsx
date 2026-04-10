"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
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
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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

/** Format a raw escalation_reason from the backend for display.
 *  Strips the `held_for_review:` prefix and humanizes underscores. */
function formatHoldReason(reason: string | undefined): string | null {
  if (!reason) return null;
  return reason.replace("held_for_review:", "").replace(/_/g, " ");
}

export default function QuestionLogPanel() {
  const { data, error, isLoading } = useSWR<{ events: NeedsAttentionEvent[] }>(
    "/api/needs-attention",
    fetcher,
    { refreshInterval: 10000 },
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
        Failed to load questions. Make sure the backend is running.
      </div>
    );
  }

  const events = data.events;
  const escalatedCount = events.filter((e) => e.result.escalate).length;

  return (
    <div>
      {/* Escalation alert */}
      {escalatedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {escalatedCount} question{escalatedCount !== 1 ? "s" : ""} need your attention
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              A parent asked something we don&apos;t have an answer for yet. Your response closes
              the loop.
            </p>
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-400">No questions to show.</div>
      )}

      {/* Question cards */}
      <div className="space-y-2.5">
        {events.map((item) => {
          const confidence = item.result.confidence;
          const holdReason = formatHoldReason(item.result.escalation_reason);

          return (
            <div
              key={item.id}
              className={cn(
                "bg-white rounded-2xl border overflow-hidden transition-all shadow-sm hover:shadow-md",
                item.result.escalate ? "border-amber-200" : "border-gray-100",
              )}
            >
              <button
                className="w-full text-left px-4 py-4 flex items-start gap-3"
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
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

                {expanded === item.id ? (
                  <ChevronUp className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                )}
              </button>

              {expanded === item.id && (
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
                        AI Draft
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
// Inline reply form — creates an override + resolves the event
// -----------------------------------------------------------------------

function ReplyForm({ eventId }: { eventId: string; question?: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (saving || !title.trim() || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/needs-attention/${eventId}/resolve-with-entry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category: "general",
          body: body.trim(),
          sourcePages: [],
          replacesEntryId: null,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error((detail as { error?: string }).error ?? `Failed (HTTP ${res.status})`);
      }
      await Promise.all([mutate("/api/needs-attention"), mutate("/api/handbook")]);
      setOpen(false);
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
        Answer this
      </button>
    );
  }

  return (
    <div className="space-y-2 border border-[#5B4FCF]/20 rounded-xl p-3 bg-[#5B4FCF]/5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#5B4FCF]">Create an override</p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Scheduling a tour)"
        className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5B4FCF]/30"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write the answer the parent should have gotten..."
        rows={3}
        className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-[#5B4FCF]/30"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={saving || !title.trim() || !body.trim()}
        className="w-full py-2 bg-[#5B4FCF] hover:bg-[#4A3FB8] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Send className="w-3.5 h-3.5" />
        )}
        {saving ? "Saving..." : "Save & close the loop"}
      </button>
    </div>
  );
}
