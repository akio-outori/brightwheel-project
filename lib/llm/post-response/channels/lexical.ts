// Lexical grounding channel. Measures how much of the draft's
// content-token vocabulary actually appears in the cited source
// bodies. A grounded paraphrase should hit a high recall; an
// answer that invented facts drops below the threshold.
//
// Architecture: token-recall scoring against cited source bodies.
// The draft's content tokens are checked against the union of
// source tokens; a low recall score indicates the model invented
// vocabulary not present in any cited source.
//
// Threshold is tunable in one place (RECALL_THRESHOLD) and very
// short drafts are auto-passed because the recall score becomes
// noisy at small token counts.

import type { Channel } from "../types";

/** Below this recall we hold the draft. Tuned by first principles:
 *  a grounded paraphrase of a handbook entry should hit 0.6+ easily
 *  (answers tend to reuse the source vocabulary). A drop below 0.55
 *  is a strong signal that the model injected vocabulary from
 *  outside the cited source. */
const RECALL_THRESHOLD = 0.55;

/** Drafts with fewer content tokens than this auto-pass. Recall is
 *  noisy at small n, and a 6-word draft is probably a one-sentence
 *  affirmation that doesn't need grounding anyway. */
const MIN_TOKENS_FOR_RECALL = 8;

/** English stopwords. Short enough to inline; covers the words we
 *  care about stripping from the recall calculation. */
const STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "like",
  "make",
  "may",
  "me",
  "might",
  "must",
  "my",
  "of",
  "on",
  "one",
  "only",
  "or",
  "our",
  "out",
  "over",
  "own",
  "same",
  "shall",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "up",
  "upon",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
  "yours",
]);

/** Very light stemming: strip a trailing "s" if the result is at
 *  least 3 characters. This collapses singular/plural pairs
 *  (hour/hours, class/classes, run/runs) without pulling in a full
 *  stemmer like Porter. The 3-char floor prevents degenerate cases
 *  like "is" → "i" or "us" → "u". Not perfect — "busines" ≠
 *  "business" after stripping, but business/businesses both
 *  normalize to "busines", which is what we want for recall. */
function lightStem(token: string): string {
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

/** Tokenize a string into content tokens: lowercase, stripped of
 *  punctuation, filtered for stopwords, light-stemmed, minimum
 *  length 3. Returns a set so repeated tokens count once (recall,
 *  not frequency). */
export function contentTokenSet(text: string): Set<string> {
  const out = new Set<string>();
  // Split on anything that isn't a letter, digit, or apostrophe.
  // Apostrophes inside words ("don't") are kept; trailing strip
  // happens below.
  const raw = text.toLowerCase().split(/[^a-z0-9']+/);
  for (const t of raw) {
    const cleaned = t.replace(/^'+|'+$/g, "");
    if (cleaned.length < 3) continue;
    if (STOPWORDS.has(cleaned)) continue;
    out.add(lightStem(cleaned));
  }
  return out;
}

export const lexicalChannel: Channel = ({ draft, cited }) => {
  const answerTokens = contentTokenSet(draft.answer);

  // Very short drafts pass automatically — not enough signal.
  if (answerTokens.size < MIN_TOKENS_FOR_RECALL) {
    return { verdict: "pass" };
  }

  // Build the union of content tokens across all cited source bodies.
  // If the draft cited nothing, we cannot compute recall — treat as
  // a hold, since an answer with nonzero content tokens and zero
  // citations is ungrounded by definition.
  if (cited.length === 0) {
    return {
      verdict: "hold",
      reason: "lexical_unsupported",
      detail: `draft has ${answerTokens.size} content tokens but cites zero sources`,
    };
  }

  const sourceTokens = new Set<string>();
  for (const s of cited) {
    // Include the title as well as the body — titles often contain
    // the topic word the answer paraphrases.
    for (const t of contentTokenSet(`${s.title} ${s.body}`)) {
      sourceTokens.add(t);
    }
  }

  let matched = 0;
  const missed: string[] = [];
  for (const t of answerTokens) {
    if (sourceTokens.has(t)) {
      matched += 1;
    } else if (missed.length < 6) {
      missed.push(t);
    }
  }

  const recall = matched / answerTokens.size;
  if (recall >= RECALL_THRESHOLD) return { verdict: "pass" };

  return {
    verdict: "hold",
    reason: "lexical_unsupported",
    detail: `recall ${recall.toFixed(2)} < ${RECALL_THRESHOLD} (sample unmatched: ${missed.join(", ")})`,
  };
};
