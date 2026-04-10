// Stock response builder. When the pipeline holds a draft, the route
// returns a generated AnswerContract instead of the model's draft.
// The parent sees a warm, generic "a staff member is reviewing this"
// card; the operator sees the model's original draft in the
// needs-attention feed alongside the hold reason.
//
// No phone numbers, no fallback contact — the parent's path forward
// is the trust loop (wait for the operator to respond), not a
// sidestep. This is deliberate: a "call this number" escape hatch
// would erode the product's promise that the front desk closes its
// own loops.

import type { AnswerContract } from "../contract";
import type { HoldReason } from "./types";

/** Build the stock response the parent sees when any pipeline channel
 *  holds. The `holdReason` is encoded in `escalation_reason` as
 *  `held_for_review:<reason>` so the operator UI can render a
 *  specific badge for each hold type. */
export function buildStockResponse(holdReason: HoldReason): AnswerContract {
  return {
    answer:
      "Thanks for asking — I want to make sure you get the right answer. A staff member is taking a look at your question and will get back to you.",
    confidence: "low",
    cited_entries: [],
    directly_addressed_by: [],
    escalate: true,
    escalation_reason: `held_for_review:${holdReason}`,
  };
}

/** Parse the `held_for_review:` prefix out of an escalation_reason.
 *  Returns the raw HoldReason if the prefix is present, otherwise
 *  null. The operator UI uses this to decide whether to render a
 *  hold-reason badge vs a model-self-escalation reason. */
export function parseHoldReason(
  escalationReason: string | undefined,
): HoldReason | null {
  if (!escalationReason) return null;
  const prefix = "held_for_review:";
  if (!escalationReason.startsWith(prefix)) return null;
  return escalationReason.slice(prefix.length) as HoldReason;
}
