// Round-trip integration tests against a real MinIO. These tests
// assume `docker compose up -d minio minio-init` has been run and
// MinIO is reachable on localhost:9000 — the tests target separate
// `handbook-test` and `events-test` buckets (set in vitest.setup.ts)
// so they don't collide with the seeded handbook.
//
// Each describe block truncates its test buckets before running so
// tests are independent and repeatable.
//
// The handbook layer is immutable after seed — these tests seed a
// tiny single-document fixture once per suite and exercise the
// read-only accessors against it. Override CRUD and needs-attention
// round-trips both use the same test document.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Host-side testing: the tests talk to the MinIO container via
// localhost:9000, not the in-compose `minio` hostname.
process.env.STORAGE_ENDPOINT ??= "http://localhost:9000";
process.env.STORAGE_ACCESS_KEY ??= "minioadmin";
process.env.STORAGE_SECRET_KEY ??= "minioadmin";

import {
  EVENTS_BUCKET,
  HANDBOOK_BUCKET,
  __resetClientForTests,
  getClient,
} from "../client";
import {
  createOperatorOverride,
  deleteOperatorOverride,
  getActiveDocumentId,
  getDocumentMetadata,
  getHandbookEntry,
  getOperatorOverride,
  listHandbookEntries,
  listOpenNeedsAttention,
  listOperatorOverrides,
  logNeedsAttention,
  resolveNeedsAttention,
  updateOperatorOverride,
} from "../index";

// ---------------------------------------------------------------------------
// Test document fixture
// ---------------------------------------------------------------------------

// The tests seed one small document. docId matches what
// getActiveDocumentId() returns so the adapter's default seam lines
// up with the fixture.
const TEST_DOC_ID = getActiveDocumentId();
const TEST_DOC_META = {
  id: TEST_DOC_ID,
  title: "Test Document",
  version: "test",
  source: "test.pdf",
  seededAt: "2026-01-01T00:00:00.000Z",
};
const TEST_ENTRY = {
  id: "test-entry",
  docId: TEST_DOC_ID,
  title: "Test Entry",
  category: "general" as const,
  body: "This is a seeded test entry. Immutable after seed.",
  sourcePages: [1],
  lastUpdated: "2026-01-01",
};

async function seedTestDocument(): Promise<void> {
  const client = getClient();
  const bucket = HANDBOOK_BUCKET();

  const metaBody = Buffer.from(JSON.stringify(TEST_DOC_META), "utf-8");
  await client.putObject(
    bucket,
    `documents/${TEST_DOC_ID}/metadata.json`,
    metaBody,
    metaBody.length,
    { "Content-Type": "application/json; charset=utf-8" },
  );

  const entryBody = Buffer.from(JSON.stringify(TEST_ENTRY), "utf-8");
  await client.putObject(
    bucket,
    `documents/${TEST_DOC_ID}/entries/${TEST_ENTRY.id}.json`,
    entryBody,
    entryBody.length,
    { "Content-Type": "application/json; charset=utf-8" },
  );
}

// ---------------------------------------------------------------------------
// Bucket hygiene
// ---------------------------------------------------------------------------

async function ensureBucket(name: string, withVersioning: boolean) {
  const client = getClient();
  const exists = await client.bucketExists(name);
  if (!exists) {
    await client.makeBucket(name, "us-east-1");
  }
  if (withVersioning) {
    await client.setBucketVersioning(name, { Status: "Enabled" });
  }
}

async function truncateBucket(name: string) {
  const client = getClient();
  const exists = await client.bucketExists(name);
  if (!exists) return;
  const keys: string[] = [];
  const stream = client.listObjectsV2(name, "", true);
  for await (const obj of stream) {
    if (obj.name) keys.push(obj.name);
  }
  if (keys.length > 0) {
    await client.removeObjects(name, keys);
  }
}

