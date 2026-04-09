import { describe, expect, it } from "vitest";
import { isSensitiveTopic } from "../sensitive";

describe("isSensitiveTopic", () => {
  const sensitive = [
    "My child has a fever and I kept them home",
    "What's the temperature threshold?",
    "She's sick, should I bring her in?",
    "Can you give him his medicine at noon?",
    "He has a peanut allergy",
    "She's been vomiting since last night",
    "He has diarrhea",
    "He fell and has a head injury",
    "She's bleeding from a scraped knee",
    "Another child was biting my daughter",
    "There's a custody dispute, my ex isn't supposed to pick up",
    "Mom says pickup is not allowed by dad this week",
    "I saw a bruise on her arm and I'm worried about abuse",
    "This is an emergency",
    "Should I call 911?",
    "An ambulance came to the school",
  ];

  for (const question of sensitive) {
    it(`flags sensitive: ${JSON.stringify(question)}`, () => {
      expect(isSensitiveTopic(question)).toBe(true);
    });
  }

  const benign = [
    "What time do you open?",
    "How can I schedule a tour?",
    "What's on the lunch menu today?",
    "Do you have parent conferences?",
    "Where is the Los Padillas center located?",
    "How much is tuition for the preschool program?",
  ];

  for (const question of benign) {
    it(`does not flag benign: ${JSON.stringify(question)}`, () => {
      expect(isSensitiveTopic(question)).toBe(false);
    });
  }
});
