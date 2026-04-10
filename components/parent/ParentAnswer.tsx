// Routing component: takes a parsed AnswerContract and renders one
// of exactly two cards — high-confidence AnswerCard or
// EscalationCard. No third branch. Adding a third branch is a
// product-thesis violation.

"use client";

import type { AnswerContract } from "@/lib/llm";
import { AnswerCard } from "./AnswerCard";
import { EscalationCard } from "./EscalationCard";
import type { CitationSource } from "./types";

export function ParentAnswer({
  result,
  allSources,
  onOpenSource,
}: {
  result: AnswerContract;
  allSources: CitationSource[];
  onOpenSource: (source: CitationSource) => void;
}) {
  if (result.escalate || result.confidence === "low") {
    return (
      <EscalationCard
        reason={result.escalation_reason ?? "low_confidence"}
      />
    );
  }
  return (
    <AnswerCard
      answer={result.answer}
      citedIds={result.cited_entries}
      allSources={allSources}
      onOpenSource={onOpenSource}
    />
  );
}
