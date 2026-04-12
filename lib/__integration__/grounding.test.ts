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

  it("recalls the main Sunflower office phone number", async () => {
    const result = await askViaRoute("What's the phone number for the main office?");
    await expectHighConfidence(result, "main-office-phone");
    expectAnswerContains(result, "(512) 555-0142");
  });

  // ----- Dollar amounts -----------------------------------------------------

  it("recalls the $1 per minute late pickup fee", async () => {
    const result = await askViaRoute("What happens if I'm late picking up my child?");
    await expectHighConfidence(result, "late-fee");
    expectAnswerContains(result, "$1");
  });

  it("recalls the infant monthly tuition", async () => {
    const result = await askViaRoute("How much is infant tuition?");
    await expectHighConfidence(result, "tuition-infant");
    expectAnswerContains(result, "$1,680");
  });

  it("recalls the preschool monthly tuition", async () => {
    const result = await askViaRoute("How much is preschool tuition?");
    await expectHighConfidence(result, "tuition-preschool");
    expectAnswerContains(result, "$1,380");
  });

  it("recalls the one-time registration fee", async () => {
    const result = await askViaRoute("Is there a registration fee?");
    await expectHighConfidence(result, "registration-fee");
    expectAnswerContains(result, "$150");
  });

  // ----- Staff names --------------------------------------------------------

  it("recalls Director Maya Okonkwo by name", async () => {
    const result = await askViaRoute("Who runs Sunflower?");
    await expectHighConfidence(result, "director-name");
    expectAnswerContains(result, "Maya Okonkwo");
  });

  // ----- Addresses ----------------------------------------------------------

  it("recalls the Sunflower address", async () => {
    const result = await askViaRoute("Where is Sunflower located?");
    await expectHighConfidence(result, "address");
    expectAnswerContains(result, "1420 Willow Creek");
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

  it("recalls the infant classroom ratio", async () => {
    const result = await askViaRoute("What's the teacher-to-child ratio in the infant room?");
    await expectHighConfidence(result, "ratio-infant");
    // Sunflower's infant ratio is 1 teacher for every 4 children.
    expectAnswerContains(result, "4");
  });

  it("recalls the Reggio Emilia curriculum approach", async () => {
    const result = await askViaRoute("What curriculum do you use?");
    await expectHighConfidence(result, "curriculum");
    expectAnswerContains(result, "Reggio Emilia");
  });

  it("recalls the ASQ-3 assessment tool", async () => {
    const result = await askViaRoute("How do you track my child's development?");
    await expectHighConfidence(result, "assessment");
    expectAnswerContains(result, "ASQ");
  });

  it("recalls the nut-free building policy", async () => {
    const result = await askViaRoute("Can my child bring peanut butter sandwiches?");
    await expectHighConfidence(result, "nut-free");
    expectAnswerContains(result, "nut-free");
  });

  // ----- Tuition amounts ---------------------------------------------------

  it("recalls the toddler monthly tuition", async () => {
    const result = await askViaRoute("How much is toddler tuition?");
    await expectHighConfidence(result, "tuition-toddler");
    expectAnswerContains(result, "$1,560");
  });

  it("recalls the twos monthly tuition", async () => {
    const result = await askViaRoute("How much is tuition for the twos room?");
    await expectHighConfidence(result, "tuition-twos");
    expectAnswerContains(result, "$1,470");
  });

  // ----- Fees --------------------------------------------------------------

  it("recalls the annual supply fee", async () => {
    const result = await askViaRoute("Is there an annual supply fee?");
    await expectHighConfidence(result, "annual-supply-fee");
    expectAnswerContains(result, "$120");
  });

  it("recalls the late payment fee", async () => {
    const result = await askViaRoute("What happens if I pay tuition late?");
    await expectHighConfidence(result, "late-payment-fee");
    expectAnswerContains(result, "$35");
  });

  it("recalls the sibling discount", async () => {
    const result = await askViaRoute("Do you offer a sibling discount?");
    await expectHighConfidence(result, "sibling-discount");
    expectAnswerContains(result, "10%");
  });

  // ----- Ratios ------------------------------------------------------------

  it("recalls the toddler ratio", async () => {
    const result = await askViaRoute("What's the teacher-to-child ratio for toddlers?");
    await expectHighConfidence(result, "ratio-toddler");
    expectAnswerContains(result, "6");
  });

  it("recalls the twos ratio", async () => {
    const result = await askViaRoute("What's the ratio in the twos classroom?");
    await expectHighConfidence(result, "ratio-twos");
    expectAnswerContains(result, "8");
  });

  it("recalls the preschool ratio", async () => {
    const result = await askViaRoute("What's the teacher-to-child ratio for preschool?");
    await expectHighConfidence(result, "ratio-preschool");
    expectAnswerContains(result, "10");
  });

  it("recalls the max infant group size", async () => {
    const result = await askViaRoute("What's the maximum group size in the infant room?");
    await expectHighConfidence(result, "max-infant-group");
    expectAnswerContains(result, "8");
  });

  // ----- Health / outdoor specifics ----------------------------------------

  it("recalls the UV threshold for sunscreen application", async () => {
    const result = await askViaRoute("When do you apply sunscreen to the kids?");
    await expectHighConfidence(result, "uv-threshold");
    expectAnswerContains(result, "3");
  });

  // ----- Operating hours verbatim ------------------------------------------

  it("recalls the operating hours verbatim", async () => {
    const result = await askViaRoute("What are Sunflower's exact operating hours?");
    await expectHighConfidence(result, "operating-hours");
    expectAnswerContains(result, "7:00");
    expectAnswerContains(result, "6:00");
  });

  it("recalls the drop-off deadline", async () => {
    const result = await askViaRoute("What time should I drop off my child by?");
    await expectHighConfidence(result, "drop-off-deadline");
    expectAnswerContains(result, "9:30");
  });
});