beforeAll(async () => {
  __resetClientForTests();
  await ensureBucket(HANDBOOK_BUCKET(), true);
  await ensureBucket(EVENTS_BUCKET(), false);
});

beforeEach(async () => {
  await truncateBucket(HANDBOOK_BUCKET());
  await truncateBucket(EVENTS_BUCKET());
  await seedTestDocument();
});

afterAll(() => {
  __resetClientForTests();
});

// ---------------------------------------------------------------------------
// Handbook read-only accessors
// ---------------------------------------------------------------------------

describe("handbook adapter", () => {
  it("reads document metadata for the seeded doc", async () => {
    const meta = await getDocumentMetadata(TEST_DOC_ID);
    expect(meta.id).toBe(TEST_DOC_ID);
    expect(meta.title).toBe("Test Document");
  });

  it("throws not_found when asked for an unknown document", async () => {
    await expect(getDocumentMetadata("does-not-exist")).rejects.toMatchObject({
      name: "StorageError",
      code: "not_found",
    });
  });

  it("lists seeded entries for a document", async () => {
    const entries = await listHandbookEntries(TEST_DOC_ID);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe("test-entry");
    expect(entries[0]!.docId).toBe(TEST_DOC_ID);
  });

  it("returns an empty list for an unknown document", async () => {
    // listHandbookEntries is a prefix scan — it returns [] for an
    // unknown docId rather than throwing, matching the semantics
    // callers need from operator UIs that render "no entries yet".
    const entries = await listHandbookEntries("nobody-home");
    expect(entries).toEqual([]);
  });

  it("fetches a specific seed entry by id", async () => {
    const entry = await getHandbookEntry(TEST_DOC_ID, "test-entry");
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe("Test Entry");
  });

  it("returns null for an unknown entry id", async () => {
    const entry = await getHandbookEntry(TEST_DOC_ID, "ghost");
    expect(entry).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Operator overrides
// ---------------------------------------------------------------------------

describe("operator overrides adapter", () => {
  it("empty → create → list → get → update → delete round-trip", async () => {
    expect(await listOperatorOverrides(TEST_DOC_ID)).toEqual([]);

    const created = await createOperatorOverride(TEST_DOC_ID, {
      title: "Pet Policy Clarification",
      category: "policies",
      body: "Classroom pets are welcome; talk to your teacher first.",
      sourcePages: [],
      createdBy: null,
      replacesEntryId: null,
    });
    expect(created.id).toBe("pet-policy-clarification");
    expect(created.docId).toBe(TEST_DOC_ID);
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const listed = await listOperatorOverrides(TEST_DOC_ID);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe("pet-policy-clarification");

    const fetched = await getOperatorOverride(
      TEST_DOC_ID,
      "pet-policy-clarification",
    );
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe("Pet Policy Clarification");

    const updated = await updateOperatorOverride(
      TEST_DOC_ID,
      "pet-policy-clarification",
      { body: "Updated: classroom pets welcome; talk to your teacher." },
    );
    expect(updated.body).toContain("Updated:");
    expect(updated.title).toBe("Pet Policy Clarification");
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await deleteOperatorOverride(TEST_DOC_ID, "pet-policy-clarification");
    expect(await listOperatorOverrides(TEST_DOC_ID)).toEqual([]);
  });

  it("getOperatorOverride returns null for unknown ids", async () => {
    const missing = await getOperatorOverride(TEST_DOC_ID, "does-not-exist");
    expect(missing).toBeNull();
  });

  it("createOperatorOverride rejects duplicate slugs", async () => {
    await createOperatorOverride(TEST_DOC_ID, {
      title: "Unique Clarification",
      category: "policies",
      body: "First version.",
      sourcePages: [],
      createdBy: null,
      replacesEntryId: null,
    });
    await expect(
      createOperatorOverride(TEST_DOC_ID, {
        title: "Unique Clarification",
        category: "policies",
        body: "Different body, same title → same slug.",
        sourcePages: [],
        createdBy: null,
        replacesEntryId: null,
      }),
    ).rejects.toMatchObject({
      name: "StorageError",
      code: "already_exists",
    });
  });

  it("updateOperatorOverride on a missing id throws not_found", async () => {
    await expect(
      updateOperatorOverride(TEST_DOC_ID, "ghost-override", {
        body: "Whatever",
      }),
    ).rejects.toMatchObject({
      name: "StorageError",
      code: "not_found",
    });
  });

  it("deleteOperatorOverride on a missing id is a no-op", async () => {
    // Idempotent delete — test teardown hits this path.
    await expect(
      deleteOperatorOverride(TEST_DOC_ID, "never-existed"),
    ).resolves.toBeUndefined();
  });

  it("createOperatorOverride rejects invalid input at the schema boundary", async () => {
    await expect(
      createOperatorOverride(TEST_DOC_ID, {
        title: "",
        // @ts-expect-error — deliberately invalid category
        category: "not-a-category",
        body: "x",
        sourcePages: [],
        createdBy: null,
        replacesEntryId: null,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});

// ---------------------------------------------------------------------------
// Needs-attention round-trips
// ---------------------------------------------------------------------------

describe("needs-attention adapter", () => {
  it("log → list → resolve round-trip", async () => {
    expect(await listOpenNeedsAttention()).toEqual([]);

    const logged = await logNeedsAttention({
      docId: TEST_DOC_ID,
      question: "How can I schedule a tour?",
      result: {
        answer: "I'm not sure — I don't have information about tours yet.",
        confidence: "low",
        cited_entries: [],
        escalate: true,
        escalation_reason: "no matching handbook entry",
      },
    });
    expect(logged.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(logged.docId).toBe(TEST_DOC_ID);
    expect(logged.resolvedAt).toBeUndefined();

    const open = await listOpenNeedsAttention();
    expect(open).toHaveLength(1);
    expect(open[0]!.id).toBe(logged.id);
    expect(open[0]!.question).toBe("How can I schedule a tour?");
    expect(open[0]!.docId).toBe(TEST_DOC_ID);

    const resolved = await resolveNeedsAttention(
      logged.id,
      "scheduling-a-tour-override",
    );
    expect(resolved.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(resolved.resolvedByOverrideId).toBe("scheduling-a-tour-override");

    const openAfter = await listOpenNeedsAttention();
    expect(openAfter).toHaveLength(0);
  });

  it("list filters by docId when provided", async () => {
    await logNeedsAttention({
      docId: TEST_DOC_ID,
      question: "Question for the active doc?",
      result: {
        answer: "…",
        confidence: "low",
        cited_entries: [],
        escalate: true,
        escalation_reason: "x",
      },
    });
    await logNeedsAttention({
      docId: "other-document",
      question: "Question for some other doc?",
      result: {
        answer: "…",
        confidence: "low",
        cited_entries: [],
        escalate: true,
        escalation_reason: "x",
      },
    });

    const all = await listOpenNeedsAttention();
    expect(all).toHaveLength(2);

    const active = await listOpenNeedsAttention({ docId: TEST_DOC_ID });
    expect(active).toHaveLength(1);
    expect(active[0]!.docId).toBe(TEST_DOC_ID);
  });

  it("resolveNeedsAttention on an unknown id throws not_found", async () => {
    await expect(
      resolveNeedsAttention(
        "00000000-0000-0000-0000-000000000000",
        "some-override",
      ),
    ).rejects.toMatchObject({
      name: "StorageError",
      code: "not_found",
    });
  });

  it("logNeedsAttention rejects invalid draft input", async () => {
    // Assert ZodError specifically so a MinIO network blip can't
    // accidentally satisfy this test.
    await expect(
      logNeedsAttention({
        docId: TEST_DOC_ID,
        question: "",
        result: {
          answer: "ok",
          // @ts-expect-error — invalid enum value
          confidence: "medium",
          cited_entries: [],
          escalate: false,
        },
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});
