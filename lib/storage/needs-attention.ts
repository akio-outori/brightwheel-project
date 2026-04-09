// Needs-attention event adapter. Append-only log of questions the
// system escalated, partitioned by date for cheap listing.
//
// Object layout:
//
//   events/needs-attention/{YYYY-MM-DD}/{HH-mm-ss}-{uuid}.json
//
// "Open" means resolvedAt is absent. Resolution doesn't delete the
// object — it rewrites it with resolvedAt + resolvedByEntryId set.
// The operator console filters for open events by scanning recent
// date partitions (the last 14 days is plenty for a prototype).

import { randomUUID } from "node:crypto";
import { EVENTS_BUCKET, getClient } from "./client";
import {
  NeedsAttentionDraft,
  NeedsAttentionDraftSchema,
  NeedsAttentionEvent,
  NeedsAttentionEventSchema,
  StorageError,
} from "./types";

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
// Low-level JSON helpers (mirror handbook.ts — kept local, not exported,
// because the storage package is the only layer that talks to MinIO)
// ---------------------------------------------------------------------------

async function readJson(bucket: string, key: string): Promise<unknown | null> {
  const client = getClient();
  try {
    const stream = await client.getObject(bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
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
// Key index (scan objects under a prefix)
// ---------------------------------------------------------------------------

async function listObjectKeys(prefix: string): Promise<string[]> {
  const client = getClient();
  const keys: string[] = [];
  const stream = client.listObjectsV2(EVENTS_BUCKET(), prefix, true);
  for await (const obj of stream) {
    if (obj.name) keys.push(obj.name);
  }
  return keys;
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

export async function listOpenNeedsAttention(): Promise<NeedsAttentionEvent[]> {
  // Scan the last OPEN_WINDOW_DAYS partitions. This is a bounded-cost
  // list operation — a long-lived deployment would want an index.
  const now = new Date();
  const prefixes: string[] = [];
  for (let i = 0; i < OPEN_WINDOW_DAYS; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    prefixes.push(`${ROOT_PREFIX}${datePartition(d)}/`);
  }

  const allKeys = (await Promise.all(prefixes.map(listObjectKeys))).flat();
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
    if (!parsed.data.resolvedAt) events.push(parsed.data);
  }

  // Newest first.
  events.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return events;
}

export async function resolveNeedsAttention(
  id: string,
  resolvedByEntryId: string,
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
    const keys = await listObjectKeys(prefix);
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

    const resolved: NeedsAttentionEvent = NeedsAttentionEventSchema.parse({
      ...parsed.data,
      resolvedAt: new Date().toISOString(),
      resolvedByEntryId,
    });
    await writeJson(EVENTS_BUCKET(), match, resolved);
    return resolved;
  }

  throw new StorageError(
    `Needs-attention event not found within ${OPEN_WINDOW_DAYS} days: ${id}`,
    "not_found",
  );
}
