// A single row in the needs-attention feed. Shows the parent's
// question, the AI's draft (collapsible), the hold reason or
// escalation reason as a badge, and a prominent "Answer this" CTA
// that opens the FixDialog.
//
// Hold reasons come from the post-response classifier pipeline and
// are namespaced in `escalation_reason` as `held_for_review:<reason>`.
// Self-escalated drafts (model raised the flag itself) are a
// specific hold-reason value; the operator UI renders them with a
// distinct label so it's clear *who* flagged the event.

"use client";

import { useState } from "react";
import type { NeedsAttentionEvent } from "@/lib/storage";
import { parseHoldReason, type HoldReason } from "@/lib/llm/post-response";
import { FixDialog } from "./FixDialog";

// Human-readable labels for each HoldReason. The operator sees
// these on a badge next to the parent's question.
const HOLD_REASON_LABELS: Record<HoldReason, { label: string; tone: BadgeTone }> = {
  hallucinated_citation: { label: "Hallucinated citation", tone: "red" },
  model_self_escalated: { label: "Model self-escalated", tone: "amber" },
  no_direct_coverage: { label: "No direct coverage", tone: "amber" },
  lexical_unsupported: { label: "Lexically ungrounded", tone: "red" },
  fabricated_numeric: { label: "Fabricated number", tone: "red" },
  fabricated_entity: { label: "Fabricated entity", tone: "red" },
  medical_instruction: { label: "Medical instruction", tone: "red" },
  specific_child_question: { label: "Specific child", tone: "red" },
};

type BadgeTone = "red" | "amber" | "slate";

const BADGE_CLASSES: Record<BadgeTone, string> = {
  red: "inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800 ring-1 ring-inset ring-rose-200",
  amber:
    "inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-200",
  slate:
    "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-inset ring-slate-200",
};

export function NeedsAttentionItem({ event }: { event: NeedsAttentionEvent }) {
  const [fixing, setFixing] = useState(false);

  const createdAt = new Date(event.createdAt);
  const when = createdAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const holdReason = parseHoldReason(event.result.escalation_reason);
  const badge = holdReason
    ? HOLD_REASON_LABELS[holdReason]
    : event.result.escalation_reason
      ? { label: event.result.escalation_reason, tone: "slate" as BadgeTone }
      : null;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{when}</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{event.question}</p>
          {badge && (
            <div className="mt-1.5">
              <span className={BADGE_CLASSES[badge.tone]}>{badge.label}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFixing(true)}
          className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          Answer this
        </button>
      </div>

      {event.result.answer && (
        <details className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <summary className="cursor-pointer select-none font-medium">
            What the assistant drafted
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{event.result.answer}</p>
        </details>
      )}

      {fixing && <FixDialog event={event} onClose={() => setFixing(false)} />}
    </article>
  );
}
