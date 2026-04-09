// Unit tests for askLLM. We inject a fake Anthropic client via the
// test hook so these are pure unit tests — no real network, no API
// key required, no real model calls.

import { afterEach, describe, expect, it } from "vitest";
import {
  __resetClientForTests,
  __setClientForTests,
  askLLM,
} from "../client";
import { PARSE_FAILURE_RESULT } from "../contract";
import { AppIntent, MCPData, SystemPrompt, UserInput } from "../types";

const SYSTEM = SystemPrompt("You are the test system prompt.");
const INTENT = AppIntent("answer_parent_question");
const DATA = MCPData({ handbook_entries: [] });
const USER = UserInput("What time do you open?");

interface FakeMessagesCreate {
  (args: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>;
}

function makeFake(handler: FakeMessagesCreate) {
  return { messages: { create: handler } };
}

afterEach(() => {
  __resetClientForTests();
});

describe("askLLM", () => {
  it("returns the parsed contract when the model returns valid JSON", async () => {
    __setClientForTests(
      makeFake(async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              answer: "We open at 7am.",
              confidence: "high",
              cited_entries: ["hours-of-operation"],
              escalate: false,
            }),
          },
        ],
      })),
    );

    const result = await askLLM(SYSTEM, INTENT, DATA, USER);
    expect(result.answer).toBe("We open at 7am.");
    expect(result.confidence).toBe("high");
    expect(result.cited_entries).toEqual(["hours-of-operation"]);
    expect(result.escalate).toBe(false);
  });

  it("unwraps a ```json-fenced response", async () => {
    __setClientForTests(
      makeFake(async () => ({
        content: [
          {
            type: "text",
            text:
              "```json\n" +
              JSON.stringify({
                answer: "We open at 7am.",
                confidence: "high",
                cited_entries: ["hours-of-operation"],
                escalate: false,
              }) +
              "\n```",
          },
        ],
      })),
    );

    const result = await askLLM(SYSTEM, INTENT, DATA, USER);
    expect(result.answer).toBe("We open at 7am.");
  });

  it("returns PARSE_FAILURE_RESULT on invalid JSON", async () => {
    __setClientForTests(
      makeFake(async () => ({
        content: [{ type: "text", text: "Sorry, I can't answer that." }],
      })),
    );

    const result = await askLLM(SYSTEM, INTENT, DATA, USER);
    expect(result).toEqual(PARSE_FAILURE_RESULT);
  });

  it("returns PARSE_FAILURE_RESULT on JSON that fails the schema", async () => {
    __setClientForTests(
      makeFake(async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              // Missing required `confidence` field, wrong enum for escalate.
              answer: "ok",
              escalate: "maybe",
            }),
          },
        ],
      })),
    );

    const result = await askLLM(SYSTEM, INTENT, DATA, USER);
    expect(result).toEqual(PARSE_FAILURE_RESULT);
  });

  it("ignores non-text content blocks when extracting the response", async () => {
    __setClientForTests(
      makeFake(async () => ({
        content: [
          // A thinking block shouldn't be mistaken for an answer.
          { type: "thinking" },
          {
            type: "text",
            text: JSON.stringify({
              answer: "We open at 7am.",
              confidence: "high",
              cited_entries: [],
              escalate: false,
            }),
          },
        ],
      })),
    );

    const result = await askLLM(SYSTEM, INTENT, DATA, USER);
    expect(result.answer).toBe("We open at 7am.");
  });
});
