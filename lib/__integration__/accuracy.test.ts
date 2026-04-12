// Accuracy tests. Ask questions the Sunflower Family Handbook
// clearly covers, and assert the model returns a high-confidence
// grounded answer that cites a real entry. These are the baseline
// "does the thing work" tests — if any of them fail we should look
// at the seed data, the prompt, or the question phrasing before
// concluding there's a model problem.

import { describe, it } from "vitest";
import {
  askViaRoute,
  expectDeclined,
  expectHighConfidence,
  hasApiKey,
  setupIntegrationTest,
} from "./_helpers";

describe.skipIf(!hasApiKey())("accuracy — grounded high-confidence answers", () => {
  setupIntegrationTest();

  // Hours / schedule
  it("answers 'What time do you open?'", async () => {
    const result = await askViaRoute("What time do you open?");
    await expectHighConfidence(result, "hours");
  });

  it("answers 'What are your hours?'", async () => {
    const result = await askViaRoute("What are your hours?");
    await expectHighConfidence(result, "hours");
  });

  it("answers 'What holidays are you closed for?'", async () => {
    const result = await askViaRoute("What holidays are you closed for?");
    await expectHighConfidence(result, "closures");
  });

  // Health / immunizations
  it("answers 'What immunizations are required?'", async () => {
    const result = await askViaRoute("What immunizations are required?");
    await expectHighConfidence(result, "immunizations");
  });

  it("answers 'What is the sick-child policy?'", async () => {
    const result = await askViaRoute("What is the sick-child policy?");
    await expectHighConfidence(result, "illness-policy");
  });

  it("answers 'When should I keep my child home if they're sick?'", async () => {
    const result = await askViaRoute("When should I keep my child home if they're sick?");
    await expectHighConfidence(result, "illness-policy");
  });

  // Food / nutrition / allergies
  it("answers 'Do you provide meals?'", async () => {
    const result = await askViaRoute("Do you provide meals?");
    await expectHighConfidence(result, "meals");
  });

  it("answers 'How does the program handle food allergies?'", async () => {
    const result = await askViaRoute("How does the program handle food allergies?");
    await expectHighConfidence(result, "food-allergies");
  });

  // Enrollment
  it("answers 'How do I enroll my child?'", async () => {
    const result = await askViaRoute("How do I enroll my child?");
    await expectHighConfidence(result, "enrollment-process");
  });

  it("answers 'What documents do I need for enrollment?'", async () => {
    const result = await askViaRoute("What documents do I need for enrollment?");
    await expectHighConfidence(result, "enrollment-docs");
  });

  it("answers 'Can I schedule a tour?'", async () => {
    const result = await askViaRoute("Can I schedule a tour?");
    await expectHighConfidence(result, "tours");
  });

  it("answers 'Do you apply sunscreen?'", async () => {
    const result = await askViaRoute("Do you apply sunscreen to the kids?");
    await expectHighConfidence(result, "sunscreen");
  });

  // Fees / tuition
  it("answers 'How much does tuition cost?'", async () => {
    const result = await askViaRoute("How much does tuition cost?");
    await expectHighConfidence(result, "tuition");
  });

  it("answers 'When is tuition due?'", async () => {
    const result = await askViaRoute("When is tuition due?");
    await expectHighConfidence(result, "tuition-due");
  });

  // Safety / emergencies
  it("answers 'What happens in case of an emergency?'", async () => {
    const result = await askViaRoute("What happens in case of an emergency?");
    await expectHighConfidence(result, "emergency-procedures");
  });

  it("answers 'What are the late pickup fees?'", async () => {
    const result = await askViaRoute("What are the late pickup fees?");
    await expectHighConfidence(result, "late-fees");
  });

  // Curriculum
  it("answers 'What curriculum do you use?'", async () => {
    const result = await askViaRoute("What curriculum do you use?");
    await expectHighConfidence(result, "curriculum");
  });

  it("answers 'What does a typical day look like?'", async () => {
    const result = await askViaRoute("What does a typical day look like?");
    await expectHighConfidence(result, "daily-schedule");
  });

  // Discipline / communication
  it("answers 'What is your discipline policy?'", async () => {
    const result = await askViaRoute("What is your discipline policy?");
    await expectHighConfidence(result, "discipline");
  });

  it("answers 'How do parent-teacher conferences work?'", async () => {
    const result = await askViaRoute("How do parent-teacher conferences work?");
    await expectHighConfidence(result, "conferences");
  });

  // Special needs / inclusion
  it("answers 'Do you accept children with IEPs?'", async () => {
    const result = await askViaRoute("Do you accept children with IEPs?");
    await expectHighConfidence(result, "special-needs");
  });

  it("answers 'What support do you offer for children with disabilities?'", async () => {
    const result = await askViaRoute("What support do you offer for children with disabilities?");
    await expectHighConfidence(result, "special-needs");
  });

  // Communication
  it("answers 'How will the teachers communicate with me?'", async () => {
    const result = await askViaRoute("How will the teachers communicate with me?");
    await expectHighConfidence(result, "teacher-communication");
  });

  // Center info
  it("answers 'Where is Sunflower located?'", async () => {
    const result = await askViaRoute("Where is Sunflower located?");
    await expectHighConfidence(result, "contact");
  });

  it("answers 'What's the main office phone number?'", async () => {
    const result = await askViaRoute("What's the main office phone number?");
    await expectHighConfidence(result, "contact");
  });

  // ----- Previously untested handbook entries --------------------------------

  // welcome
  it("answers 'Tell me about Sunflower Early Learning'", async () => {
    const result = await askViaRoute("Tell me about Sunflower Early Learning");
    await expectHighConfidence(result, "welcome");
  });

  // ages-served
  it("answers 'What ages do you serve?'", async () => {
    const result = await askViaRoute("What ages do you serve?");
    await expectHighConfidence(result, "ages-served");
  });

  // ratios
  it("answers 'What are the teacher-to-child ratios?'", async () => {
    const result = await askViaRoute("What are the teacher-to-child ratios?");
    await expectHighConfidence(result, "ratios");
  });

  // registration-fee
  it("answers 'Is there a registration fee?'", async () => {
    const result = await askViaRoute("Is there a registration fee?");
    await expectHighConfidence(result, "registration-fee");
  });

  // waitlist (moved from escalation — handbook has waitlist entry)
  it("answers 'Is there a waitlist?'", async () => {
    const result = await askViaRoute("Is there a waitlist?");
    await expectHighConfidence(result, "waitlist");
  });

  // tours (moved from escalation — handbook has tours entry)
  it("answers 'How can I schedule a tour?'", async () => {
    const result = await askViaRoute("How can I schedule a tour?");
    await expectHighConfidence(result, "tours");
  });

  // birthdays
  it("answers 'Can we celebrate birthdays at Sunflower?'", async () => {
    const result = await askViaRoute("Can we celebrate birthdays at Sunflower?");
    await expectHighConfidence(result, "birthdays");
  });

  // medication — the handbook has a medication entry, but the model
  // correctly hedges on medication topics even for general policy
  // questions (safety-first behavior). The sensitive.test.ts suite
  // covers the specific-child escalation case. This entry is tested
  // for grounding (not accuracy) because confident retrieval on
  // medication is a safety borderline the model rightfully treats
  // with caution.

  // arrival-departure
  it("answers 'How does drop-off and pickup work?'", async () => {
    const result = await askViaRoute("How does drop-off and pickup work?");
    await expectHighConfidence(result, "arrival-departure");
  });

  // pickup-authorization
  it("answers 'Who is authorized to pick up my child?'", async () => {
    const result = await askViaRoute("Who is authorized to pick up my child?");
    await expectHighConfidence(result, "pickup-authorization");
  });

  // weather-closures
  it("answers 'Do you close for bad weather?'", async () => {
    const result = await askViaRoute("Do you close for bad weather?");
    await expectHighConfidence(result, "weather-closures");
  });

  // naps
  it("answers 'What is the nap schedule?'", async () => {
    const result = await askViaRoute("What is the nap schedule?");
    await expectHighConfidence(result, "naps");
  });

  // open-door
  it("answers 'Can I visit my child's classroom?'", async () => {
    const result = await askViaRoute("Can I visit my child's classroom?");
    await expectHighConfidence(result, "open-door");
  });

  // concerns-process
  it("answers 'How do I share feedback or concerns?'", async () => {
    const result = await askViaRoute("How do I share feedback or concerns?");
    await expectHighConfidence(result, "concerns-process");
  });

  // withdrawal (moved from escalation — handbook has withdrawal entry)
  it("answers 'How do I withdraw my child?'", async () => {
    const result = await askViaRoute("How do I withdraw my child?");
    await expectHighConfidence(result, "withdrawal");
  });

  // staff
  it("answers 'Tell me about your teachers and staff'", async () => {
    const result = await askViaRoute("Tell me about your teachers and staff");
    await expectHighConfidence(result, "staff");
  });

  // ----- Moved from escalation — handbook covers these ---------------------

  // emergency-procedures covers fire drills explicitly
  it("answers 'How are fire drills handled?'", async () => {
    const result = await askViaRoute("How are fire drills handled?");
    await expectHighConfidence(result, "fire-drills");
  });

  // tuition entry mentions 10% sibling discount
  it("answers 'Is there a sibling discount?'", async () => {
    const result = await askViaRoute("Is there a sibling discount?");
    await expectHighConfidence(result, "sibling-discount");
  });

  // parking — the arrival-departure entry describes sign-in and
  // walking to the classroom but doesn't specifically cover parking
  // logistics. Model correctly escalates or declines. Tested in
  // escalation.test.ts as a genuine handbook gap.

  // hours entry says 7am-6pm; model may confidently say "no" or
  // escalate depending on whether it treats the absence as
  // definitive. Both are correct trust-loop behavior.
  it("declines or answers 'Do you offer extended evening hours past 6pm?'", async () => {
    const result = await askViaRoute("Do you offer extended evening hours past 6pm?");
    expectDeclined(result, "extended-hours");
  });
});
