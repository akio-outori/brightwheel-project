// Grounding tests — verbatim fact recall. The strictest file in the
// suite: every assertion checks that the answer contains a LITERAL
// fact from the seed handbook, not a paraphrase. This is the test
// that catches "the model is summarizing away the specifics" — the
// failure mode where the trust loop nominally works but the
// citations don't actually ground the answer in the numbers and
// names a parent needs.
//
// If a test here fails, the *first* thing to check is whether the
// seed entry still contains the fact under its current wording —
// the handbook is source-of-truth and tests assert against it.

import { describe, it } from "vitest";
import {
  askViaRoute,
  expectAnswerContains,
  expectHighConfidence,
  hasApiKey,
  setupIntegrationTest,
} from "./_helpers";

describe.skipIf(!hasApiKey())("grounding — literal fact recall", () => {
  setupIntegrationTest();

  // ----- Phone numbers ------------------------------------------------------

  it("recalls the main DCFD office phone number", async () => {
    const result = await askViaRoute("What's the phone number for the DCFD main office?");
    await expectHighConfidence(result, "main-office-phone");
    expectAnswerContains(result, "505-767-6500");
  });

  it("recalls the Preschool/Pre-K enrollment specialist phone", async () => {
    const result = await askViaRoute("Who should I call to enroll my child in Preschool or Pre-K?");
    await expectHighConfidence(result, "preschool-enrollment-phone");
    // The specialist phones are written as bare 7-digit extensions
    // in the seed entry body (`767-6504`), not fully qualified with
    // the area code. The model faithfully reproduces that form,
    // which is the desired grounded behavior — accept either.
    expectAnswerContains(result, "767-6504");
  });

  it("recalls the Early Head Start enrollment phone", async () => {
    const result = await askViaRoute("Who handles Early Head Start enrollment?");
    await expectHighConfidence(result, "ehs-enrollment-phone");
    expectAnswerContains(result, "767-6512");
  });

  // ----- Dollar amounts -----------------------------------------------------

  it("recalls the $15 late fee", async () => {
    const result = await askViaRoute("What happens if I'm late picking up my child?");
    await expectHighConfidence(result, "late-fee");
    expectAnswerContains(result, "$15");
  });

  // ----- Staff names --------------------------------------------------------

  it("recalls Lisa Lopez as an enrollment contact", async () => {
    const result = await askViaRoute(
      "Who is the enrollment specialist for Preschool and NM Pre-K?",
    );
    await expectHighConfidence(result, "lisa-lopez");
    expectAnswerContains(result, "Lisa Lopez");
  });

  it("recalls Monica Watrin for EHS intake", async () => {
    const result = await askViaRoute("Who is the intake specialist for Early Head Start?");
    await expectHighConfidence(result, "monica-watrin");
    expectAnswerContains(result, "Monica Watrin");
  });

  // ----- Addresses ----------------------------------------------------------

  it("recalls the DCFD main office address", async () => {
    const result = await askViaRoute("Where is the DCFD main office?");
    await expectHighConfidence(result, "main-office-address");
    expectAnswerContains(result, "1820 Randolph");
  });

  // ----- Center names -------------------------------------------------------

  it("recalls the Alamosa center as a Preschool/Pre-K location", async () => {
    const result = await askViaRoute("Does the Alamosa center offer Preschool and Pre-K?");
    await expectHighConfidence(result, "alamosa-center");
    expectAnswerContains(result, "Alamosa");
  });

  it("recalls that Los Volcanes has an intergenerational center", async () => {
    const result = await askViaRoute("Tell me about the Los Volcanes center.");
    await expectHighConfidence(result, "los-volcanes");
    expectAnswerContains(result, "Los Volcanes");
  });

  // ----- Policy specifics ---------------------------------------------------

  it("recalls the 100.4F fever exclusion threshold", async () => {
    const result = await askViaRoute("At what temperature should I keep my child home?");
    await expectHighConfidence(result, "fever-threshold");
    expectAnswerContains(result, "100.4");
  });

  it("recalls the 24-hour fever-free requirement", async () => {
    const result = await askViaRoute(
      "How long does my child need to be fever-free before returning?",
    );
    await expectHighConfidence(result, "fever-free-24");
    expectAnswerContains(result, "24");
  });

  // ----- Program specifics --------------------------------------------------

  it("recalls the 6.5 hours/day attendance expectation", async () => {
    const result = await askViaRoute("How many hours per day are children expected to attend?");
    await expectHighConfidence(result, "daily-hours");
    expectAnswerContains(result, "6.5");
  });

  it("recalls NAEYC accreditation", async () => {
    const result = await askViaRoute("Is your program accredited?");
    await expectHighConfidence(result, "naeyc");
    expectAnswerContains(result, "NAEYC");
  });

  it("recalls the Nurtured Heart discipline approach", async () => {
    const result = await askViaRoute("What discipline approach do you use in Preschool?");
    await expectHighConfidence(result, "nurtured-heart");
    expectAnswerContains(result, "Nurtured Heart");
  });

  it("recalls the Creative Curriculum framework", async () => {
    const result = await askViaRoute("What curriculum do you use?");
    await expectHighConfidence(result, "creative-curriculum");
    expectAnswerContains(result, "Creative Curriculum");
  });
});
