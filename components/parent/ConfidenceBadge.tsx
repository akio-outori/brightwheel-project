// Small visual indicator next to a high-confidence answer. We don't
// render this for low-confidence answers because low confidence is
// the escalation path and gets its own card — there is no
// "answer with a warning" state.

export function ConfidenceBadge({ confidence }: { confidence: "high" }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
      aria-label={`Confidence: ${confidence}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
      Grounded in handbook
    </span>
  );
}
