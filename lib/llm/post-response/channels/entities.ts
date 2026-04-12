// Entity absence channel. Capitalized multi-word phrases in the
// draft (and some long capitalized single words) should be
// traceable to at least one cited source. A named entity in the
// draft that doesn't appear in any source is almost always a
// fabricated staff name, a made-up place, or an invented
// form/product name.
//
// This is a heuristic, not real NER — the full NER case is deferred
// to a future change. The heuristic catches the failure modes seen
// in practice (fabricated "Director Maria", fabricated street
// addresses, invented meal vendors) without pulling in an ML dep.

import type { Channel } from "../types";

/** Capitalized words that are allowed to appear in the draft
 *  without a source match. This is NOT a list of English stopwords
 *  — it's a list of words that get capitalized for reasons other
 *  than being proper nouns (days, months, sentence-initial common
 *  words, modal fragments). */
const CAPITALIZATION_ALLOWLIST: ReadonlySet<string> = new Set([
  "I",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "Mr",
  "Mrs",
  "Ms",
  "Dr",
  // English words that happen to be capitalized because they start
  // sentences — most common cases, to avoid false positives on
  // common opener words.
  "The",
  "This",
  "That",
  "These",
  "Those",
  "Your",
  "You",
  "If",
  "For",
  "When",
  "Where",
  "How",
  "Why",
  "Who",
  "Please",
  "Thanks",
  "Thank",
  "Yes",
  "No",
  "Also",
  "Here",
]);

/** Minimum single-word length for the single-word case. Short
 *  capitalized words ("Be", "To", "It") are too noisy. Lowered from
 *  5 to 4 (C8) so standalone 4-letter proper names like "Maya" or
 *  "Lisa" are caught when they appear mid-sentence. */
const MIN_SINGLE_WORD_LEN = 4;

/** Strip a leading sentence-initial or allowlisted first word from
 *  a multi-word match. "Contact Director Maya" at sentence start
 *  becomes "Director Maya"; "The Sunflower Family App" becomes
 *  "Sunflower Family App". Applied only to the first word because
 *  subsequent words can legitimately be proper nouns even if they
 *  also match common English words. */
function trimSentenceInitialFirstWord(
  match: string,
  matchStartIndex: number,
  text: string,
): string {
  const firstSpaceIdx = match.indexOf(" ");
  if (firstSpaceIdx === -1) return match;
  const firstWord = match.slice(0, firstSpaceIdx);
  const rest = match.slice(firstSpaceIdx + 1);

  // If the first word is in the capitalization allowlist, drop it.
  if (CAPITALIZATION_ALLOWLIST.has(firstWord)) return rest;

  // If the first word is sentence-initial, drop it too.
  let i = matchStartIndex - 1;
  while (i >= 0 && /\s/.test(text[i]!)) i--;
  if (i < 0) return rest; // start of text
  const prev = text[i];
  if (prev === "." || prev === "!" || prev === "?") return rest;

  return match;
}

/** Extract candidate entities from the draft. Returns a deduped list
 *  preserving the first-seen form of each entity. */
