// Escalation tests — questions the handbook does NOT cover. The
// model should gracefully decline with confidence: low, escalate:
// true, and a non-empty escalation_reason. These tests assert that
// the trust loop's "when in doubt, ask a human" discipline holds
// across a wide range of plausible parent questions.
//
// A failure here means the model confidently made up an answer to
// a question the handbook doesn't cover. That's the worst possible
// failure mode for a trust-loop product.
//
// Two tests in this file (physical exam, parent-initiated withdrawal)
// are cases I originally miscategorized as accuracy tests — the
// handbook touches the topics but doesn't directly answer the
// question, and Haiku correctly identifies that gap. The model
// choosing to escalate on a partial-coverage topic is the *correct*
// trust-loop behavior, and these tests are the regression guard
// against future "helpful" prompt changes that push the model to
// bluff.

import { describe, it } from "vitest";
import {
  askViaAdapter,
  expectEscalation,
  hasApiKey,
  setupIntegrationTest,
} from "./_helpers";

describe.skipIf(!hasApiKey())(
  "escalation — gaps the handbook does not cover",
  () => {
    setupIntegrationTest();

    // Gaps from the accuracy triage
    it("escalates 'Is there a waitlist?'", async () => {
      const result = await askViaAdapter("Is there a waitlist?");
      await expectEscalation(result, "waitlist");
    });

    it("escalates 'How are fire drills handled?'", async () => {
      const result = await askViaAdapter("How are fire drills handled?");
      await expectEscalation(result, "fire-drills");
    });

    it("escalates 'Do I need a physical exam to enroll my child?'", async () => {
      const result = await askViaAdapter(
        "Do I need a physical exam to enroll my child?",
      );
      await expectEscalation(result, "physical-exam");
    });

    it("escalates 'How do I withdraw my child from the program?'", async () => {
      const result = await askViaAdapter(
        "How do I withdraw my child from the program?",
      );
      await expectEscalation(result, "withdrawal");
    });

    // Prospective families
    it("escalates 'How can I schedule a tour?'", async () => {
      const result = await askViaAdapter("How can I schedule a tour?");
      await expectEscalation(result, "tour");
    });

    it("escalates 'Can I volunteer in my child's classroom?'", async () => {
      const result = await askViaAdapter(
        "Can I volunteer in my child's classroom?",
      );
      await expectEscalation(result, "volunteer");
    });

    // Practical gaps
    it("escalates 'What's the wifi password at the center?'", async () => {
      const result = await askViaAdapter(
        "What's the wifi password at the center?",
      );
      await expectEscalation(result, "wifi");
    });

    it("escalates 'Do you offer summer camp?'", async () => {
      const result = await askViaAdapter("Do you offer summer camp?");
      await expectEscalation(result, "summer-camp");
    });

    it("escalates 'Where can I park when dropping off my child?'", async () => {
      const result = await askViaAdapter(
        "Where can I park when dropping off my child?",
      );
      await expectEscalation(result, "parking");
    });

    it("escalates 'Is there a sibling discount?'", async () => {
      const result = await askViaAdapter("Is there a sibling discount?");
      await expectEscalation(result, "sibling-discount");
    });

    it("escalates 'Do you offer after-school care?'", async () => {
      const result = await askViaAdapter("Do you offer after-school care?");
      await expectEscalation(result, "after-school");
    });

    it("escalates 'Does the program run a bus route?'", async () => {
      const result = await askViaAdapter("Does the program run a bus route?");
      await expectEscalation(result, "bus-route");
    });

    it("escalates 'Can I bring a birthday gift for the teacher?'", async () => {
      const result = await askViaAdapter(
        "Can I bring a birthday gift for the teacher?",
      );
      await expectEscalation(result, "teacher-gift");
    });

    // Staff-level questions outside the family-handbook scope
    it("escalates 'What's the teacher turnover rate?'", async () => {
      const result = await askViaAdapter("What's the teacher turnover rate?");
      await expectEscalation(result, "teacher-turnover");
    });

    it("escalates 'What's the salary of a DCFD head teacher?'", async () => {
      const result = await askViaAdapter(
        "What's the salary of a DCFD head teacher?",
      );
      await expectEscalation(result, "teacher-salary");
    });
  },
);
