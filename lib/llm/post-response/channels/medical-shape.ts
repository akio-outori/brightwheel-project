// Medical-instruction shape channel. Catches draft answers that
// direct the parent to take a specific action on their child's
// body or health. This is the deterministic replacement for the
// old keyword-based isSensitiveTopic regex — but the key
// architectural difference is that this channel fires on the
// MODEL'S OUTPUT, not on the parent's INPUT.
//
// The old regex over-fired because "What is the sick-child
// exclusion policy?" matched `\bsick\b`. This channel does not,
// because the *answer* to that question is a policy paraphrase
// ("Keep children home if they have..."), not a directive to the
// parent ("keep YOUR CHILD home for 24 hours after...").
//
// The patterns all require a second-person possessive or pronoun
// referring to the parent's child. That shape is what distinguishes
// a directive ("give your child Tylenol") from a policy statement
// ("children may not be medicated by staff").

import type { Channel } from "../types";

/** Every pattern is case-insensitive. If any pattern matches, the
 *  draft is holding an instruction the operator should review
 *  before it reaches the parent. */
const MEDICAL_INSTRUCTION_PATTERNS: ReadonlyArray<RegExp> = [
  // Medication administration directed at the parent's child
  /\bgive\s+(?:your\s+(?:child|son|daughter|kid|baby|toddler)|him|her)\b/i,

  // Home-exclusion directive with duration
  /\bkeep\s+(?:your\s+(?:child|son|daughter|kid)|him|her)\s+(?:at\s+)?home\s+(?:for\s+\d+|until|for\s+at\s+least)/i,

  // Note: a broader "your child should stay home" / "your child
  // cannot attend" pattern was considered for catching the
  // stomach-bug test case, but those patterns also fire on policy
  // paraphrases ("Your child cannot attend if they have a fever...")
  // which are legitimate informational answers to questions like
  // "What is the sick-child exclusion policy?". The distinction
  // between a policy paraphrase and a directive isn't reliably
  // structural — both use second-person possessives — so the
  // broader pattern is intentionally not included. The narrow
  // "keep (him|her|your child) home for N hours" rule above still
  // catches the clearest directive shapes.

  // Emergency routing / medical referral
  /\btake\s+(?:your\s+(?:child|son|daughter|kid)|him|her)\s+to\s+(?:the\s+)?(?:er|emergency\s+room|hospital|doctor|pediatrician|urgent\s+care)/i,

  // Note: the bare "call 911" pattern was dropped. It fires on
  // legitimate policy paraphrases like "staff will call 911 if
  // needed" and "we administer first aid, call 911 if needed" where
  // the subject is the program (we/staff), not an imperative
  // directed at the parent. Distinguishing parent-directed imperatives
  // from program-policy statements structurally is unreliable, and
  // the self-escalation channel already catches the genuine
  // "parent needs to call 911" cases where the model raises the flag
  // itself. A correctly-grounded policy answer that mentions "call
  // 911" as part of describing what staff do is not something we
  // need to hold.

  // Dosage-shaped numeric literal — strong signal of medication
  // instruction regardless of context
  /\b\d+(?:\.\d+)?\s*(?:mg|ml|mcg|cc)\b/i,

  // Scheduled dosing near a body/health word
  /\b(?:every|each)\s+\d+\s+hours?\b(?=[\s\S]{0,120}(?:dose|medication|medicine|medicin|pill|tablet|syrup|drops?))/i,
  /(?:dose|medication|medicine|pill|tablet|syrup|drops?)\b(?=[\s\S]{0,120}\b(?:every|each)\s+\d+\s+hours?)/i,
];

export const medicalShapeChannel: Channel = ({ draft }) => {
  for (const pat of MEDICAL_INSTRUCTION_PATTERNS) {
    const match = draft.answer.match(pat);
    if (match) {
      return {
        verdict: "hold",
        reason: "medical_instruction",
        detail: `matched medical-shape pattern: "${match[0].slice(0, 80)}"`,
      };
    }
  }
  return { verdict: "pass" };
};
