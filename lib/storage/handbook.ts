// Handbook adapter. The handbook layer is immutable after seed —
// this file exposes read-only accessors that are scoped per document.
// Operator-authored content lives in the separate override layer
// (lib/storage/overrides.ts); this adapter does not know about it.
//
// Object layout in the handbook bucket:
//
//   documents/{docId}/metadata.json             DocumentMetadata
//   documents/{docId}/entries/{entryId}.json    HandbookEntry
//
// The init script (docker/minio-init/init.sh) is the only writer to
// this layer. No runtime code path here writes to the seed.

import { HANDBOOK_BUCKET } from "./client";
import {
  DocumentMetadata,
  DocumentMetadataSchema,
  HandbookEntry,
  HandbookEntrySchema,
  StorageError,
} from "./types";
import { listObjectKeys, readJson } from "./minio-json";

// ---------------------------------------------------------------------------
// Active document resolution
// ---------------------------------------------------------------------------

// The single seam where document selection lives. Today every
// session loads the same document; a future session/auth layer will
// replace the body of this function to pick based on user metadata.
// Nothing else in the codebase should hardcode a document id.
const DEFAULT_DOCUMENT_ID = "dcfd-family-handbook";

export function getActiveDocumentId(): string {
  return DEFAULT_DOCUMENT_ID;
}

// ---------------------------------------------------------------------------
// Key layout
// ---------------------------------------------------------------------------

function documentPrefix(docId: string): string {
  return `documents/${docId}`;
}

function metadataKey(docId: string): string {
  return `${documentPrefix(docId)}/metadata.json`;
}

function entriesPrefix(docId: string): string {
  return `${documentPrefix(docId)}/entries/`;
}

function entryKey(docId: string, entryId: string): string {
  return `${entriesPrefix(docId)}${entryId}.json`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the document metadata blob for a document. Throws
 * `not_found` if the document is unknown.
 */
export async function getDocumentMetadata(docId: string): Promise<DocumentMetadata> {
  const raw = await readJson(HANDBOOK_BUCKET(), metadataKey(docId));
  if (raw === null) {
    throw new StorageError(`Document not found: ${docId}`, "not_found");
  }
  const parsed = DocumentMetadataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StorageError(
      `Corrupt document metadata for ${docId}: ${parsed.error.message}`,
      "corrupt_object",
    );
  }
  return parsed.data;
}

/**
 * List every seed entry in a document. Reads through a prefix scan
 * of `documents/{docId}/entries/` — there is no denormalized index.
 * Order is unspecified; callers that care about ordering should sort
 * by id or title themselves.
 */
export async function listHandbookEntries(docId: string): Promise<HandbookEntry[]> {
  const keys = await listObjectKeys(HANDBOOK_BUCKET(), entriesPrefix(docId));
  const entries: HandbookEntry[] = [];
  for (const key of keys) {
    const raw = await readJson(HANDBOOK_BUCKET(), key);
    if (raw === null) continue;
    const parsed = HandbookEntrySchema.safeParse(raw);
    if (!parsed.success) {
      throw new StorageError(
        `Corrupt handbook entry ${key}: ${parsed.error.message}`,
        "corrupt_object",
      );
    }
    entries.push(parsed.data);
  }
  return entries;
}

/**
 * Read a single seed entry by id within a document. Returns `null`
 * if the entry does not exist.
 */
export async function getHandbookEntry(docId: string, id: string): Promise<HandbookEntry | null> {
  const raw = await readJson(HANDBOOK_BUCKET(), entryKey(docId, id));
  if (raw === null) return null;
  const parsed = HandbookEntrySchema.safeParse(raw);
  if (!parsed.success) {
    throw new StorageError(
      `Corrupt handbook entry ${id} in ${docId}: ${parsed.error.message}`,
      "corrupt_object",
    );
  }
  return parsed.data;
}
