import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getActiveDocumentId: () => "test-doc",
    getHandbookEntry: vi.fn().mockResolvedValue({
      id: "hours",
      docId: "test-doc",
      title: "Hours",
      category: "hours",
      body: "7am to 6pm",
      sourcePages: [],
      lastUpdated: "2026",
    }),
  };
});

import { GET } from "../route";
import { getHandbookEntry } from "@/lib/storage";

const params = Promise.resolve({ id: "hours" });

describe("GET /api/handbook/[id]", () => {
  it("returns the entry", async () => {
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("hours");
  });

  it("returns 404 when not found", async () => {
    vi.mocked(getHandbookEntry).mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
  });
});
