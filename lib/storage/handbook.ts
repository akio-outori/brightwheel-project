// Handbook entry adapter. The one path the rest of the app uses to
// read or write handbook content. Object layout:
//
//   handbook/entries/{id}.json   one object per entry
//   handbook/index.json          full-entry index, rebuilt on every write
//
// The index is the fast read path: the operator console and the LLM
// prompt builder both need the full list of entries on every request,
// and a single GET against `index.json` is cheaper than N listings +
// N body fetches. The tradeoff is that every write has to rewrite the
// index — acceptable for a prototype where write volume is low.

import { HANDBOOK_BUCKET, getClient } from "./client";
import {
  HandbookEntry,
  HandbookEntryDraft,
  HandbookEntryDraftSchema,
  HandbookEntryPatch,
  HandbookEntryPatchSchema,
  HandbookEntrySchema,
  HandbookIndex,
  HandbookIndexSchema,
  StorageError,
} from "./types";

const INDEX_KEY = "index.json";
const ENTRY_PREFIX = "entries/";

function entryKey(id: string): string {
  return `${ENTRY_PREFIX}${id}.json`;
}

// Read a JSON object from MinIO, or return null if it doesn't exist.
// Non-404 errors propagate.
async function readJson(bucket: string, key: string): Promise<unknown | null> {
  const client = getClient();
  try {
    const stream = await client.getObject(bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString("utf-8");
    return JSON.parse(body);
  } catch (err: unknown) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

async function writeJson(
  bucket: string,
  key: string,
  value: unknown,
): Promise<void> {
  const client = getClient();
  const body = Buffer.from(JSON.stringify(value, null, 2), "utf-8");
  await client.putObject(bucket, key, body, body.length, {
    "Content-Type": "application/json; charset=utf-8",
  });
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "NoSuchKey" || code === "NotFound";
}

// ---------------------------------------------------------------------------
// Index cache
// ---------------------------------------------------------------------------

// Read the full handbook index. If `index.json` is absent (fresh bucket,
// pre-seed), we fall back to an empty list — callers can decide whether
// that's an error. After init has run, the index is always present.
async function readIndex(): Promise<HandbookIndex> {
  const raw = await readJson(HANDBOOK_BUCKET(), INDEX_KEY);
  if (raw === null) return { entries: [] };
  const parsed = HandbookIndexSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StorageError(
      `Corrupt handbook index.json: ${parsed.error.message}`,
      "corrupt_object",
    );
  }
  return parsed.data;
}

async function writeIndex(entries: HandbookEntry[]): Promise<void> {
  await writeJson(HANDBOOK_BUCKET(), INDEX_KEY, { entries });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listHandbookEntries(): Promise<HandbookEntry[]> {
  const index = await readIndex();
  return index.entries;
}

export async function getHandbookEntry(
  id: string,
): Promise<HandbookEntry | null> {
  const raw = await readJson(HANDBOOK_BUCKET(), entryKey(id));
  if (raw === null) return null;
  const parsed = HandbookEntrySchema.safeParse(raw);
  if (!parsed.success) {
    throw new StorageError(
      `Corrupt handbook entry ${id}: ${parsed.error.message}`,
      "corrupt_object",
    );
  }
  return parsed.data;
}

export async function createHandbookEntry(
  draft: HandbookEntryDraft,
): Promise<HandbookEntry> {
  const validatedDraft = HandbookEntryDraftSchema.parse(draft);
  const id = slugify(validatedDraft.title);

  const existing = await getHandbookEntry(id);
  if (existing) {
    throw new StorageError(
      `Handbook entry already exists: ${id}`,
      "already_exists",
    );
  }

  const entry: HandbookEntry = HandbookEntrySchema.parse({
    ...validatedDraft,
    id,
    lastUpdated: new Date().toISOString(),
  });

  await writeJson(HANDBOOK_BUCKET(), entryKey(id), entry);

  // Rebuild the index with the new entry appended.
  const index = await readIndex();
  const nextEntries = [...index.entries, entry];
  await writeIndex(nextEntries);

  return entry;
}

export async function updateHandbookEntry(
  id: string,
  patch: HandbookEntryPatch,
): Promise<HandbookEntry> {
  const validatedPatch = HandbookEntryPatchSchema.parse(patch);

  const current = await getHandbookEntry(id);
  if (!current) {
    throw new StorageError(`Handbook entry not found: ${id}`, "not_found");
  }

  const merged: HandbookEntry = HandbookEntrySchema.parse({
    ...current,
    ...validatedPatch,
    id, // id is immutable
    lastUpdated: new Date().toISOString(),
  });

  await writeJson(HANDBOOK_BUCKET(), entryKey(id), merged);

  // Rebuild the index with the updated entry swapped in.
  const index = await readIndex();
  const nextEntries = index.entries.map((e) => (e.id === id ? merged : e));
  // If the entry wasn't in the index (e.g., index drift), append it.
  if (!nextEntries.some((e) => e.id === id)) nextEntries.push(merged);
  await writeIndex(nextEntries);

  return merged;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Generate a url-safe id from a title. Not reversible; intentional.
// Collisions are caught by the createHandbookEntry existence check.
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (base.length === 0) {
    throw new StorageError(
      `Title produces empty slug: ${JSON.stringify(title)}`,
      "invalid_input",
    );
  }
  return base;
}
