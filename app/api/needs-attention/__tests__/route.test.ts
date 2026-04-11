import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage/init", () => ({
  ensureStorageReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    listOpenNeedsAttention: vi.fn().mockResolvedValue([{ id: "open-1" }]),
    listAllNeedsAttention: vi.fn().mockResolvedValue([{ id: "open-1" }, { id: "resolved-1" }]),
  };
});

import { GET } from "../route";
import { listOpenNeedsAttention, listAllNeedsAttention } from "@/lib/storage";

function makeReq(url: string): Request {
  return new Request(`http://localhost${url}`);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/needs-attention", () => {
  it("returns the open events list by default", async () => {
    const res = await GET(makeReq("/api/needs-attention"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toHaveLength(1);
    expect(data.events[0].id).toBe("open-1");
    expect(listOpenNeedsAttention).toHaveBeenCalled();
    expect(listAllNeedsAttention).not.toHaveBeenCalled();
  });

  it("returns open events when ?state=open", async () => {
    const res = await GET(makeReq("/api/needs-attention?state=open"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toHaveLength(1);
    expect(listOpenNeedsAttention).toHaveBeenCalled();
    expect(listAllNeedsAttention).not.toHaveBeenCalled();
  });

  it("returns open and resolved events when ?state=all", async () => {
    const res = await GET(makeReq("/api/needs-attention?state=all"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toHaveLength(2);
    expect(data.events.map((e: { id: string }) => e.id)).toEqual(["open-1", "resolved-1"]);
    expect(listAllNeedsAttention).toHaveBeenCalled();
    expect(listOpenNeedsAttention).not.toHaveBeenCalled();
  });
});