export function extractEntities(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  // Multi-word capitalized sequences. Each "word" is either a
  // Titlecase word (`Director`, `Office`), an all-caps acronym
  // (`IEP`, `ASQ`, `EpiPen`), or a hyphenated compound like
  // `Pre-K` or `Reggio-Emilia`. Lowercase connective words like
  // "of", "and", "the" are allowed between capitalized words.
  const capitalizedWord = "(?:[A-Z][a-z]*(?:-[A-Z][a-z]*)*|[A-Z]{2,}(?:-[A-Z][a-z]*)*)";
  const connective = "(?:of|and|the|at|for|in|on|de|la|el)";
  const multiWord = new RegExp(
    `\\b${capitalizedWord}(?:\\s+${connective}\\s+${capitalizedWord}|\\s+${capitalizedWord})+\\b`,
    "g",
  );
  let mw: RegExpExecArray | null;
  while ((mw = multiWord.exec(text)) !== null) {
    const trimmed = trimSentenceInitialFirstWord(mw[0], mw.index, text);
    if (trimmed.length === 0 || !trimmed.includes(" ")) {
      // After trimming the first word, we need at least two words
      // to still count as a multi-word entity. If only one word
      // remains, the single-word pass below will pick it up.
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(trimmed);
  }

  // Single capitalized words that are long enough to likely be proper
  // nouns and are NOT sentence-initial. Sentence-initial detection:
  // if a word is preceded by `. ` or `! ` or `? ` or is at the very
  // start of the text, skip it.
  const singleWord = /\b[A-Z][a-z]{3,}\b/g;
  let match: RegExpExecArray | null;
  while ((match = singleWord.exec(text)) !== null) {
    const word = match[0];
    const start = match.index;

    // Allowlist?
    if (CAPITALIZATION_ALLOWLIST.has(word)) continue;

    // Sentence-initial / list-item-initial check: look back for
    // preceding sentence terminators (`.`, `!`, `?`), start-of-string,
    // or list bullet markers (`•`, `-`, `*`, `\n`, digits+period).
    // Bullet points produce capitalized common words ("Vomiting",
    // "Continuous", "Children") that are not proper nouns.
    let i = start - 1;
    while (i >= 0 && /\s/.test(text[i]!)) i--;
    if (i < 0) continue; // start of string
    const prev = text[i];
    if (prev === "." || prev === "!" || prev === "?") continue;
    if (prev === "•" || prev === "-" || prev === "*") continue;
    if (prev === ":" || prev === ";") continue;
    // Numbered list: "1. Fever" — prev is "." and the char before
    // is a digit. Already caught by "." check above.
    if (prev === "\n") continue;

    // Already captured as part of a multi-word entity?
    const key = word.toLowerCase();
    if (seen.has(key)) continue;

    // Skip trivially short words and anything already in the
    // capitalization allowlist.
    if (word.length < MIN_SINGLE_WORD_LEN) continue;

    seen.add(key);
    found.push(word);
  }

  return found;
}

export const entitiesChannel: Channel = ({ question, draft, allSources }) => {
  const entities = extractEntities(draft.answer);
  if (entities.length === 0) return { verdict: "pass" };

  // Entity grounding is checked against the FULL document, not just
  // the cited subset. An answer that cites `food-allergies` and
  // mentions "Head Teacher" is still correctly grounded because
  // "Head Teacher" appears throughout the document. The strict
  // "entity must be in a cited source" check was too tight and
  // produced false positives on legitimate cross-entry references.
  // The hallucination channel already catches citation-level
  // fabrication; this channel's job is to catch fabricated entities.
  //
  // The parent's question is also included in the corpus. If a
  // parent asks "Are you open on Veterans Day?" and the model
  // echoes "Veterans Day" in the answer, that's not a fabrication
  // — it came from the question, which is part of the grounded
  // context the model was given. The classifier should only flag
  // entities the model INVENTED, not entities it ECHOED from the
  // user's own words. Stopping model invention of unverified
  // user-supplied facts is the model's job, enforced by the
  // system prompt; the entities channel is the fabrication-
  // detection safety net, not the factuality-against-parent-input
  // gate.
  if (allSources.length === 0) {
    return {
      verdict: "hold",
      reason: "fabricated_entity",
      detail: `draft mentions entities (${entities.slice(0, 3).join(", ")}) but document is empty`,
    };
  }

  const corpus = [question, ...allSources.map((s) => `${s.title}\n${s.body}`)]
    .join("\n")
    .toLowerCase();

  // Per-entity check:
  //   1. Verbatim substring of the whole phrase is the fast path.
  //   2. If that fails, the model may have legitimately combined
  //      real tokens in a new word order ("Enrollment Specialist for
  //      Preschool and NM Pre-K" when the source says "Preschool and
  //      NM Pre-K Enrollment: Lisa Lopez, Enrollment Specialist").
  //      Fall back to token-level: split on whitespace, check each
  //      Titlecase token individually, and the entity is grounded
  //      if every token appears in the corpus. This is lenient but
  //      it avoids policing the model's word order — the goal is
  //      to catch *fabricated* names/places, not paraphrase.
  const missing: string[] = [];
  for (const ent of entities) {
    if (corpus.includes(ent.toLowerCase())) continue;

    const tokens = ent.split(/\s+/).filter((t) => /[A-Za-z]/.test(t));
    const unknownTokens = tokens.filter((t) => !corpus.includes(t.toLowerCase()));
    if (unknownTokens.length === 0) continue;

    missing.push(ent);
  }

  if (missing.length === 0) return { verdict: "pass" };

  return {
    verdict: "hold",
    reason: "fabricated_entity",
    detail: `entities not found in document: ${missing.join(", ")}`,
  };
};
