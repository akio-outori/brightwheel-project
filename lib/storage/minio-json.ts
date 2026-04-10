// Shared JSON I/O helpers for the storage package. Extracted from
// handbook.ts and needs-attention.ts so the handbook, overrides, and
// needs-attention adapters can all go through a single code path.
//
// Keep this file small and dependency-free beyond the MinIO client —
// the whole point is that adding a new storage adapter (e.g.
// overrides.ts) doesn't mean copy-pasting `readJson` again.

import { getClient } from "./client";

/**
 * Read a JSON object from MinIO. Returns `null` if the object does not
 * exist; non-404 errors propagate unchanged. Callers are responsible
 * for schema validation of the returned value.
 */
export async function readJson(bucket: string, key: string): Promise<unknown | null> {
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

/**
 * Write a JSON object to MinIO with `Content-Type: application/json`.
 * The value is serialized with two-space indentation so objects are
 * human-readable when inspected through the MinIO console.
 */
export async function writeJson(bucket: string, key: string, value: unknown): Promise<void> {
  const client = getClient();
  const body = Buffer.from(JSON.stringify(value, null, 2), "utf-8");
  await client.putObject(bucket, key, body, body.length, {
    "Content-Type": "application/json; charset=utf-8",
  });
}

/**
 * Delete a JSON object from MinIO. Missing objects are a no-op;
 * non-404 errors propagate.
 */
export async function removeJson(bucket: string, key: string): Promise<void> {
  const client = getClient();
  try {
    await client.removeObject(bucket, key);
  } catch (err: unknown) {
    if (isNotFound(err)) return;
    throw err;
  }
}

/**
 * List every object key under a bucket/prefix combination. Recurses
 * into nested "directories". Returns keys in whatever order the SDK
 * emits them — callers should not rely on sort order.
 */
export async function listObjectKeys(bucket: string, prefix: string): Promise<string[]> {
  const client = getClient();
  const keys: string[] = [];
  const stream = client.listObjectsV2(bucket, prefix, true);
  for await (const obj of stream) {
    if (obj.name) keys.push(obj.name);
  }
  return keys;
}

/**
 * Translate the handful of MinIO / S3 "not found" error shapes we
 * care about into a single boolean. New error codes can be added
 * here as we encounter them in practice.
 */
export function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? (err as Record<string, unknown>).code : undefined;
  return code === "NoSuchKey" || code === "NotFound";
}
