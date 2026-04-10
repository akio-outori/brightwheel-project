// Accuracy tests. Ask questions the DCFD Family Handbook clearly
// covers, and assert the model returns a high-confidence grounded
// answer that cites a real entry. These are the baseline "does the
// thing work" tests — if any of them fail on Haiku we should look at
// the seed data, the prompt, or the question phrasing before
// concluding there's a model problem.

import { describe, it } from "vitest";
import {
  askViaRoute,
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

  it("answers 'What are the program hours?'", async () => {
    const result = await askViaRoute("What are the program hours?");
    await expectHighConfidence(result, "hours");
  });

  it("answers 'When does the Early Head Start program run?'", async () => {
    const result = await askViaRoute(
      "When does the Early Head Start program run?",
    );
    await expectHighConfidence(result, "ehs-hours");
  });

  // Health / immunizations
  it("answers 'What immunizations are required?'", async () => {
    const result = await askViaRoute("What immunizations are required?");
    await expectHighConfidence(result, "immunizations");
  });

  it("answers 'What is the sick-child exclusion policy?'", async () => {
    const result = await askViaRoute(
      "What is the sick-child exclusion policy?",
    );
    await expectHighConfidence(result, "illness-policy-specific");
  });

  it("answers 'When should I keep my child home if they're sick?'", async () => {
    const result = await askViaRoute(
      "When should I keep my child home if they're sick?",
    );
    await expectHighConfidence(result, "illness-exclusion");
  });

  // Food / nutrition / allergies
  it("answers 'Do you provide meals?'", async () => {
    const result = await askViaRoute("Do you provide meals?");
    await expectHighConfidence(result, "meals");
  });

  it("answers 'How does the program handle food allergies?'", async () => {
    const result = await askViaRoute(
      "How does the program handle food allergies?",
    );
    await expectHighConfidence(result, "food-allergies");
  });

  // Enrollment
  it("answers 'How do I enroll my child?'", async () => {
    const result = await askViaRoute("How do I enroll my child?");
    await expectHighConfidence(result, "enrollment-process");
  });

  it("answers 'What documents do I need for enrollment?'", async () => {
    const result = await askViaRoute(
      "What documents do I need for enrollment?",
    );
    await expectHighConfidence(result, "enrollment-docs");
  });

  it("answers 'Can I give my child sunscreen at the center?'", async () => {
    const result = await askViaRoute(
      "Can I give my child sunscreen at the center?",
    );
    await expectHighConfidence(result, "sunscreen-policy");
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
    const result = await askViaRoute(
      "What happens in case of an emergency?",
    );
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
    const result = await askViaRoute(
      "How do parent-teacher conferences work?",
    );
    await expectHighConfidence(result, "conferences");
  });

  // Special needs / inclusion
  it("answers 'Do you accept children with IEPs?'", async () => {
    const result = await askViaRoute("Do you accept children with IEPs?");
    await expectHighConfidence(result, "iep-inclusion");
  });

  it("answers 'What support do you offer for children with disabilities?'", async () => {
    const result = await askViaRoute(
      "What support do you offer for children with disabilities?",
    );
    await expectHighConfidence(result, "disability-support");
  });

  // Operations / withdrawal
  it("answers 'What happens if we don't pay tuition?'", async () => {
    const result = await askViaRoute(
      "What happens if we don't pay tuition?",
    );
    await expectHighConfidence(result, "non-payment-consequences");
  });

  // Communication
  it("answers 'How will the teachers communicate with me?'", async () => {
    const result = await askViaRoute(
      "How will the teachers communicate with me?",
    );
    await expectHighConfidence(result, "teacher-communication");
  });

  // Center info
  it("answers 'Where are your centers located?'", async () => {
    const result = await askViaRoute("Where are your centers located?");
    await expectHighConfidence(result, "center-locations");
  });

  it("answers 'What's the main DCFD office phone number?'", async () => {
    const result = await askViaRoute(
      "What's the main DCFD office phone number?",
    );
    await expectHighConfidence(result, "main-office-phone");
  });
});
