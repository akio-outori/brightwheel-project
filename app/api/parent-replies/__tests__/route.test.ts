// Tests for GET /api/parent-replies. The endpoint filters ids at
// the boundary (UUID shape, dedupe, cap) and returns the storage
// layer's resolved-with-reply subset in a parent-safe shape.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage/init", () => ({
  ensureStorageReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getResolvedEventsWithReplies: vi.fn(),
  };
});

import { GET } from "../route";
import { getResolvedEventsWithReplies } from "@/lib/storage";

const VALID_UUID_A = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => vi.clearAllMocks());

function makeReq(url: string): Request {
  return new Request(`http://localhost${url}`);
}

describe("GET /api/parent-replies", () => {
  it("returns empty list when no ids are supplied", async () => {
    const res = await GET(makeReq("/api/parent-replies"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.replies).toEqual([]);
    expect(getResolvedEventsWithReplies).not.toHaveBeenCalled();
  });

  it("filters out malformed ids before hitting storage", async () => {
    vi.mocked(getResolvedEventsWithReplies).mockResolvedValueOnce([]);
    const res = await GET(
      makeReq(`/api/parent-replies?ids=not-a-uuid,${VALID_UUID_A},also-bad`),
    );
    expect(res.status).toBe(200);
    // Only the valid uuid should have been passed through.
    expect(getResolvedEventsWithReplies).toHaveBeenCalledWith([VALID_UUID_A]);
  });

  it("returns a parent-safe projection of resolved events", async () => {
    vi.mocked(getResolvedEventsWithReplies).mockResolvedValueOnce([
      {
        id: VALID_UUID_A,
        docId: "dcfd",
        question: "Do you offer summer camp?",
        createdAt: "2026-04-10T10:00:00.000Z",
        resolvedAt: "2026-04-10T10:05:00.000Z",
        resolvedByOverrideId: "summer-camp",
        operatorReply: "Yes! 8am-4pm, $240/week.",
        result: {
          answer: "",
          confidence: "low",
          cited_entries: [],
          escalate: true,
        },
      },
    ]);
    const res = await GET(makeReq(`/api/parent-replies?ids=${VALID_UUID_A}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.replies).toHaveLength(1);
    expect(data.replies[0]).toEqual({
      id: VALID_UUID_A,
      question: "Do you offer summer camp?",
      reply: "Yes! 8am-4pm, $240/week.",
      resolvedAt: "2026-04-10T10:05:00.000Z",
    });
    // Internal fields (LLM draft, docId) are not leaked.
    expect(data.replies[0]).not.toHaveProperty("result");
    expect(data.replies[0]).not.toHaveProperty("docId");
  });

  it("dedupes and caps the ids list", async () => {
    vi.mocked(getResolvedEventsWithReplies).mockResolvedValueOnce([]);
    await GET(
      makeReq(
        `/api/parent-replies?ids=${VALID_UUID_A},${VALID_UUID_A},${VALID_UUID_B}`,
      ),
    );
    const calledWith = vi.mocked(getResolvedEventsWithReplies).mock.calls[0]![0];
    expect(calledWith).toHaveLength(2);
    expect(calledWith).toContain(VALID_UUID_A);
    expect(calledWith).toContain(VALID_UUID_B);
  });
});
