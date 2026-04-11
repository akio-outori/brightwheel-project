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
      operatorReply: "Yes, we offer summer camp.",
    }),
  };
});

import { POST } from "../route";
import { createOperatorOverride, resolveNeedsAttention, StorageError } from "@/lib/storage";

beforeEach(() => vi.clearAllMocks());

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/needs-attention/evt-1/resolve-with-entry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/needs-attention/[id]/resolve-with-entry", () => {
  it("resolves with a reply and creates an override when opted in", async () => {
    const res = await POST(
      makeReq({
        replyToParent: "Yes, we offer summer camp.",
        handbookOverride: {
          title: "Summer camp",
          category: "general",
        },
      }),
      { params: Promise.resolve({ id: "evt-1" }) },
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.override.id).toBe("new-override");
    expect(data.event.resolvedAt).toBeTruthy();
    expect(data.event.operatorReply).toBe("Yes, we offer summer camp.");
    // Override body mirrors the parent reply.
    expect(vi.mocked(createOperatorOverride).mock.calls[0]![1].body).toBe(
      "Yes, we offer summer camp.",
    );
    // resolveNeedsAttention gets both reply and override id.
    expect(vi.mocked(resolveNeedsAttention).mock.calls[0]![1]).toMatchObject({
      operatorReply: "Yes, we offer summer camp.",
      resolvedByOverrideId: "new-override",
    });
  });

  it("resolves with a reply-only (no handbook override) when checkbox is off", async () => {
    const res = await POST(
      makeReq({ replyToParent: "He's doing fine — I saw him at snack time, all smiles." }),
      { params: Promise.resolve({ id: "evt-1" }) },
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    // No override was created for this one-off reply.
    expect(data.override).toBeNull();
    expect(createOperatorOverride).not.toHaveBeenCalled();
    expect(vi.mocked(resolveNeedsAttention).mock.calls[0]![1]).toMatchObject({
      operatorReply: "He's doing fine — I saw him at snack time, all smiles.",
    });
    expect(vi.mocked(resolveNeedsAttention).mock.calls[0]![1].resolvedByOverrideId).toBeUndefined();
  });

  it("returns 400 when replyToParent is missing", async () => {
    const res = await POST(makeReq({ handbookOverride: { title: "Fix", category: "general" } }), {
      params: Promise.resolve({ id: "evt-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty replyToParent", async () => {
    const res = await POST(makeReq({ replyToParent: "" }), {
      params: Promise.resolve({ id: "evt-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 on duplicate override title", async () => {
    vi.mocked(createOperatorOverride).mockRejectedValueOnce(
      new StorageError("exists", "already_exists"),
    );
    const res = await POST(
      makeReq({
        replyToParent: "Here's the answer.",
        handbookOverride: { title: "Dup", category: "general" },
      }),
      { params: Promise.resolve({ id: "evt-1" }) },
    );
    expect(res.status).toBe(409);
  });

  it("returns 500 when override creation fails unexpectedly", async () => {
    vi.mocked(createOperatorOverride).mockRejectedValueOnce(new Error("disk full"));
    const res = await POST(
      makeReq({
        replyToParent: "Here's the answer.",
        handbookOverride: { title: "Fix", category: "general" },
      }),
      { params: Promise.resolve({ id: "evt-1" }) },
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Could not create override.");
  });

  it("returns 409 partial-success when event not found after override was created", async () => {
    vi.mocked(resolveNeedsAttention).mockRejectedValueOnce(
      new StorageError("not found", "not_found"),
    );
    const res = await POST(
      makeReq({
        replyToParent: "Here's the answer.",
        handbookOverride: { title: "Fix", category: "general" },
      }),
      { params: Promise.resolve({ id: "evt-1" }) },
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.partialSuccess).toBe(true);
    expect(data.override.id).toBe("new-override");
    expect(data.error).toContain("handbook entry was saved");
  });

  it("returns 409 when event not found (reply-only, no partial-success)", async () => {
    vi.mocked(resolveNeedsAttention).mockRejectedValueOnce(
      new StorageError("not found", "not_found"),
    );
    const res = await POST(makeReq({ replyToParent: "Just a reply." }), {
      params: Promise.resolve({ id: "evt-1" }),
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.partialSuccess).toBe(false);
    expect(data.override).toBeNull();
  });

  it("returns 500 partial-success when resolve fails after override was created", async () => {
    vi.mocked(resolveNeedsAttention).mockRejectedValueOnce(new Error("minio down"));
    const res = await POST(
      makeReq({
        replyToParent: "Here's the answer.",
        handbookOverride: { title: "Fix", category: "general" },
      }),
      { params: Promise.resolve({ id: "evt-1" }) },
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.partialSuccess).toBe(true);
    expect(data.override.id).toBe("new-override");
    expect(data.error).toContain("handbook entry was saved");
  });

  it("returns 500 when resolve fails (reply-only)", async () => {
    vi.mocked(resolveNeedsAttention).mockRejectedValueOnce(new Error("minio down"));
    const res = await POST(makeReq({ replyToParent: "Just a reply." }), {
      params: Promise.resolve({ id: "evt-1" }),
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.partialSuccess).toBe(false);
    expect(data.override).toBeNull();
  });

  it("returns 400 on non-JSON body", async () => {
    const req = new Request("http://localhost/api/needs-attention/evt-1/resolve-with-entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "evt-1" }) });
    expect(res.status).toBe(400);
  });
});
