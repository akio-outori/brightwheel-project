// A single row in the needs-attention feed. Shows the parent's
// question, the AI's draft (collapsible), the escalation reason,
// and a prominent "Answer this" CTA that opens the FixDialog.

"use client";

import { useState } from "react";
import type { NeedsAttentionEvent } from "@/lib/storage";
import { FixDialog } from "./FixDialog";

export function NeedsAttentionItem({
  event,
}: {
  event: NeedsAttentionEvent;
}) {
  const [fixing, setFixing] = useState(false);

  const createdAt = new Date(event.createdAt);
  const when = createdAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{when}</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {event.question}
          </p>
          {event.result.escalation_reason && (
            <p className="mt-1 text-xs text-amber-700">
              {event.result.escalation_reason}
            </p>
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

      {fixing && (
        <FixDialog event={event} onClose={() => setFixing(false)} />
      )}
    </article>
  );
}
