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
// `directly_addressed_by` is the model's structured judgment about
// which handbook entries *directly* answer the question, as opposed
// to merely being topically related. It's how we close the bridging
// hole: stuffing the whole handbook in context invites the model to
// reach for adjacent entries on gap questions ("can I volunteer?",
// "where do I park?"). Forcing it to declare a coverage list moves
// the bridging decision out of free-text reasoning and into a field
// the route handler can validate. If this list is empty, the route
// promotes the response to escalate=true regardless of what the
// model said about confidence.
//
// Optional for backwards compatibility with older fixture data and
// any synthetic results we construct in code (PARSE_FAILURE_RESULT
// below) — undefined means "the model didn't tell us", which the
// route layer treats as a no-op rather than a forced escalation.
//
// `refusal` is how the model signals that a question is outside the
// front desk's scope (off-topic, meta, write-code-for-me, personal
// advice unrelated to the program). A refusal is a canned polite
// decline — not something a human operator should look at, because
// there is nothing for the operator to do. The route handler returns
// refusal drafts directly to the parent and does NOT log them to
// needs-attention. This is distinct from `escalate`, which is for
// legitimate domain questions a staff member could actually help
// with. Refusals are optional for backward compatibility with older
// callers that predate this field.
export const AnswerContractSchema = z.object({
  answer: z.string().min(1).max(2000),
  confidence: z.enum(["high", "low"]),
  cited_entries: z.array(z.string()).default([]),
  directly_addressed_by: z.array(z.string()).optional(),
  escalate: z.boolean(),
  escalation_reason: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? undefined : v))
    .optional(),
  refusal: z.boolean().optional(),
});
export type AnswerContract = z.infer<typeof AnswerContractSchema>;

// Synthetic result returned when the model's output fails to parse
// against the schema. The parent gets a graceful "I'm not sure" and
// the question is escalated to a human — the same path as a legitimate
// low-confidence answer. Never throw a 500 on a malformed model output.
export const PARSE_FAILURE_RESULT: AnswerContract = {
  answer: "I want to make sure I get this right. Let me get a human to help.",
  confidence: "low",
  cited_entries: [],
  escalate: true,
  escalation_reason: "model_response_invalid",
};
