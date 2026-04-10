// Barrel export. The rest of the codebase imports from "@/lib/storage"
// and sees only the adapter surface — no SDK clients, no bucket names.

export {
  DocumentMetadataSchema,
  HandbookCategorySchema,
  HandbookEntrySchema,
  OperatorOverrideSchema,
  OperatorOverrideDraftSchema,
  OperatorOverridePatchSchema,
  AnswerContractSchema,
  NeedsAttentionEventSchema,
  NeedsAttentionDraftSchema,
  StorageError,
} from "./types";
export type {
  DocumentMetadata,
  HandbookCategory,
  HandbookEntry,
  OperatorOverride,
  OperatorOverrideDraft,
  OperatorOverridePatch,
  AnswerContract,
  NeedsAttentionEvent,
  NeedsAttentionDraft,
} from "./types";

export {
  getActiveDocumentId,
  getDocumentMetadata,
  listHandbookEntries,
  getHandbookEntry,
} from "./handbook";

export {
  listOperatorOverrides,
  getOperatorOverride,
  createOperatorOverride,
  updateOperatorOverride,
  deleteOperatorOverride,
} from "./overrides";

export {
  logNeedsAttention,
  listOpenNeedsAttention,
  resolveNeedsAttention,
} from "./needs-attention";
