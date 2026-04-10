// High-confidence answer render. Only used when confidence === "high"
// AND escalate === false. Any other shape routes to EscalationCard.

"use client";

import { CitationPills } from "./CitationPills";
import { ConfidenceBadge } from "./ConfidenceBadge";
import type { CitationSource } from "./types";

export function AnswerCard({
  answer,
  citedIds,
  allSources,
  onOpenSource,
}: {
  answer: string;
  citedIds: string[];
  allSources: CitationSource[];
  onOpenSource: (source: CitationSource) => void;
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
        citedIds={citedIds}
        allSources={allSources}
        onOpen={onOpenSource}
      />
    </article>
  );
}
