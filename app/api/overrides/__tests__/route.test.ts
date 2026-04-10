// Tests for /api/overrides routes. Verifies list, create, and
// error handling for the operator override CRUD surface.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getActiveDocumentId: () => "test-doc",
    listOperatorOverrides: vi.fn().mockResolvedValue([]),
    createOperatorOverride: vi.fn().mockResolvedValue({
      id: "test-override",
      docId: "test-doc",
      title: "Test Override",
      category: "general",
      body: "Test body",
      sourcePages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: null,
      replacesEntryId: null,
    }),
  };
});

import { GET, POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/overrides", () => {
  it("returns the override list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.overrides).toEqual([]);
  });
});

describe("POST /api/overrides", () => {
  it("creates an override with valid input", async () => {
    const req = new Request("http://localhost:3000/api/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Test Override",
        category: "general",
        body: "Test body content",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("test-override");
  });

  it("returns 400 on invalid input", async () => {
    const req = new Request("http://localhost:3000/api/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on non-JSON body", async () => {
    const req = new Request("http://localhost:3000/api/overrides", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
