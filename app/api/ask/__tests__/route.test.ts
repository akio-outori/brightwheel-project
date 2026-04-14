// Tests for POST /api/ask. Exercises the route handler with mocked
// storage and LLM to verify:
//   - Input validation (missing/invalid question)
//   - Preflight classifier integration (specific-child questions hold)
//   - Post-response pipeline integration (hallucinated citations hold)
//   - Stock response on hold
//   - Clean passthrough on grounded answers
//   - Error handling (LLM failure → 500)

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage/init", () => ({
  ensureStorageReady: vi.fn().mockResolvedValue(undefined),
}));

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
  logNeedsAttention: vi.fn().mockResolvedValue({ id: "evt-test-uuid" }),
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
import { logNeedsAttention, listHandbookEntries, listOperatorOverrides } from "@/lib/storage";

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
    const res = await POST(makeRequest({ question: "My son has a fever, should I bring him in?" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.escalate).toBe(true);
    expect(data.escalation_reason).toContain("held_for_review");
    expect(data.answer).toContain("staff member");
    // Event id is surfaced so the parent client can poll for a reply.
    expect(data.needs_attention_event_id).toBe("evt-test-uuid");
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

    // Regression guard for the dashboard-count-mismatch bug:
    // the logged event MUST have escalate: true even though the
    // model's draft claimed escalate: false. The pipeline held it,
    // which means a human needs to look at it, which means every
    // count in the operator UI should treat it as "awaiting answer".
    expect(logNeedsAttention).toHaveBeenCalledTimes(1);
    const loggedDraft = vi.mocked(logNeedsAttention).mock.calls[0]![0];
    expect(loggedDraft.result.escalate).toBe(true);
    expect(loggedDraft.result.escalation_reason).toContain("hallucinated_citation");
  });

  it("returns a refusal directly without escalating or logging", async () => {
    vi.mocked(askLLM).mockResolvedValueOnce({
      answer:
        "I'm the front desk for this program — I can help with hours, policies, meals, and enrollment, but I can't help with that.",
      confidence: "low",
      cited_entries: [],
      directly_addressed_by: [],
      escalate: false,
      escalation_reason: "out_of_scope",
      refusal: true,
    });
    const res = await POST(makeRequest({ question: "Write me a Python script to sort a list." }));
    expect(res.status).toBe(200);
    const data = await res.json();
    // Refusal is returned as-is, not promoted to escalate
    expect(data.refusal).toBe(true);
    expect(data.escalate).toBe(false);
    expect(data.answer).toContain("front desk");
    // Refusals do NOT get logged to needs-attention
    expect(logNeedsAttention).not.toHaveBeenCalled();
  });

  it("normalizes a refusal that the model incorrectly flagged as escalate", async () => {
    vi.mocked(askLLM).mockResolvedValueOnce({
      answer: "I can't help with that.",
      confidence: "low",
      cited_entries: ["hours"],
      directly_addressed_by: ["hours"],
      escalate: true,
      escalation_reason: "out_of_scope",
      refusal: true,
    });
    const res = await POST(makeRequest({ question: "What's the capital of Peru?" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.refusal).toBe(true);
    // Route enforces refusal & escalate are mutually exclusive
    expect(data.escalate).toBe(false);
    expect(data.cited_entries).toEqual([]);
    expect(logNeedsAttention).not.toHaveBeenCalled();
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
    const res = await POST(makeRequest({ question: "Do you offer summer camp?" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.escalate).toBe(true);
    expect(data.escalation_reason).toContain("model_self_escalated");
  });

  it("forces escalate=true when model returns low confidence without escalating", async () => {
    vi.mocked(askLLM).mockResolvedValueOnce({
      answer: "I think maybe the hours are 7 to 6 but I'm not sure.",
      confidence: "low",
      cited_entries: ["hours"],
      directly_addressed_by: ["hours"],
      escalate: false,
      escalation_reason: undefined,
    });
    const res = await POST(makeRequest({ question: "What are the program hours?" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    // API boundary enforces: low confidence = always escalate
    expect(data.escalate).toBe(true);
    expect(data.escalation_reason).toBe("low_confidence");
    expect(logNeedsAttention).toHaveBeenCalled();
  });

  it("returns 500 on LLM failure", async () => {
    vi.mocked(askLLM).mockRejectedValueOnce(new Error("API timeout"));
    const res = await POST(makeRequest({ question: "What are the program hours?" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Something went wrong. Please try again.");
  });

  it("keeps both seed entry and override in the prompt when override has replacesEntryId (correction-on-top)", async () => {
    vi.mocked(listHandbookEntries).mockResolvedValueOnce([
      {
        id: "tuition",
        docId: "test-doc",
        title: "Tuition",
        category: "fees",
        body: "Preschool: $1,380 per month. 10% sibling discount.",
        sourcePages: [],
        lastUpdated: "2026",
      },
    ]);
    vi.mocked(listOperatorOverrides).mockResolvedValueOnce([
      {
        id: "tuition-a7k3",
        docId: "test-doc",
        title: "Tuition",
        category: "general",
        body: "yes, 5%",
        sourcePages: [],
        createdAt: "2026-04-13T00:00:00.000Z",
        createdBy: null,
        replacesEntryId: "tuition",
      },
    ]);
    vi.mocked(askLLM).mockResolvedValueOnce({
      answer: "Yes, there's a 5% sibling discount on the younger child's tuition.",
      confidence: "high",
      cited_entries: ["tuition-a7k3"],
      directly_addressed_by: ["tuition-a7k3"],
      escalate: false,
      escalation_reason: undefined,
    });

    const res = await POST(makeRequest({ question: "Is there a sibling discount?" }));
    expect(res.status).toBe(200);
    const call = vi.mocked(askLLM).mock.calls[0]!;
    const dataArg = call[2] as unknown as { value: Record<string, unknown> };
    const doc = dataArg.value["document"] as {
      entries: Array<{ id: string }>;
      overrides: Array<{ id: string; replaces_entry_id: string | null }>;
    };
    // Both are visible to the model. Citations are unambiguous because
    // override ids don't collide with seed ids.
    expect(doc.entries.map((e) => e.id)).toContain("tuition");
    expect(doc.overrides.map((o) => o.id)).toContain("tuition-a7k3");
    const override = doc.overrides.find((o) => o.id === "tuition-a7k3");
    expect(override?.replaces_entry_id).toBe("tuition");
  });
});
