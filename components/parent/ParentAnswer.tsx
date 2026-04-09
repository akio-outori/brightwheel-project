// Routing component: takes a parsed AnswerContract and renders one
// of exactly two cards — high-confidence AnswerCard or
// EscalationCard. No third branch. Adding a third branch is a
// product-thesis violation.

"use client";

import type { AnswerContract } from "@/lib/llm";
import type { HandbookEntry } from "@/lib/storage";
import { AnswerCard } from "./AnswerCard";
import { EscalationCard } from "./EscalationCard";

export function ParentAnswer({
  result,
  allEntries,
  onOpenEntry,
}: {
  result: AnswerContract;
  allEntries: HandbookEntry[];
  onOpenEntry: (entry: HandbookEntry) => void;
}) {
  if (result.escalate || result.confidence === "low") {
    return (
      <EscalationCard
        reason={result.escalation_reason ?? "low_confidence"}
        answer={result.answer}
      />
    );
  }
  return (
    <AnswerCard
      answer={result.answer}
      citedEntryIds={result.cited_entries}
      allEntries={allEntries}
      onOpenEntry={onOpenEntry}
    />
  );
}
