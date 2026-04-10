// Needs-attention event adapter. Append-only log of questions the
// system escalated, partitioned by date for cheap listing.
//
// Object layout:
//
//   events/needs-attention/{YYYY-MM-DD}/{HH-mm-ss}-{uuid}.json
//
// "Open" means resolvedAt is absent. Resolution doesn't delete the
// object — it rewrites it with resolvedAt + resolvedByOverrideId set.
// The operator console filters for open events by scanning recent
// date partitions (the last 14 days is plenty for a prototype).
//
// Events carry a `docId` so the resolution flow can create an
// override in the correct document. Older events written before the
// refactor may be missing the field — the reader migrates-on-read by
// defaulting to the currently active document.

import { randomUUID } from "node:crypto";
import { EVENTS_BUCKET } from "./client";
import { getActiveDocumentId } from "./handbook";
import {
  NeedsAttentionDraft,
  NeedsAttentionDraftSchema,
  NeedsAttentionEvent,
  NeedsAttentionEventSchema,
  StorageError,
} from "./types";
import { listObjectKeys, readJson, writeJson } from "./minio-json";

const ROOT_PREFIX = "needs-attention/";

// How many days back the "open" feed scans. A real deployment would
// background-index this; for a prototype, scanning ~two weeks of
// dated prefixes is fine.
const OPEN_WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Key layout
// ---------------------------------------------------------------------------

function datePartition(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function timeComponent(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}-${mi}-${ss}`;
}

function eventKey(id: string, createdAt: Date): string {
  return `${ROOT_PREFIX}${datePartition(createdAt)}/${timeComponent(createdAt)}-${id}.json`;
}

// ---------------------------------------------------------------------------
// Migration-on-read
// ---------------------------------------------------------------------------

// Events written before the per-document refactor are missing the
// `docId` field. When we read them, we default to the currently
// active document. This is non-destructive: the on-disk object is
// not rewritten; only the in-memory representation returned to
// callers gains the field. A future sweep could backfill.
function migrateEvent(parsed: NeedsAttentionEvent): NeedsAttentionEvent {
  if (parsed.docId) return parsed;
  return { ...parsed, docId: getActiveDocumentId() };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function logNeedsAttention(
  draft: NeedsAttentionDraft,
): Promise<NeedsAttentionEvent> {
  const validated = NeedsAttentionDraftSchema.parse(draft);

  const createdAt = new Date();
  const event: NeedsAttentionEvent = NeedsAttentionEventSchema.parse({
    ...validated,
    id: randomUUID(),
    createdAt: createdAt.toISOString(),
  });

  await writeJson(EVENTS_BUCKET(), eventKey(event.id, createdAt), event);
  return event;
}

export async function listOpenNeedsAttention(options?: {
  docId?: string;
}): Promise<NeedsAttentionEvent[]> {
  // Scan the last OPEN_WINDOW_DAYS partitions. This is a bounded-cost
  // list operation — a long-lived deployment would want an index.
  const now = new Date();
  const prefixes: string[] = [];
  for (let i = 0; i < OPEN_WINDOW_DAYS; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    prefixes.push(`${ROOT_PREFIX}${datePartition(d)}/`);
  }

  const allKeys = (
    await Promise.all(prefixes.map((p) => listObjectKeys(EVENTS_BUCKET(), p)))
  ).flat();
  const events: NeedsAttentionEvent[] = [];

  for (const key of allKeys) {
    const raw = await readJson(EVENTS_BUCKET(), key);
    if (raw === null) continue;
    const parsed = NeedsAttentionEventSchema.safeParse(raw);
    if (!parsed.success) {
      throw new StorageError(
        `Corrupt needs-attention event ${key}: ${parsed.error.message}`,
        "corrupt_object",
      );
    }
    const migrated = migrateEvent(parsed.data);
    if (migrated.resolvedAt) continue;
    if (options?.docId && migrated.docId !== options.docId) continue;
    events.push(migrated);
  }

  // Newest first.
  events.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return events;
}

export async function resolveNeedsAttention(
  id: string,
  resolvedByOverrideId: string,
): Promise<NeedsAttentionEvent> {
  // We don't store a by-id index, so finding the event means scanning
  // recent partitions for an object whose name contains the id. Same
  // OPEN_WINDOW_DAYS bound as listOpenNeedsAttention — resolving an
  // event older than two weeks isn't a supported operation.
  const now = new Date();
  for (let i = 0; i < OPEN_WINDOW_DAYS; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const prefix = `${ROOT_PREFIX}${datePartition(d)}/`;
    const keys = await listObjectKeys(EVENTS_BUCKET(), prefix);
    const match = keys.find((k) => k.endsWith(`-${id}.json`));
    if (!match) continue;

    const raw = await readJson(EVENTS_BUCKET(), match);
    if (raw === null) continue;
    const parsed = NeedsAttentionEventSchema.safeParse(raw);
    if (!parsed.success) {
      throw new StorageError(
        `Corrupt needs-attention event ${match}: ${parsed.error.message}`,
        "corrupt_object",
      );
    }

    const migrated = migrateEvent(parsed.data);
    const resolved: NeedsAttentionEvent = NeedsAttentionEventSchema.parse({
      ...migrated,
      resolvedAt: new Date().toISOString(),
      resolvedByOverrideId,
    });
    await writeJson(EVENTS_BUCKET(), match, resolved);
    return resolved;
  }

  throw new StorageError(
    `Needs-attention event not found within ${OPEN_WINDOW_DAYS} days: ${id}`,
    "not_found",
  );
}
