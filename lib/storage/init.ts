// App-level storage initialization. Replaces the minio-init Docker
// container for environments (like Railway) where depends_on with
// service_completed_successfully isn't available.
//
// Runs once on first request via ensureStorageReady(). Idempotent:
// checks for the .seed-complete-v3 sentinel and skips if present.
// Retries the MinIO connection with exponential backoff so the app
// can start before MinIO is fully ready.
//
// This module does everything the shell script did:
//   1. Create buckets (idempotent)
//   2. Enable versioning on handbook bucket
//   3. Check sentinel → skip if already seeded
//   4. Seed document metadata + entries from the JSON seed file
//   5. Write sentinel

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getClient, HANDBOOK_BUCKET, EVENTS_BUCKET } from "./client";
import { writeJson, readJson, listObjectKeys } from "./minio-json";

const SeedEntrySchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "entry id must be lowercase kebab-case"),
  })
  .passthrough();

const SeedFileSchema = z.object({
  document: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    version: z.string().min(1),
    source: z.string().min(1),
  }),
  entries: z.array(SeedEntrySchema),
});

// Bumped to v3 when the seed handbook was replaced with the
// Sunflower Early Learning fictional content. A fresh deploy with
// an existing MinIO volume will re-seed once; after that the
// sentinel gates future init runs.
const SENTINEL_KEY = ".seed-complete-v3";
const SEED_FILE_PATH = path.join(process.cwd(), "data/seed-handbook.json");

let initialized = false;
let initializing: Promise<void> | null = null;

/**
 * Ensure MinIO buckets exist and the handbook is seeded.
 * Safe to call on every request — no-ops after first success.
 * Retries the MinIO connection up to 30 times (1s apart).
 */
export async function ensureStorageReady(): Promise<void> {
  if (initialized) return;
  if (initializing) return initializing;
  initializing = doInit();
  try {
    await initializing;
    initialized = true;
  } finally {
    initializing = null;
  }
}

async function waitForMinio(maxRetries = 30): Promise<void> {
  const client = getClient();
  for (let i = 0; i < maxRetries; i++) {
    try {
      await client.listBuckets();
      return;
    } catch {
      if (i === maxRetries - 1) throw new Error("MinIO not reachable after 30 retries");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function doInit(): Promise<void> {
  console.debug("[storage-init] starting");

  await waitForMinio();

  const client = getClient();
  const hbBucket = HANDBOOK_BUCKET();
  const evBucket = EVENTS_BUCKET();

  // Create buckets (idempotent)
  for (const bucket of [hbBucket, evBucket]) {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket, "us-east-1");
      console.debug(`[storage-init] created bucket: ${bucket}`);
    }
  }

  // Enable versioning on handbook bucket
  try {
    await client.setBucketVersioning(hbBucket, { Status: "Enabled" });
  } catch {
    // MinIO may not support versioning in all configs — non-fatal
  }

  // STORAGE_RESET_ON_INIT: clear system activity (needs-attention
  // events) so every deploy starts with a clean operator console.
  // Handbook entries and operator overrides are preserved.
  if (process.env.STORAGE_RESET_ON_INIT === "true") {
    await drainBucket(evBucket);
    console.debug("[storage-init] events bucket drained (STORAGE_RESET_ON_INIT)");
  }

  // Check sentinel — skip seeding if handbook already populated
  const sentinel = await readJson(hbBucket, SENTINEL_KEY);
  if (sentinel) {
    console.debug("[storage-init] sentinel found — already seeded");
    return;
  }

  // Load seed file
  let seedRaw: string;
  try {
    seedRaw = await readFile(SEED_FILE_PATH, "utf-8");
  } catch {
    console.warn("[storage-init] no seed file found — skipping seed");
    await writeSentinel(hbBucket);
    return;
  }

  const parsed = SeedFileSchema.safeParse(JSON.parse(seedRaw));
  if (!parsed.success) {
    throw new Error(`Seed file failed validation: ${parsed.error.message}`);
  }
  const seed = parsed.data;
  const docId = seed.document.id;

  const docPrefix = `documents/${docId}`;
  console.debug(`[storage-init] seeding document ${docId} (${seed.entries.length} entries)`);

  // Write document metadata
  const metadata = {
    ...seed.document,
    seededAt: new Date().toISOString(),
  };
  await writeJson(hbBucket, `${docPrefix}/metadata.json`, metadata);

  // Write each entry
  for (const entry of seed.entries) {
    const { id } = entry;
    await writeJson(hbBucket, `${docPrefix}/entries/${id}.json`, {
      ...entry,
      docId,
    });
  }

  console.debug(`[storage-init] seeded ${seed.entries.length} entries`);
  await writeSentinel(hbBucket);
}

async function drainBucket(bucket: string): Promise<void> {
  const client = getClient();
  const keys = await listObjectKeys(bucket, "");
  if (keys.length === 0) return;
  await client.removeObjects(bucket, keys);
  console.debug(`[storage-init] removed ${keys.length} objects from ${bucket}`);
}

async function writeSentinel(bucket: string): Promise<void> {
  await writeJson(bucket, SENTINEL_KEY, {
    seeded_at: new Date().toISOString(),
    layout: "v2",
  });
  console.debug("[storage-init] complete");
}
