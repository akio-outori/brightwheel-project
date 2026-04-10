// Operator override adapter. Overrides are the mutable layer that
// sits on top of the immutable seed entries. Operators create them
// to patch gaps, add clarifications, and correct mistakes in the
// source document without ever touching the seed.
//
// Object layout in the handbook bucket:
//
//   documents/{docId}/overrides/{overrideId}.json  OperatorOverride
//
// Overrides are freely mutable: create, update, delete. They are not
// audit-trailed the way seed entries would be — the assumption is
// that an operator who wants to undo a change does so through the
// normal update/delete flow, not through version history.

import { HANDBOOK_BUCKET } from "./client";
import {
  OperatorOverride,
  OperatorOverrideDraft,
  OperatorOverrideDraftSchema,
  OperatorOverridePatch,
  OperatorOverridePatchSchema,
  OperatorOverrideSchema,
  StorageError,
} from "./types";
import {
  listObjectKeys,
  readJson,
  removeJson,
  writeJson,
} from "./minio-json";

// ---------------------------------------------------------------------------
// Key layout
// ---------------------------------------------------------------------------

function overridesPrefix(docId: string): string {
  return `documents/${docId}/overrides/`;
}

function overrideKey(docId: string, id: string): string {
  return `${overridesPrefix(docId)}${id}.json`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List every operator override attached to a document. Reads through
 * a prefix scan; order is unspecified.
 */
export async function listOperatorOverrides(
  docId: string,
): Promise<OperatorOverride[]> {
  const keys = await listObjectKeys(HANDBOOK_BUCKET(), overridesPrefix(docId));
  const overrides: OperatorOverride[] = [];
  for (const key of keys) {
    const raw = await readJson(HANDBOOK_BUCKET(), key);
    if (raw === null) continue;
    const parsed = OperatorOverrideSchema.safeParse(raw);
    if (!parsed.success) {
      throw new StorageError(
        `Corrupt operator override ${key}: ${parsed.error.message}`,
        "corrupt_object",
      );
    }
    overrides.push(parsed.data);
  }
  return overrides;
}

/**
 * Read a single override by id within a document. Returns `null`
 * if the override does not exist.
 */
export async function getOperatorOverride(
  docId: string,
  id: string,
): Promise<OperatorOverride | null> {
  const raw = await readJson(HANDBOOK_BUCKET(), overrideKey(docId, id));
  if (raw === null) return null;
  const parsed = OperatorOverrideSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StorageError(
      `Corrupt operator override ${id} in ${docId}: ${parsed.error.message}`,
      "corrupt_object",
    );
  }
  return parsed.data;
}

/**
 * Create a new operator override. Id is slugged from the title;
 * duplicates throw `already_exists`. `createdAt` is stamped here.
 */
export async function createOperatorOverride(
  docId: string,
  draft: OperatorOverrideDraft,
): Promise<OperatorOverride> {
  const validatedDraft = OperatorOverrideDraftSchema.parse(draft);
  const id = slugify(validatedDraft.title);

  const existing = await getOperatorOverride(docId, id);
  if (existing) {
    throw new StorageError(
      `Operator override already exists in ${docId}: ${id}`,
      "already_exists",
    );
  }

  const override: OperatorOverride = OperatorOverrideSchema.parse({
    ...validatedDraft,
    id,
    docId,
    createdAt: new Date().toISOString(),
  });

  await writeJson(HANDBOOK_BUCKET(), overrideKey(docId, id), override);
  return override;
}

/**
 * Update an existing override. Id, docId, and createdAt are
 * immutable. `updatedAt` is stamped at write time.
 */
export async function updateOperatorOverride(
  docId: string,
  id: string,
  patch: OperatorOverridePatch,
): Promise<OperatorOverride> {
  const validatedPatch = OperatorOverridePatchSchema.parse(patch);

  const current = await getOperatorOverride(docId, id);
  if (!current) {
    throw new StorageError(
      `Operator override not found in ${docId}: ${id}`,
      "not_found",
    );
  }

  const merged: OperatorOverride = OperatorOverrideSchema.parse({
    ...current,
    ...validatedPatch,
    id, // immutable
    docId, // immutable
    createdAt: current.createdAt, // immutable
    updatedAt: new Date().toISOString(),
  });

  await writeJson(HANDBOOK_BUCKET(), overrideKey(docId, id), merged);
  return merged;
}

/**
 * Delete an override by id. Missing overrides are a no-op —
 * idempotent delete is friendlier to test teardown.
 */
export async function deleteOperatorOverride(
  docId: string,
  id: string,
): Promise<void> {
  await removeJson(HANDBOOK_BUCKET(), overrideKey(docId, id));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Generate a url-safe id from a title. Shared shape with the
// handbook seed ids but kept local here — the handbook adapter no
// longer has a slugify function since entries are seeded, not
// created at runtime.
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
