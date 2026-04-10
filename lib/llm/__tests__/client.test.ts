// Unit tests for askLLM. We inject a fake Anthropic client via the
// test hook so these are pure unit tests — no real network, no API
// key required, no real model calls.

import { afterEach, describe, expect, it } from "vitest";
import { __resetClientForTests, __setClientForTests, askLLM } from "../client";
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

  it("propagates SDK exceptions (network errors, 429s, auth failures)", async () => {
    // A network error at the SDK layer must propagate so the route
    // handler's catch can translate it. Swallowing it here would
    // hide operational problems from logs.
    __setClientForTests(
      makeFake(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await expect(askLLM(SYSTEM, INTENT, DATA, USER)).rejects.toThrow("ECONNREFUSED");
  });

  it("passes the built prompt through to messages.create verbatim", async () => {
    // Regression guard: if someone swapped the system prompt or the
    // envelope construction for a hardcoded string, the happy-path
    // tests above would still pass. This test captures the args
    // messages.create was actually called with and asserts the
    // structure matches what buildPrompt produced.
    let capturedArgs: unknown = null;
    __setClientForTests(
      makeFake(async (args: unknown) => {
        capturedArgs = args;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                answer: "ok",
                confidence: "high",
                cited_entries: [],
                escalate: false,
              }),
            },
          ],
        };
      }),
    );

    const customData = MCPData({
      center_name: "Test Center",
      handbook_entries: [{ id: "e1", title: "T", body: "B" }],
    });
    await askLLM(
      SystemPrompt("custom system prompt"),
      AppIntent("custom intent"),
      customData,
      UserInput("original question"),
    );

    const args = capturedArgs as {
      system: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(args.system).toBe("custom system prompt");
    expect(args.messages).toHaveLength(1);
    expect(args.messages[0]!.role).toBe("user");
    expect(args.messages[0]!.content).toMatch(/^<mcp_message>.*<\/mcp_message>$/);

    // Parse the envelope and verify all four inputs made it through.
    const body = args.messages[0]!.content.replace(/^<mcp_message>/, "").replace(
      /<\/mcp_message>$/,
      "",
    );
    const envelope = JSON.parse(body);
    expect(envelope.intent).toBe("custom intent");
    expect(envelope.user_query).toBe("original question");
    expect(envelope.data.center_name).toBe("Test Center");
    expect(envelope.data.handbook_entries).toHaveLength(1);
  });
});
