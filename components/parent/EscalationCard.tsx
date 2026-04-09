// Low-confidence / escalation render. Shown whenever the answer
// escalates OR confidence is low OR the sensitive-topic check fired.
// The thesis is "escalate, don't guess" — this card is the visible
// expression of that thesis.

"use client";

// Map of escalation reasons to human-friendly copy. Unknown reasons
// fall through to a generic message.
const REASON_COPY: Record<string, { heading: string; body: string }> = {
  sensitive_topic: {
    heading: "Let me get a human for this one.",
    body: "This question touches on a sensitive topic (health, safety, or custody) where we always want a staff member involved. A member of the DCFD team will follow up.",
  },
  model_response_invalid: {
    heading: "I want to make sure I get this right.",
    body: "I'm not confident in my answer here, so I'm passing this along to a staff member who can give you the right information.",
  },
  low_confidence: {
    heading: "I'm not sure about this one.",
    body: "I couldn't find a clear answer in the family handbook. A staff member will follow up with you directly.",
  },
  out_of_scope: {
    heading: "That's outside what I can help with.",
    body: "This question is outside what the DCFD front desk handles. A staff member can point you in the right direction.",
  },
};

export function EscalationCard({
  reason,
  answer,
}: {
  reason: string;
  // The model's own answer text, if any. Shown as supplementary
  // context below the escalation message, not as the primary response.
  answer?: string;
}) {
  const copy =
    REASON_COPY[reason] ?? REASON_COPY["low_confidence"]!;

  return (
    <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="mb-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/30">
          <span aria-hidden="true">🔔</span>
          Passing this to staff
        </span>
      </div>
      <h3 className="text-sm font-semibold text-amber-900">{copy.heading}</h3>
      <p className="mt-1 text-sm leading-relaxed text-amber-900/80">
        {copy.body}
      </p>
      {answer && answer.trim().length > 0 && (
        <details className="mt-3 text-xs text-amber-900/70">
          <summary className="cursor-pointer select-none font-medium">
            What the assistant drafted
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{answer}</p>
        </details>
      )}
    </article>
  );
}
