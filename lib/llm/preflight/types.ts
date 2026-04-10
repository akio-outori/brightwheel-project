// Preflight classifier types. Preflight runs BEFORE the LLM call
// and can short-circuit the entire ask flow — saving the model call
// cost for questions that are clearly about a specific child's
// medical/health situation and must be routed to a human.

export type PreflightVerdict =
  | { readonly verdict: "pass" }
  | {
      readonly verdict: "hold";
      readonly reason: PreflightHoldReason;
      readonly detail?: string;
    };

export type PreflightHoldReason = "specific_child_question";
