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

/* eslint-disable security/detect-unsafe-regex -- These patterns
   run against draft answers capped at 2000 chars; ReDoS is not a risk. */
/** Every pattern is case-insensitive. If any pattern matches, the
 *  draft is holding an instruction the operator should review
 *  before it reaches the parent. */
const MEDICAL_INSTRUCTION_PATTERNS: ReadonlyArray<RegExp> = [
  // Medication administration directed at the parent's child.
  // The bare-pronoun arm (him/her) requires a second-person subject
  // ("you should give him") so that staff-as-subject policy
  // paraphrases ("staff will give him his EpiPen") pass through.
  /\bgive\s+your\s+(?:child|son|daughter|kid|baby|toddler)\b/i,
  /\byou\s+(?:should\s+|can\s+|need\s+to\s+|must\s+)?give\s+(?:him|her)\b/i,

  // Medication verbs: administer, inject (always medical context)
  /\b(?:you\s+(?:should\s+|can\s+|need\s+to\s+|must\s+)?)?(?:administer|inject)\s+(?:the\s+)?(?:\w+\s+){0,3}(?:to\s+)?(?:your\s+(?:child|son|daughter|kid|baby|toddler)|him|her)\b/i,

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

  // Dosage-shaped numeric literal — strong signal of medication
  // instruction regardless of context
  /\b\d+(?:\.\d+)?\s*(?:mg|ml|mcg|cc)\b/i,

  // Scheduled dosing near a body/health word
  /\b(?:every|each)\s+\d+\s+hours?\b(?=[\s\S]{0,120}(?:dose|medication|medicine|medicin|pill|tablet|syrup|drops?))/i,
  /(?:dose|medication|medicine|pill|tablet|syrup|drops?)\b(?=[\s\S]{0,120}\b(?:every|each)\s+\d+\s+hours?)/i,
];

// C3: Scoped call-911 check. The bare "call 911" pattern was
// previously removed because it over-fired on policy paraphrases
// where the subject is the program ("staff will call 911"). This
// scoped version fires only when "call 911" is directed at the
// parent (second-person or bare imperative) and skips when preceded
// by third-person subjects like "staff", "we", "they", "teachers",
// "the center" within the same clause.
const CALL_911_PATTERN = /\bcall\s+911\b/gi;
const THIRD_PERSON_SUBJECTS =
  /\b(?:staff|we|they|teachers?|the\s+center|the\s+school|our\s+team)\b/i;

function isCall911DirectedAtParent(text: string): string | null {
  let m: RegExpExecArray | null;
  CALL_911_PATTERN.lastIndex = 0;
  while ((m = CALL_911_PATTERN.exec(text)) !== null) {
    // Look back up to 120 characters for the nearest sentence
    // boundary (period, semicolon, or start of string), then check
    // whether a third-person subject appears anywhere in that
    // sentence fragment. Commas are NOT treated as boundaries
    // because list items ("administer first aid, call 911, and
    // contact you") share the sentence's subject.
    const start = Math.max(0, m.index - 120);
    const preceding = text.slice(start, m.index);

    const lastBoundary = Math.max(preceding.lastIndexOf("."), preceding.lastIndexOf(";"));
    const sentence = lastBoundary >= 0 ? preceding.slice(lastBoundary + 1) : preceding;

    if (THIRD_PERSON_SUBJECTS.test(sentence)) continue;

    return m[0];
  }
  return null;
}

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

  // C3: scoped call-911 check (function-based, not regex-only,
  // because the third-person subject can be separated from "call 911"
  // by arbitrary intervening text within the same clause).
  const call911Match = isCall911DirectedAtParent(draft.answer);
  if (call911Match) {
    return {
      verdict: "hold",
      reason: "medical_instruction",
      detail: `matched medical-shape pattern: "${call911Match}"`,
    };
  }

  return { verdict: "pass" };
};
