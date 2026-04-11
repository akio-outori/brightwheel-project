// Tests for GET /api/handbook. Verifies the read-only document
// endpoint returns the expected shape.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/init", () => ({
  ensureStorageReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage", () => ({
  getActiveDocumentId: () => "test-doc",
  getDocumentMetadata: vi.fn().mockResolvedValue({
    id: "test-doc",
    title: "Test",
    version: "1",
    source: "test.pdf",
    seededAt: "2026-01-01T00:00:00.000Z",
  }),
  listHandbookEntries: vi.fn().mockResolvedValue([
    {
      id: "e1",
      docId: "test-doc",
      title: "Entry 1",
      category: "general",
      body: "Body 1",
      sourcePages: [],
      lastUpdated: "2026",
    },
  ]),
  listOperatorOverrides: vi.fn().mockResolvedValue([]),
  StorageError: class extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
      this.name = "StorageError";
    }
  },
}));

import { GET } from "../route";
import { getDocumentMetadata, StorageError } from "@/lib/storage";

describe("GET /api/handbook", () => {
  it("returns document with metadata, entries, and overrides", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.document.metadata.id).toBe("test-doc");
    expect(data.document.entries).toHaveLength(1);
    expect(data.document.overrides).toHaveLength(0);
  });

  it("returns 404 when document is not seeded", async () => {
    vi.mocked(getDocumentMetadata).mockRejectedValueOnce(
      new StorageError("not found", "not_found"),
    );
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(getDocumentMetadata).mockRejectedValueOnce(new Error("MinIO down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
