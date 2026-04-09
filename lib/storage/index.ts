// Barrel export. The rest of the codebase imports from "@/lib/storage"
// and sees only the adapter surface — no SDK clients, no bucket names.

export {
  HandbookCategorySchema,
  HandbookEntrySchema,
  HandbookIndexSchema,
  HandbookEntryDraftSchema,
  HandbookEntryPatchSchema,
  AnswerContractSchema,
  NeedsAttentionEventSchema,
  NeedsAttentionDraftSchema,
  StorageError,
} from "./types";
export type {
  HandbookCategory,
  HandbookEntry,
  HandbookIndex,
  HandbookEntryDraft,
  HandbookEntryPatch,
  AnswerContract,
  NeedsAttentionEvent,
  NeedsAttentionDraft,
} from "./types";

export {
  listHandbookEntries,
  getHandbookEntry,
  createHandbookEntry,
  updateHandbookEntry,
} from "./handbook";

export {
  logNeedsAttention,
  listOpenNeedsAttention,
  resolveNeedsAttention,
} from "./needs-attention";
