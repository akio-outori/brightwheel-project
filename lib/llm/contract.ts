// The AnswerContract is the structured output shape every parent-facing
// LLM call must return. Free-text responses from the model are a bug;
// the schema is what lets the rest of the app reason about confidence,
// citations, and escalation without parsing prose.
//
// Field names are snake_case because the model produces JSON and
// snake_case is the shape it reaches for most reliably. Upstream callers
// that need camelCase can rename at the boundary.

import { z } from "zod";

// `escalation_reason` uses `.nullish()` (accepts undefined AND null)
// rather than `.optional()` because models differ in how they
// represent "no value": some omit the field entirely, others emit
// `null`, others emit an empty string. All three should parse
// cleanly. We transform away null/empty-string at parse time so
// downstream code only sees `string | undefined` — callers don't
// have to care which model was on the other end.
export const AnswerContractSchema = z.object({
  answer: z.string().min(1).max(2000),
  confidence: z.enum(["high", "low"]),
  cited_entries: z.array(z.string()).default([]),
  escalate: z.boolean(),
  escalation_reason: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? undefined : v))
    .optional(),
});
export type AnswerContract = z.infer<typeof AnswerContractSchema>;

// Synthetic result returned when the model's output fails to parse
// against the schema. The parent gets a graceful "I'm not sure" and
// the question is escalated to a human — the same path as a legitimate
// low-confidence answer. Never throw a 500 on a malformed model output.
export const PARSE_FAILURE_RESULT: AnswerContract = {
  answer:
    "I want to make sure I get this right. Let me get a human to help.",
  confidence: "low",
  cited_entries: [],
  escalate: true,
  escalation_reason: "model_response_invalid",
};
