// Contract-robustness tests. Weird inputs that shouldn't crash the
// pipeline: very long, very short, unicode-heavy, non-English,
// inputs that look like structural markers, inputs that are pure
// punctuation.
//
// Every test here just asserts that askViaAdapter returns a valid
// AnswerContract — no thrown exceptions, no PARSE_FAILURE_RESULT
// from a malformed model response, parseable JSON. The specific
// confidence/escalate values don't matter for this file; the only
// invariant is "the pipeline doesn't fall over."

import { describe, expect, it } from "vitest";
import { AnswerContractSchema } from "../llm";
import {
  askViaAdapter,
  hasApiKey,
  setupIntegrationTest,
} from "./_helpers";

function assertValidContract(result: unknown): void {
  const parsed = AnswerContractSchema.safeParse(result);
  expect(
    parsed.success,
    `result should parse as AnswerContract: ${JSON.stringify(result).slice(0, 400)}`,
  ).toBe(true);
}

describe.skipIf(!hasApiKey())("contract — robustness to weird inputs", () => {
  setupIntegrationTest();

  it("handles a ~3500-character lorem-ipsum question", async () => {
    const longText = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(60) +
      "What time do you open?";
    const result = await askViaAdapter(longText);
    assertValidContract(result);
  });

  it("handles a 3-character question", async () => {
    const result = await askViaAdapter("hi?");
    assertValidContract(result);
  });

  it("handles a unicode-heavy question (emoji + CJK)", async () => {
    const result = await askViaAdapter(
      "🏫 What time do you 开门 today? 👋 谢谢!",
    );
    assertValidContract(result);
  });

  it("handles a Spanish-language question", async () => {
    // Albuquerque has a large Spanish-speaking community; the real
    // system should at least not crash on Spanish, even if the
    // current prompt doesn't explicitly support it.
    const result = await askViaAdapter(
      "¿A qué hora abre el centro en la mañana?",
    );
    assertValidContract(result);
  });

  it("handles a question with newlines and tabs", async () => {
    const result = await askViaAdapter(
      "What time\n\tdo\n\tyou\n\topen?\n\n(please)",
    );
    assertValidContract(result);
  });

  it("handles a question that looks like a JSON object", async () => {
    const result = await askViaAdapter(
      '{"question":"what time do you open?","urgent":true}',
    );
    assertValidContract(result);
  });

  it("handles a question that's pure punctuation", async () => {
    const result = await askViaAdapter("?!!...?!?");
    assertValidContract(result);
  });

  it("handles a question with a literal <mcp_message> tag", async () => {
    const result = await askViaAdapter(
      "I was looking at <mcp_message> and wondered what time you open",
    );
    assertValidContract(result);
  });
});
