// Schemas and types for the storage layer. Every read parses through
// a Zod schema; every write validates first. The on-disk shape is
// enforced here, not by convention elsewhere.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Handbook
// ---------------------------------------------------------------------------

export const HandbookCategorySchema = z.enum([
  "enrollment",
  "hours",
  "health",
  "safety",
  "food",
  "curriculum",
  "staff",
  "policies",
  "communication",
  "fees",
  "transportation",
  "special-needs",
  "discipline",
  "emergencies",
  "general",
]);
export type HandbookCategory = z.infer<typeof HandbookCategorySchema>;

export const HandbookEntrySchema = z.object({
  id: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "id must be lowercase kebab-case"),
  title: z.string().min(1).max(200),
  category: HandbookCategorySchema,
  body: z.string().min(1).max(20_000),
  sourcePages: z.array(z.number().int().nonnegative()).default([]),
  // "2019" for static source entries, ISO 8601 for operator-created ones.
  lastUpdated: z.string().min(1),
});
export type HandbookEntry = z.infer<typeof HandbookEntrySchema>;

// The on-disk shape of `handbook/index.json`. Full entries, not summaries —
// the index is the fast path for the operator console and the prompt builder.
export const HandbookIndexSchema = z.object({
  entries: z.array(HandbookEntrySchema),
});
export type HandbookIndex = z.infer<typeof HandbookIndexSchema>;

// A draft is what a caller passes to createHandbookEntry — no id yet
// (we generate a slug from the title), no lastUpdated yet (we stamp it).
export const HandbookEntryDraftSchema = HandbookEntrySchema.omit({
  id: true,
  lastUpdated: true,
});
export type HandbookEntryDraft = z.infer<typeof HandbookEntryDraftSchema>;

// A patch is what a caller passes to updateHandbookEntry. The id is
// passed separately; everything else is optional.
export const HandbookEntryPatchSchema = HandbookEntrySchema.omit({
  id: true,
}).partial();
export type HandbookEntryPatch = z.infer<typeof HandbookEntryPatchSchema>;

// ---------------------------------------------------------------------------
// Needs-attention events
// ---------------------------------------------------------------------------

// The "result" block is the AnswerContract the LLM emitted for this
// question. It lives here verbatim so the operator console can show
// what the system actually said and why it escalated. The canonical
// schema is defined in lib/llm/contract.ts — storage re-imports it so
// there's one source of truth for the contract shape.
import { AnswerContractSchema } from "../llm/contract";
export { AnswerContractSchema };
export type { AnswerContract } from "../llm/contract";

export const NeedsAttentionEventSchema = z.object({
  id: z.string().uuid(),
  question: z.string().min(1).max(2000),
  result: AnswerContractSchema,
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  resolvedByEntryId: z.string().optional(),
});
export type NeedsAttentionEvent = z.infer<typeof NeedsAttentionEventSchema>;

export const NeedsAttentionDraftSchema = NeedsAttentionEventSchema.omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  resolvedByEntryId: true,
});
export type NeedsAttentionDraft = z.infer<typeof NeedsAttentionDraftSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// Typed error the adapter throws for known failure modes. Boundary
// handlers (API routes) catch this and translate to HTTP responses.
// Raw SDK / network errors also propagate — the adapter does not catch.
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "already_exists"
      | "invalid_input"
      | "corrupt_object",
  ) {
    super(message);
    this.name = "StorageError";
  }
}
