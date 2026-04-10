// End-to-end pipeline tests. These cover the orchestration contract:
// channels run in order, the first hold wins, pass means every
// channel agreed. Unit tests for the individual channels live in
// channels.test.ts.

import { describe, expect, it } from "vitest";
import type { AnswerContract } from "../../contract";
import type { GroundingSource } from "../types";
import { runPostResponsePipeline } from "../pipeline";
import { buildStockResponse, parseHoldReason } from "../stock-response";

const ILLNESS: GroundingSource = {
  id: "illness-policy",
  title: "Illness Policy",
  body: "Keep children at home if they have a fever of 100.4 or higher. Fever-free for 24 hours without medication before returning.",
};

const HOURS: GroundingSource = {
  id: "hours-of-operation",
  title: "Hours of Operation",
  body: "The program runs Monday through Friday from 7:00 am to 6:00 pm. Preschool classes meet 6.5 hours per day.",
};

const SOURCES: GroundingSource[] = [ILLNESS, HOURS];

function draft(partial: Partial<AnswerContract> = {}): AnswerContract {
  return {
    answer:
      "We are open Monday through Friday from 7am until 6pm. Preschool classes run for 6.5 hours each day.",
    confidence: "high",
    cited_entries: ["hours-of-operation"],
    directly_addressed_by: ["hours-of-operation"],
    escalate: false,
    escalation_reason: undefined,
    ...partial,
  };
}

describe("runPostResponsePipeline", () => {
  it("passes a clean grounded draft", () => {
    const result = runPostResponsePipeline({
      question: "What are the program hours?",
      draft: draft(),
      allSources: SOURCES,
    });
    expect(result.verdict).toBe("pass");
  });

  it("short-circuits on hallucinated citations before running later channels", () => {
    const result = runPostResponsePipeline({
      question: "What are the program hours?",
      draft: draft({ cited_entries: ["made-up-entry"] }),
      allSources: SOURCES,
    });
    expect(result.verdict).toBe("hold");
    if (result.verdict === "hold") {
      expect(result.reason).toBe("hallucinated_citation");
      expect(result.channel).toBe("hallucination");
    }
  });

  it("holds on model self-escalation even if citations are clean", () => {
    const result = runPostResponsePipeline({
      question: "Is there a waitlist?",
      draft: draft({
        escalate: true,
        escalation_reason: "no coverage for waitlist",
        directly_addressed_by: [],
      }),
      allSources: SOURCES,
    });
    expect(result.verdict).toBe("hold");
    if (result.verdict === "hold") {
      expect(result.reason).toBe("model_self_escalated");
    }
  });

  it("holds when the model returns empty citation lists", () => {
    const result = runPostResponsePipeline({
      question: "Unrelated topic?",
      draft: draft({ cited_entries: [], directly_addressed_by: [] }),
      allSources: SOURCES,
    });
    expect(result.verdict).toBe("hold");
    if (result.verdict === "hold")
      expect(result.reason).toBe("no_direct_coverage");
  });

  it("holds on a medical instruction draft", () => {
    const result = runPostResponsePipeline({
      question: "My child has a fever — can he come in?",
      draft: draft({
        answer:
          "Give your child Tylenol and keep him home for 24 hours before bringing him back.",
        cited_entries: ["illness-policy"],
        directly_addressed_by: ["illness-policy"],
      }),
      allSources: SOURCES,
    });
    expect(result.verdict).toBe("hold");
    if (result.verdict === "hold") {
      // Medical-shape runs before the entity channel so the strongest
      // signal wins. A fabricated-entity or numeric hold would also
      // be structurally correct but the operator gets better context
      // from the medical-instruction reason.
      expect(result.reason).toBe("medical_instruction");
    }
  });
});

describe("stock response helpers", () => {
  it("builds a stock response with the hold-reason encoded in escalation_reason", () => {
    const stock = buildStockResponse("hallucinated_citation");
    expect(stock.escalate).toBe(true);
    expect(stock.confidence).toBe("low");
    expect(stock.cited_entries).toEqual([]);
    expect(stock.directly_addressed_by).toEqual([]);
    expect(stock.escalation_reason).toBe(
      "held_for_review:hallucinated_citation",
    );
    expect(stock.answer).toContain("staff member");
  });

  it("does not include a phone number or contact fallback", () => {
    const stock = buildStockResponse("medical_instruction");
    expect(stock.answer).not.toMatch(/\d{3}-\d{3}-\d{4}/);
    expect(stock.answer).not.toMatch(/call/i);
  });

  it("parses the held_for_review: prefix back out of an escalation_reason", () => {
    expect(parseHoldReason("held_for_review:lexical_unsupported")).toBe(
      "lexical_unsupported",
    );
    expect(parseHoldReason("sensitive_topic")).toBeNull();
    expect(parseHoldReason(undefined)).toBeNull();
  });
});
