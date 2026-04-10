import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    listOpenNeedsAttention: vi.fn().mockResolvedValue([]),
  };
});

import { GET } from "../route";

describe("GET /api/needs-attention", () => {
  it("returns the open events list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toEqual([]);
  });
});
