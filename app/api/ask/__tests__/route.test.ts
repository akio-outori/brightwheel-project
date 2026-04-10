// Tests for POST /api/ask. Exercises the route handler with mocked
// storage and LLM to verify:
//   - Input validation (missing/invalid question)
//   - Preflight classifier integration (specific-child questions hold)
//   - Post-response pipeline integration (hallucinated citations hold)
//   - Stock response on hold
//   - Clean passthrough on grounded answers
//   - Error handling (LLM failure → 500)

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the storage layer
vi.mock("@/lib/storage", () => ({
  getActiveDocumentId: () => "test-doc",
  getDocumentMetadata: vi.fn().mockResolvedValue({
    id: "test-doc",
    title: "Test Handbook",
    version: "1.0",
    source: "test.pdf",
    seededAt: "2026-01-01T00:00:00.000Z",
  }),
  listHandbookEntries: vi.fn().mockResolvedValue([
    {
      id: "hours",
      docId: "test-doc",
      title: "Hours of Operation",
      category: "hours",
      body: "Monday through Friday 7am to 6pm.",
      sourcePages: [],
      lastUpdated: "2026",
    },
  ]),
  listOperatorOverrides: vi.fn().mockResolvedValue([]),
  logNeedsAttention: vi.fn().mockResolvedValue({ id: "evt-1" }),
}));

// Mock the LLM client
vi.mock("@/lib/llm/config", () => ({
  getActiveAgentConfig: vi.fn().mockResolvedValue({
    id: "test",
    name: "Test",
    version: "1",
    systemPrompt: "You are a test assistant.",
    model: "test-model",
    temperature: 0,
    maxTokens: 100,
    apiKey: "test-key",
  }),
}));

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    askLLM: vi.fn().mockResolvedValue({
      answer: "We are open Monday through Friday 7am to 6pm.",
      confidence: "high",
      cited_entries: ["hours"],
      directly_addressed_by: ["hours"],
      escalate: false,
      escalation_reason: undefined,
    }),
  };
});

import { POST } from "../route";
import { askLLM } from "@/lib/llm";
import { logNeedsAttention } from "@/lib/storage";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/ask", () => {
  it("returns 400 on missing question", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty question", async () => {
    const res = await POST(makeRequest({ question: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on non-JSON body", async () => {
    const req = new Request("http://localhost:3000/api/ask", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns a grounded answer for a normal question", async () => {
    const res = await POST(makeRequest({ question: "What time do you open?" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.confidence).toBe("high");
    expect(data.escalate).toBe(false);
    expect(data.answer).toContain("Monday");
  });

  it("preflight-holds a specific-child health question", async () => {
    const res = await POST(
      makeRequest({ question: "My son has a fever, should I bring him in?" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.escalate).toBe(true);
    expect(data.escalation_reason).toContain("held_for_review");
    expect(data.answer).toContain("staff member");
    // LLM should NOT have been called
    expect(askLLM).not.toHaveBeenCalled();
    // Needs-attention should have been logged
    expect(logNeedsAttention).toHaveBeenCalled();
  });

  it("holds when the model hallucinates a citation", async () => {
    vi.mocked(askLLM).mockResolvedValueOnce({
      answer: "The parking lot is on Elm Street.",
      confidence: "high",
      cited_entries: ["fake-entry-id"],
      directly_addressed_by: ["fake-entry-id"],
      escalate: false,
      escalation_reason: undefined,
    });
    const res = await POST(makeRequest({ question: "Where do I park?" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.escalate).toBe(true);
    expect(data.escalation_reason).toContain("hallucinated_citation");
  });

  it("holds when the model self-escalates", async () => {
    vi.mocked(askLLM).mockResolvedValueOnce({
      answer: "I'm not sure about that.",
      confidence: "low",
      cited_entries: [],
      directly_addressed_by: [],
      escalate: true,
      escalation_reason: "not covered in handbook",
    });
    const res = await POST(
      makeRequest({ question: "Do you offer summer camp?" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.escalate).toBe(true);
    expect(data.escalation_reason).toContain("model_self_escalated");
  });

  it("returns 500 on LLM failure", async () => {
    vi.mocked(askLLM).mockRejectedValueOnce(new Error("API timeout"));
    const res = await POST(
      makeRequest({ question: "What are the program hours?" }),
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Something went wrong. Please try again.");
  });
});
