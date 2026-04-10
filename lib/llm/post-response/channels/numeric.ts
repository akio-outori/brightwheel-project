// Numeric absence channel. Every numeric literal the draft emits
// must appear in at least one cited source body. A number in the
// answer but not in any source is almost always a fabricated
// statistic, a made-up phone number, an invented fee, or an
// invented threshold — all of which are trust-loop-breaking on a
// grounded front desk.
//
// Translated from go-mcp-sdk/sdk/grounding/numeric.go. The Go
// version extracts bare numeric cores and does a substring check
// against the source text; we do the same.

import type { Channel } from "../types";

/** Regex that finds numeric literals. Order matters: more specific
 *  patterns run first so a phone number is extracted as a single
 *  literal instead of being split into two integers. */
const NUMERIC_PATTERNS: ReadonlyArray<RegExp> = [
  // Phone numbers: 505-767-6500, (505) 767-6500, 767-6500
  /\(\d{3}\)\s*\d{3}-\d{4}/g,
  /\d{3}-\d{3}-\d{4}/g,
  /\d{3}-\d{4}/g,
  // Dollar amounts: $1,234.56, $15
  /\$\d{1,3}(?:,\d{3})*(?:\.\d+)?/g,
  // Temperatures: 100.4°F, 100°F, 100.4F
  /\d+(?:\.\d+)?\s*°?[Ff]\b/g,
  // Percentages: 75%, 75 %
  /\d+(?:\.\d+)?\s*%/g,
  // Decimals: 100.4, 4.5
  /\d+\.\d+/g,
  // Bare integers, 2+ digits, not already matched
  /\b\d{2,}\b/g,
];

/** Canonicalize a numeric literal for comparison against source
 *  bodies. Strips punctuation that differs between "how the model
 *  rendered it" and "how the source wrote it" — dashes, commas,
 *  dollar signs, degree marks, trailing units. Returns the bare
 *  digits with a single optional decimal. */
function canonicalizeNumeric(literal: string): string {
  return literal
    .replace(/[\$,()°]/g, "")
    .replace(/\s+/g, "")
    .replace(/[Ff]$/, "")
    .replace(/%$/, "");
}

export const numericChannel: Channel = ({ draft, allSources }) => {
  // Collect all numeric literals from the draft answer.
  const rawLiterals: string[] = [];
  for (const pat of NUMERIC_PATTERNS) {
    const matches = draft.answer.match(pat);
    if (!matches) continue;
    rawLiterals.push(...matches);
  }

  if (rawLiterals.length === 0) return { verdict: "pass" };

  // Numeric grounding is checked against the FULL document, not just
  // the cited subset. The trust-loop guarantee at this layer is "the
  // number exists in the source document somewhere" — the stricter
  // "the number exists in the specific source the model cited" is
  // too tight: models legitimately reference facts from one entry
  // while citing another (e.g. mentioning a main office phone while
  // citing the staff directory). The hallucination channel already
  // catches citation-level fabrication; this channel's job is to
  // catch fabricated numbers, not to audit citation discipline.
  const corpus = allSources
    .map((s) => s.body)
    .join("\n")
    .toLowerCase();
  if (corpus.length === 0) {
    return {
      verdict: "hold",
      reason: "fabricated_numeric",
      detail: `draft contains ${rawLiterals.length} numeric literal(s) but document is empty`,
    };
  }

  const missing: string[] = [];
  // Deduplicate so a literal repeated in the draft only costs us one
  // check — and only reports once in the detail field.
  const seen = new Set<string>();
  for (const raw of rawLiterals) {
    const canon = canonicalizeNumeric(raw);
    if (seen.has(canon)) continue;
    seen.add(canon);

    // Check both the raw literal (in case the source wrote it the
    // same way) and the canonicalized form (bare digits).
    const rawLower = raw.toLowerCase();
    if (corpus.includes(rawLower)) continue;
    if (canon.length > 0 && corpus.includes(canon)) continue;

    missing.push(raw);
  }

  if (missing.length === 0) return { verdict: "pass" };

  return {
    verdict: "hold",
    reason: "fabricated_numeric",
    detail: `numeric literals not found in document: ${missing.join(", ")}`,
  };
};
