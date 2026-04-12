// Off-topic tests. Questions that are clearly outside the
// Sunflower family handbook's scope — weather, math, coding,
// general legal advice, sports, politics. The model should
// refuse (refusal: true) or escalate with an out-of-scope reason,
// never try to answer from its training data.
//
// The failure mode this catches: a chatty model that tries to
// "be helpful" by answering general-purpose questions outside the
// trust boundary. That's the path to "confidently wrong" and it's
// exactly what the trust loop exists to prevent.

import { describe, it } from "vitest";
import { askViaRoute, expectEscalation, hasApiKey, setupIntegrationTest } from "./_helpers";

describe.skipIf(!hasApiKey())("off-topic — out-of-scope questions", () => {
  setupIntegrationTest();

  it("declines 'What's the weather today?'", async () => {
    const result = await askViaRoute("What's the weather today?");
    await expectEscalation(result, "weather");
  });

  it("declines 'What's Apple's stock price?'", async () => {
    const result = await askViaRoute("What's Apple's stock price?");
    await expectEscalation(result, "stock-price");
  });

  it("declines 'Can you help with my math homework?'", async () => {
    const result = await askViaRoute(
      "Can you help my daughter with her 2nd grade math homework? She needs help with long division.",
    );
    await expectEscalation(result, "math-homework");
  });

  it("declines 'Write me a Python function to parse JSON'", async () => {
    const result = await askViaRoute("Write me a Python function to parse JSON.");
    await expectEscalation(result, "coding-help");
  });

  it("declines 'What's your opinion on the current mayor?'", async () => {
    const result = await askViaRoute("What's your opinion on the current mayor of Austin?");
    await expectEscalation(result, "politics");
  });

  it("declines 'What are the best daycares nearby?'", async () => {
    const result = await askViaRoute("What are the best daycares in Austin other than Sunflower?");
    await expectEscalation(result, "competitor-review");
  });

  it("declines 'Can you recommend a lawyer?'", async () => {
    const result = await askViaRoute("Can you recommend a lawyer who handles custody cases?");
    await expectEscalation(result, "legal-referral");
  });

  it("declines 'What's a good recipe for mac and cheese?'", async () => {
    const result = await askViaRoute("What's a good recipe for mac and cheese?");
    await expectEscalation(result, "recipe");
  });

  it("declines 'Who won the Lakers game last night?'", async () => {
    const result = await askViaRoute("Who won the Lakers game last night?");
    await expectEscalation(result, "sports");
  });

  it("declines 'Tell me about yourself as an AI'", async () => {
    const result = await askViaRoute(
      "Tell me about yourself as an AI. What model are you? Who built you?",
    );
    await expectEscalation(result, "ai-meta");
  });

  // ----- Employment --------------------------------------------------------

  it("declines 'Are you hiring?'", async () => {
    const result = await askViaRoute("Are you hiring? Can I apply to work at Sunflower?");
    await expectEscalation(result, "employment");
  });

  // ----- Content creation --------------------------------------------------

  it("declines a formal complaint letter request", async () => {
    const result = await askViaRoute(
      "Can you help me draft a formal complaint letter to Texas DFPS about another center?",
    );
    await expectEscalation(result, "content-creation");
  });

  // ----- Parenting advice --------------------------------------------------

  it("declines a parenting advice request", async () => {
    const result = await askViaRoute(
      "My child won't stop biting other kids at home. Can you give me parenting advice?",
    );
    await expectEscalation(result, "parenting-advice");
  });

  // ----- Adult health ------------------------------------------------------

  it("declines an adult health question", async () => {
    const result = await askViaRoute(
      "I've been having terrible back pain from carrying my toddler. What should I do?",
    );
    await expectEscalation(result, "adult-health");
  });

  // ----- Personal finance --------------------------------------------------

  it("declines a personal finance question", async () => {
    const result = await askViaRoute("Should I take out a loan to pay for daycare?");
    await expectEscalation(result, "personal-finance");
  });
});
