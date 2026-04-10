"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Loader2,
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

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.8
      ? "bg-emerald-400"
      : value >= 0.5
        ? "bg-amber-400"
        : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-500 w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

function confidenceToNumber(c: "high" | "low"): number {
  return c === "high" ? 0.9 : 0.3;
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
              {escalatedCount} question{escalatedCount !== 1 ? "s" : ""} need
              your attention
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              The AI wasn&apos;t confident enough to answer these — a staff
              response is needed.
            </p>
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-400">
          No questions to show.
        </div>
      )}

      {/* Question cards */}
      <div className="space-y-2.5">
        {events.map((item) => {
          const confidenceNum = confidenceToNumber(item.result.confidence);
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
                onClick={() =>
                  setExpanded(expanded === item.id ? null : item.id)
                }
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
                    <ConfidenceBar value={confidenceNum} />
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
                      <p className="text-xs text-amber-700 leading-relaxed">
                        {holdReason}
                      </p>
                    </div>
                  )}
                  {item.result.escalate && !item.resolvedAt && (
                    <button className="w-full py-2 bg-[#5B4FCF] hover:bg-[#4A3FB8] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Reply to parent
                    </button>
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
