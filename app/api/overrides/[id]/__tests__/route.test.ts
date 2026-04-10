import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getActiveDocumentId: () => "test-doc",
    getOperatorOverride: vi.fn().mockResolvedValue({
      id: "ov-1",
      docId: "test-doc",
      title: "Override 1",
      category: "general",
      body: "Body",
      sourcePages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: null,
      replacesEntryId: null,
    }),
    updateOperatorOverride: vi.fn().mockResolvedValue({
      id: "ov-1",
      docId: "test-doc",
      title: "Updated",
      category: "general",
      body: "Updated body",
      sourcePages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      createdBy: null,
      replacesEntryId: null,
    }),
    deleteOperatorOverride: vi.fn().mockResolvedValue(undefined),
  };
});

import { GET, PUT, DELETE } from "../route";
import { getOperatorOverride } from "@/lib/storage";

beforeEach(() => vi.clearAllMocks());

const params = Promise.resolve({ id: "ov-1" });

describe("GET /api/overrides/[id]", () => {
  it("returns the override", async () => {
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("ov-1");
  });

  it("returns 404 when not found", async () => {
    vi.mocked(getOperatorOverride).mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/overrides/[id]", () => {
  it("updates the override", async () => {
    const req = new Request("http://localhost", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Updated body" }),
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.body).toBe("Updated body");
  });

  it("returns 400 on non-JSON body", async () => {
    const req = new Request("http://localhost", { method: "PUT", body: "bad" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/overrides/[id]", () => {
  it("deletes the override and returns 204", async () => {
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(204);
  });
});
