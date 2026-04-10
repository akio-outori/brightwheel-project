import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    resolveNeedsAttention: vi.fn().mockResolvedValue({
      id: "evt-1",
      docId: "test-doc",
      question: "test?",
      result: { answer: "x", confidence: "low", cited_entries: [], escalate: true },
      createdAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: "2026-01-01T01:00:00.000Z",
      resolvedByOverrideId: "override-1",
    }),
  };
});

import { POST } from "../route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/needs-attention/evt-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/needs-attention/[id]", () => {
  it("resolves an event", async () => {
    const res = await POST(makeReq({ resolvedByOverrideId: "override-1" }), {
      params: Promise.resolve({ id: "evt-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 on missing resolvedByOverrideId", async () => {
    const res = await POST(makeReq({}), {
      params: Promise.resolve({ id: "evt-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on non-JSON body", async () => {
    const req = new Request("http://localhost/api/needs-attention/evt-1", {
      method: "POST",
      body: "nope",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "evt-1" }) });
    expect(res.status).toBe(400);
  });
});
