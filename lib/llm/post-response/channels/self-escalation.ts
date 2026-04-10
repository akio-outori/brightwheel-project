// Self-escalation channel. If the model set `escalate: true` in its
// own contract, the pipeline treats that as a hold. The model has
// already said "a human should see this" — we respect it and route
// to the needs-attention queue with a distinct hold reason so the
// operator knows the model raised the flag itself (as opposed to a
// structural or grounding catch downstream).
//
// This is structurally a hold so the parent sees the stock response
// rather than the model's draft. Trust-loop philosophy: an
// escalating model is not an authority on what the parent should
// see; that decision belongs to the operator.

import type { Channel } from "../types";

export const selfEscalationChannel: Channel = ({ draft }) => {
  if (!draft.escalate) return { verdict: "pass" };
  return {
    verdict: "hold",
    reason: "model_self_escalated",
    detail: draft.escalation_reason,
  };
};
