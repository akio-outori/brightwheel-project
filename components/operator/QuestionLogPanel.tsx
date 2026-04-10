"use client";

import { useState } from "react";
import { QUESTION_LOG } from "@/data/centerData";
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.8 ? "bg-emerald-400" : value >= 0.5 ? "bg-amber-400" : "bg-red-400";
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

const FILTERS = [
  { id: "all", label: "All" },
  { id: "direct_provider", label: "\ud83e\udea4 Direct to Provider" },
  { id: "escalated", label: "\u26a0 Needs Review" },
  { id: "resolved", label: "\u2713 Resolved" },
];

export default function QuestionLogPanel() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filter, setFilter] = useState("all");

  const escalatedCount = QUESTION_LOG.filter((q) => q.escalated).length;
  const directProviderCount = QUESTION_LOG.filter(
    (q) => q.directProvider,
  ).length;

  const filtered = QUESTION_LOG.filter((q) => {
    if (filter === "direct_provider") return q.directProvider;
    if (filter === "escalated") return q.escalated;
    if (filter === "resolved") return q.resolved;
    return true;
  });

  return (
    <div>
      {/* Direct provider alert */}
      {directProviderCount > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-3 flex gap-3">
          <Stethoscope className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-800">
              {directProviderCount} questions routed directly to providers
            </p>
            <p className="text-xs text-rose-600 mt-0.5">
              These involve child health or medical advice and were never handled
              by AI — a staff member must respond.
            </p>
          </div>
        </div>
      )}

      {/* Escalation alert */}
      {escalatedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {escalatedCount} questions need your attention
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              The AI wasn&apos;t confident enough to answer these — a staff
              response is needed.
            </p>
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0",
              filter === f.id
                ? "bg-[#5B4FCF] text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-500 hover:border-[#5B4FCF] hover:text-[#5B4FCF]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Question cards */}
      <div className="space-y-2.5">
        {filtered.map((item) => (
          <div
            key={item.id}
            className={cn(
              "bg-white rounded-2xl border overflow-hidden transition-all shadow-sm hover:shadow-md",
              item.escalated ? "border-amber-200" : "border-gray-100",
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
                  item.directProvider
                    ? "bg-rose-50"
                    : item.resolved
                      ? "bg-emerald-50"
                      : item.escalated
                        ? "bg-amber-50"
                        : "bg-gray-100",
                )}
              >
                {item.directProvider ? (
                  <Stethoscope className="w-4 h-4 text-rose-500" />
                ) : item.resolved ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : item.escalated ? (
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
                    {item.parentName}
                  </span>
                  <span className="text-gray-300">&middot;</span>
                  <span className="text-xs text-gray-400">
                    {format(new Date(item.askedAt), "h:mm a")}
                  </span>
                  {item.directProvider && (
                    <span className="text-[10px] bg-rose-100 text-rose-700 font-semibold px-2 py-0.5 rounded-full">
                      Provider only
                    </span>
                  )}
                  {item.escalated && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                      Needs review
                    </span>
                  )}
                  {item.resolved && (
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
                {item.confidence !== null && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      AI Confidence
                    </p>
                    <ConfidenceBar value={item.confidence} />
                  </div>
                )}
                {item.matchedKnowledge && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      Matched policy
                    </p>
                    <span className="text-xs bg-violet-50 border border-violet-100 text-[#5B4FCF] font-semibold rounded-full px-3 py-1">
                      {item.matchedKnowledge}
                    </span>
                  </div>
                )}
                {item.directProvider && (
                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-rose-700 mb-1">
                      Routed directly to provider
                    </p>
                    <p className="text-xs text-rose-700 leading-relaxed">
                      This question involves child health or medical advice. It
                      was never processed by AI and requires a direct response
                      from your care team.
                    </p>
                  </div>
                )}
                {item.escalationNote && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-amber-700 mb-1">
                      Why it was flagged
                    </p>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      {item.escalationNote}
                    </p>
                  </div>
                )}
                {item.escalated && (
                  <button className="w-full py-2 bg-[#5B4FCF] hover:bg-[#4A3FB8] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Reply to parent
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
