// Tests for the app-level storage initialization module.
// Verifies idempotency, retry behavior, and seed logic.

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the storage client and minio-json helpers before importing init
// Empty-stream mock for listObjectsV2 — the migration code path
// iterates this to look for colliding overrides. Tests don't seed
// any overrides, so the stream returns no objects.
function emptyObjectStream() {
  const handlers: Record<string, (arg?: unknown) => void> = {};
  const stream = {
    on(event: string, cb: (arg?: unknown) => void) {
      handlers[event] = cb;
      if (event === "end") queueMicrotask(() => cb());
      return stream;
    },
  };
  return stream;
}

vi.mock("../client", () => ({
  getClient: vi.fn().mockReturnValue({
    listBuckets: vi.fn().mockResolvedValue([]),
    bucketExists: vi.fn().mockResolvedValue(false),
    makeBucket: vi.fn().mockResolvedValue(undefined),
    setBucketVersioning: vi.fn().mockResolvedValue(undefined),
    listObjectsV2: vi.fn().mockImplementation(emptyObjectStream),
    removeObject: vi.fn().mockResolvedValue(undefined),
  }),
  HANDBOOK_BUCKET: () => "handbook-test",
  EVENTS_BUCKET: () => "events-test",
}));

vi.mock("../minio-json", () => ({
  readJson: vi.fn().mockResolvedValue(null),
  writeJson: vi.fn().mockResolvedValue(undefined),
}));

// Mock fs to return a minimal seed file
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(
    JSON.stringify({
      document: { id: "test-doc", title: "Test", version: "1", source: "test.pdf" },
      entries: [
        { id: "entry-1", title: "Entry 1", category: "general", body: "Body 1" },
        { id: "entry-2", title: "Entry 2", category: "general", body: "Body 2" },
      ],
    }),
  ),
}));

import { getClient } from "../client";
import { readJson, writeJson } from "../minio-json";

// Import after mocks
let ensureStorageReady: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset the module to clear the `initialized` flag
  vi.resetModules();
  const mod = await import("../init");
  ensureStorageReady = mod.ensureStorageReady;
});

describe("ensureStorageReady", () => {
  it("creates buckets, seeds entries, and writes sentinel", async () => {
    await ensureStorageReady();

    const client = getClient();
    // Buckets created
    expect(client.bucketExists).toHaveBeenCalledTimes(2);
    expect(client.makeBucket).toHaveBeenCalledTimes(2);

    // Versioning enabled
    expect(client.setBucketVersioning).toHaveBeenCalled();

    // Sentinel checked
    expect(readJson).toHaveBeenCalledWith("handbook-test", ".seed-complete-v3");

    // Metadata + 2 entries + sentinel = 4 writes
    expect(writeJson).toHaveBeenCalledTimes(4);

    // First write is metadata
    const metaCall = vi.mocked(writeJson).mock.calls[0];
    expect(metaCall![0]).toBe("handbook-test");
    expect(metaCall![1]).toBe("documents/test-doc/metadata.json");

    // Last write is sentinel
    const sentinelCall = vi.mocked(writeJson).mock.calls[3];
    expect(sentinelCall![1]).toBe(".seed-complete-v3");
  });

  it("skips seeding when sentinel exists", async () => {
    vi.mocked(readJson).mockResolvedValueOnce({ seeded_at: "2026-01-01", layout: "v2" });

    await ensureStorageReady();

    // Only sentinel read, no entry writes
    expect(readJson).toHaveBeenCalledTimes(1);
    expect(writeJson).not.toHaveBeenCalled();
  });

  it("skips bucket creation when buckets already exist", async () => {
    const client = getClient();
    vi.mocked(client.bucketExists).mockResolvedValue(true);
    vi.mocked(readJson).mockResolvedValueOnce({ seeded_at: "2026-01-01", layout: "v2" });

    await ensureStorageReady();

    expect(client.makeBucket).not.toHaveBeenCalled();
  });

  it("is idempotent — second call is a no-op", async () => {
    await ensureStorageReady();
    vi.clearAllMocks();

    await ensureStorageReady();

    // Nothing called on second run
    expect(getClient().listBuckets).not.toHaveBeenCalled();
    expect(readJson).not.toHaveBeenCalled();
  });

  it("migrates overrides whose id collides with a seed entry id", async () => {
    // Stream yielding one colliding override and one non-colliding.
    // The migration should rename only the colliding one.
    const client = getClient();
    vi.mocked(client.listObjectsV2).mockImplementation(() => {
      const handlers: Record<string, (arg?: unknown) => void> = {};
      const stream = {
        on(event: string, cb: (arg?: unknown) => void) {
          handlers[event] = cb;
          if (event === "end") {
            queueMicrotask(() => {
              handlers["data"]?.({ name: "documents/test-doc/entries/tuition.json" });
              handlers["data"]?.({ name: "documents/test-doc/overrides/tuition.json" });
              handlers["data"]?.({ name: "documents/test-doc/overrides/cameras.json" });
              cb();
            });
          }
          return stream;
        },
      };
      return stream as unknown as ReturnType<typeof client.listObjectsV2>;
    });
    vi.mocked(readJson).mockImplementation(async (_bucket, key) => {
      // Sentinel check — return null to trigger seeding path
      if (String(key).endsWith(".seed-complete-v3")) return null;
      // Override object load
      if (String(key).endsWith("overrides/tuition.json")) {
        return {
          id: "tuition",
          docId: "test-doc",
          title: "Tuition",
          category: "general",
          body: "yes, 5%",
          sourcePages: [],
          createdAt: "2026-04-13T00:00:00.000Z",
          createdBy: null,
          replacesEntryId: null,
        };
      }
      return null;
    });

    await ensureStorageReady();

    // The colliding override got renamed with a suffix and replacesEntryId set
    const renameCall = vi
      .mocked(writeJson)
      .mock.calls.find((c) => String(c[1]).match(/overrides\/tuition-[0-9a-f]{4}\.json$/));
    expect(renameCall).toBeDefined();
    const migrated = renameCall![2] as { id: string; replacesEntryId: string };
    expect(migrated.id).toMatch(/^tuition-[0-9a-f]{4}$/);
    expect(migrated.replacesEntryId).toBe("tuition");

    // Old colliding key got removed
    expect(client.removeObject).toHaveBeenCalledWith(
      "handbook-test",
      "documents/test-doc/overrides/tuition.json",
    );
    // Non-colliding override (cameras) was left alone
    expect(client.removeObject).not.toHaveBeenCalledWith(
      "handbook-test",
      "documents/test-doc/overrides/cameras.json",
    );
  });
});
