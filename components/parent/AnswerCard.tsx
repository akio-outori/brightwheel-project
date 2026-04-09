// High-confidence answer render. Only used when confidence === "high"
// AND escalate === false. Any other shape routes to EscalationCard.

"use client";

import type { HandbookEntry } from "@/lib/storage";
import { CitationPills } from "./CitationPills";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function AnswerCard({
  answer,
  citedEntryIds,
  allEntries,
  onOpenEntry,
}: {
  answer: string;
  citedEntryIds: string[];
  allEntries: HandbookEntry[];
  onOpenEntry: (entry: HandbookEntry) => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2">
        <ConfidenceBadge confidence="high" />
      </div>
      <div className="text-sm leading-relaxed text-slate-800">
        {answer.split(/\n{2,}/).map((para, i) => (
          <p key={i} className="mb-3 whitespace-pre-wrap last:mb-0">
            {para}
          </p>
        ))}
      </div>
      <CitationPills
        citedEntryIds={citedEntryIds}
        allEntries={allEntries}
        onOpen={onOpenEntry}
      />
    </article>
  );
}
