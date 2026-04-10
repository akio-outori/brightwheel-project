import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getActiveDocumentId: () => "test-doc",
    createOperatorOverride: vi.fn().mockResolvedValue({
      id: "new-override",
      docId: "test-doc",
      title: "Fix",
      category: "general",
      body: "Fixed answer",
      sourcePages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: null,
      replacesEntryId: null,
    }),
    resolveNeedsAttention: vi.fn().mockResolvedValue({
      id: "evt-1",
      resolvedAt: "2026-01-01T01:00:00.000Z",
      resolvedByOverrideId: "new-override",
    }),
  };
});

import { POST } from "../route";
import { createOperatorOverride } from "@/lib/storage";

beforeEach(() => vi.clearAllMocks());

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/needs-attention/evt-1/resolve-with-entry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/needs-attention/[id]/resolve-with-entry", () => {
  it("creates an override and resolves the event atomically", async () => {
    const res = await POST(
      makeReq({ title: "Fix", category: "general", body: "Fixed answer" }),
      { params: Promise.resolve({ id: "evt-1" }) },
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.override.id).toBe("new-override");
    expect(data.event.resolvedAt).toBeTruthy();
  });

  it("returns 400 on invalid input", async () => {
    const res = await POST(makeReq({ title: "" }), {
      params: Promise.resolve({ id: "evt-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 on duplicate override title", async () => {
    vi.mocked(createOperatorOverride).mockRejectedValueOnce(
      new (await import("@/lib/storage")).StorageError("exists", "already_exists"),
    );
    const res = await POST(
      makeReq({ title: "Dup", category: "general", body: "body" }),
      { params: Promise.resolve({ id: "evt-1" }) },
    );
    expect(res.status).toBe(409);
  });
});
