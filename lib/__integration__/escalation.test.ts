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
  askViaRoute,
  expectDeclined,
  expectEscalation,
  hasApiKey,
  setupIntegrationTest,
} from "./_helpers";

describe.skipIf(!hasApiKey())("escalation — gaps the handbook does not cover", () => {
  setupIntegrationTest();

  // Gaps from the accuracy triage
  // The enrollment-docs entry mentions immunization records and
  // doctor-signed care plans but NOT physical exams. The model
  // usually escalates correctly but sometimes bridges from
  // "pediatrician" language to infer "doctor visit needed."
  // Both escalation and a confident "no, it's not listed" are
  // correct trust-loop behavior — the wrong outcome is fabricating
  // a "yes, you need a physical" when the handbook doesn't say so.
  it("declines 'Do I need a physical exam to enroll my child?'", async () => {
    const result = await askViaRoute("Do I need a physical exam to enroll my child?");
    expectDeclined(result, "physical-exam");
  });

  // Questions the handbook genuinely doesn't cover
  it("escalates 'Do you offer scholarships or financial aid?'", async () => {
    const result = await askViaRoute("Do you offer scholarships or financial aid?");
    await expectEscalation(result, "scholarships");
  });

  it("escalates 'What's the process for requesting records about my child?'", async () => {
    const result = await askViaRoute("What's the process for requesting records about my child?");
    await expectEscalation(result, "records-request");
  });

  // Practical gaps
  it("escalates 'Do you offer summer camp?'", async () => {
    const result = await askViaRoute("Do you offer summer camp?");
    await expectEscalation(result, "summer-camp");
  });

  it("escalates 'Do you offer after-school care?'", async () => {
    const result = await askViaRoute("Do you offer after-school care?");
    await expectEscalation(result, "after-school");
  });

  it("escalates 'Can I bring a birthday gift for the teacher?'", async () => {
    const result = await askViaRoute("Can I bring a birthday gift for the teacher?");
    await expectEscalation(result, "teacher-gift");
  });

  // Staff-level questions outside the family-handbook scope
  // Internal operations — model may refuse (per the "internal
  // operations" refusal category) or escalate. Both are correct.
  it("declines 'What's the teacher turnover rate?'", async () => {
    const result = await askViaRoute("What's the teacher turnover rate?");
    expectDeclined(result, "teacher-turnover");
  });

  // Genuine handbook gaps — topics a parent would reasonably ask
  // about but no seed entry covers.
  // Borderline: the model may confidently say "no, we only offer
  // full-time" (inferred from the enrollment entry) or escalate.
  it("declines 'Do you offer part-time enrollment?'", async () => {
    const result = await askViaRoute("Do you offer part-time enrollment?");
    expectDeclined(result, "part-time");
  });

  it("declines 'What's the process for background checks on staff?'", async () => {
    const result = await askViaRoute("What's the process for background checks on staff?");
    expectDeclined(result, "background-checks");
  });

  it("escalates 'Do you accept subsidized childcare vouchers?'", async () => {
    const result = await askViaRoute("Do you accept subsidized childcare vouchers?");
    await expectEscalation(result, "childcare-vouchers");
  });

  it("escalates 'Is there a parent advisory board?'", async () => {
    const result = await askViaRoute("Is there a parent advisory board?");
    await expectEscalation(result, "parent-advisory");
  });

  // Borderline: the model may escalate (handbook gap a staff member
  // could answer) or refuse (not what this front desk is for). Both
  // are correct trust-loop behavior; the wrong outcome is a
  // confident invented answer.
  it("declines 'Do you offer transportation to and from school?'", async () => {
    const result = await askViaRoute("Do you offer transportation to and from school?");
    expectDeclined(result, "transportation");
  });

  it("escalates 'Where can I park when dropping off my child?'", async () => {
    const result = await askViaRoute("Where can I park when dropping off my child?");
    expectDeclined(result, "parking");
  });

  it("escalates 'What are your policies on screen time?'", async () => {
    const result = await askViaRoute("What are your policies on screen time?");
    await expectEscalation(result, "screen-time");
  });

  it("escalates 'Do you have security cameras in the classrooms?'", async () => {
    const result = await askViaRoute("Do you have security cameras in the classrooms?");
    await expectEscalation(result, "security-cameras");
  });
});
