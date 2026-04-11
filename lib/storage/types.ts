// Schemas and types for the storage layer. Every read parses through
// a Zod schema; every write validates first. The on-disk shape is
// enforced here, not by convention elsewhere.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

// A document is a single source handbook. Today there is one document
// (the DCFD Family Handbook) and every session loads it. The `docId`
// is the seam where future session-backed document selection will
// live; for now it is a constant returned by getActiveDocumentId().
//
// The metadata object is written once by the init script and read
// on every request by the ask route and the operator console. It
// lives at `handbook/documents/{id}/metadata.json`.
export const DocumentMetadataSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "id must be lowercase kebab-case"),
  title: z.string().min(1).max(200),
  version: z.string().min(1).max(40),
  source: z.string().min(1).max(400),
  seededAt: z.string().datetime(),
});
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

// ---------------------------------------------------------------------------
// Handbook entries (the immutable seed layer)
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

// Handbook entries are seeded once and never mutated at runtime. They
// carry a `docId` pointer back to the document they came from so a
// lone entry blob is self-describing even when read outside the
// context of its parent document.
export const HandbookEntrySchema = z.object({
  id: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "id must be lowercase kebab-case"),
  docId: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "docId must be lowercase kebab-case"),
  title: z.string().min(1).max(200),
  category: HandbookCategorySchema,
  body: z.string().min(1).max(20_000),
  sourcePages: z.array(z.number().int().nonnegative()).default([]),
  // Year string like "2019" from the source document, or ISO 8601 for
  // entries seeded from live content. Never mutated after seed.
  lastUpdated: z.string().min(1),
});
export type HandbookEntry = z.infer<typeof HandbookEntrySchema>;

// ---------------------------------------------------------------------------
// Operator overrides (the mutable patch layer)
// ---------------------------------------------------------------------------

// Operator-authored clarifications, additions, and corrections that
// layer on top of the seed entries at query time. Overrides live at
// `handbook/documents/{docId}/overrides/{id}.json` and are freely
// mutable — the operator console creates, updates, and deletes them.
//
// `replacesEntryId` lets an override explicitly supersede a seed
// entry; when set, the system prompt instructs the model to prefer
// the override and not quote the superseded entry directly. It is
// optional and none of today's behavior requires it.
export const OperatorOverrideSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "id must be lowercase kebab-case"),
  docId: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "docId must be lowercase kebab-case"),
  title: z.string().min(1).max(200),
  category: HandbookCategorySchema,
  body: z.string().min(1).max(20_000),
  sourcePages: z.array(z.number().int().nonnegative()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  createdBy: z.string().min(1).max(200).nullable().default(null),
  replacesEntryId: z.string().min(1).max(120).nullable().default(null),
});
export type OperatorOverride = z.infer<typeof OperatorOverrideSchema>;

// A draft is what a caller passes to createOperatorOverride — no id
// yet (we generate a slug from the title), no timestamps. The docId
// is passed as a separate argument to the create function so callers
// can't accidentally target a different document than the one they
// loaded from.
export const OperatorOverrideDraftSchema = OperatorOverrideSchema.omit({
  id: true,
  docId: true,
  createdAt: true,
  updatedAt: true,
});
export type OperatorOverrideDraft = z.infer<typeof OperatorOverrideDraftSchema>;

// A patch is what a caller passes to updateOperatorOverride. Id and
// docId are passed separately; the timestamp on createdAt is never
// mutated. updatedAt is stamped at write time.
export const OperatorOverridePatchSchema = OperatorOverrideSchema.omit({
  id: true,
  docId: true,
  createdAt: true,
  updatedAt: true,
}).partial();
export type OperatorOverridePatch = z.infer<typeof OperatorOverridePatchSchema>;

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

// Events carry the `docId` of the document the parent was asking
// against. This anchors the resolution path: an operator resolving
// an event creates an override scoped to that same document.
//
// `docId` is optional in the schema so events written before this
// refactor still parse cleanly; the reader migrates-on-read by
// defaulting to the currently active document. `resolvedByOverrideId`
// replaces the old `resolvedByEntryId` name since every resolver is
// now an override.
//
// `operatorReply` is the parent-facing message the operator wrote
// when resolving the event. It is distinct from the override body
// (which populates the handbook for future questions): the reply is
// what the specific parent who asked this question sees when they
// come back to the chat. The parent client polls /api/parent-replies
// with the event id it got from /api/ask to surface this. Absent on
// events resolved before this field existed.
export const NeedsAttentionEventSchema = z.object({
  id: z.string().uuid(),
  docId: z.string().min(1).max(120).optional(),
  question: z.string().min(1).max(2000),
  result: AnswerContractSchema,
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  resolvedByOverrideId: z.string().optional(),
  operatorReply: z.string().min(1).max(4000).optional(),
});
export type NeedsAttentionEvent = z.infer<typeof NeedsAttentionEventSchema>;

export const NeedsAttentionDraftSchema = NeedsAttentionEventSchema.omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  resolvedByOverrideId: true,
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
    public readonly code: "not_found" | "already_exists" | "invalid_input" | "corrupt_object",
  ) {
    super(message);
    this.name = "StorageError";
  }
}
