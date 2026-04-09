// Round-trip integration tests against a real MinIO. These tests
// assume `docker compose up -d minio minio-init` has been run and
// MinIO is reachable on localhost:9000 — the tests target separate
// `handbook-test` and `events-test` buckets (set in vitest.setup.ts)
// so they don't collide with the seeded handbook.
//
// Each describe block truncates its test buckets before running so
// tests are independent and repeatable.

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
  createHandbookEntry,
  getHandbookEntry,
  listHandbookEntries,
  listOpenNeedsAttention,
  logNeedsAttention,
  resolveNeedsAttention,
  updateHandbookEntry,
} from "../index";

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
});

afterAll(() => {
  __resetClientForTests();
});

// ---------------------------------------------------------------------------
// Handbook round-trips
// ---------------------------------------------------------------------------

describe("handbook adapter", () => {
  it("create → list → get → update round-trip", async () => {
    expect(await listHandbookEntries()).toEqual([]);

    const created = await createHandbookEntry({
      title: "Scheduling a Tour",
      category: "enrollment",
      body: "Call the center Monday through Friday, 9am to 3pm.",
      sourcePages: [],
    });
    expect(created.id).toBe("scheduling-a-tour");
    expect(created.category).toBe("enrollment");
    expect(created.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const listed = await listHandbookEntries();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe("scheduling-a-tour");

    const fetched = await getHandbookEntry("scheduling-a-tour");
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe("Scheduling a Tour");

    const updated = await updateHandbookEntry("scheduling-a-tour", {
      body: "Call the center Monday through Friday, 9am to 3pm. Tours are offered Tuesdays and Thursdays.",
    });
    expect(updated.body).toContain("Tuesdays and Thursdays");
    expect(updated.title).toBe("Scheduling a Tour"); // unchanged
    expect(updated.lastUpdated >= created.lastUpdated).toBe(true);

    const relistedAfterUpdate = await listHandbookEntries();
    expect(relistedAfterUpdate).toHaveLength(1);
    expect(relistedAfterUpdate[0]!.body).toContain("Tuesdays and Thursdays");
  });

  it("getHandbookEntry returns null for unknown ids", async () => {
    const missing = await getHandbookEntry("does-not-exist");
    expect(missing).toBeNull();
  });

  it("createHandbookEntry rejects duplicate slugs", async () => {
    await createHandbookEntry({
      title: "Class Pets",
      category: "curriculum",
      body: "Pets live in the classroom and are cared for by children.",
      sourcePages: [],
    });
    await expect(
      createHandbookEntry({
        title: "Class Pets",
        category: "curriculum",
        body: "Different body, same title → same slug.",
        sourcePages: [],
      }),
    ).rejects.toMatchObject({
      name: "StorageError",
      code: "already_exists",
    });
  });

  it("updateHandbookEntry on a missing id throws not_found", async () => {
    await expect(
      updateHandbookEntry("ghost-entry", { body: "Whatever" }),
    ).rejects.toMatchObject({
      name: "StorageError",
      code: "not_found",
    });
  });

  it("createHandbookEntry rejects invalid input at the schema boundary", async () => {
    // The schema rejects both the empty title and the bogus category.
    // We assert it's specifically a ZodError — not any Error — so
    // this test can't pass if the adapter accidentally swallowed a
    // network error from MinIO and treated it as invalid input.
    await expect(
      createHandbookEntry({
        title: "",
        // @ts-expect-error — deliberately invalid category
        category: "not-a-category",
        body: "x",
        sourcePages: [],
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
    expect(logged.resolvedAt).toBeUndefined();

    const open = await listOpenNeedsAttention();
    expect(open).toHaveLength(1);
    expect(open[0]!.id).toBe(logged.id);
    expect(open[0]!.question).toBe("How can I schedule a tour?");

    const resolved = await resolveNeedsAttention(logged.id, "scheduling-a-tour");
    expect(resolved.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(resolved.resolvedByEntryId).toBe("scheduling-a-tour");

    const openAfter = await listOpenNeedsAttention();
    expect(openAfter).toHaveLength(0);
  });

  it("resolveNeedsAttention on an unknown id throws not_found", async () => {
    await expect(
      resolveNeedsAttention(
        "00000000-0000-0000-0000-000000000000",
        "some-entry",
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
