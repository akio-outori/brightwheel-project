# review-classifier — findings

**Branch:** `review/pass` off main HEAD `8be4a21`
**Date:** 2026-04-11

## P1 — pattern bugs and over-fires with confirmed false positives

### 1. POSSESSIVE_CHILD_PATTERNS[1] has `i` flag causing `[A-Z]` to match lowercase

File: `lib/llm/preflight/specific-child.ts` line 73

```ts
new RegExp(`\\b(?:my|our)\\s+[A-Z][a-z]{2,}(?:'s)?\\b`, "i"),
```

The pattern is intended to match possessive + proper name (e.g., "my Tommy"). Compiled with the `i` flag, `[A-Z]` also matches lowercase letters — so the pattern matches any "my + lowercase-word" combination. Combined with HEALTH_WORDS containing `doctor` and `pediatrician`, this creates confirmed false positives on enrollment-document questions:

- "What does my pediatrician need to sign?" → **HOLD** (should pass, it's an enrollment-document question)
- "Does my pediatrician need to provide a note?" → **HOLD**
- "What paperwork does my pediatrician need to complete?" → **HOLD**
- "Do I need my doctor to sign the form?" → **HOLD**

**Fix:** remove the `i` flag from POSSESSIVE_CHILD_PATTERNS[1]. The pattern already has `[a-z]{2,}` for the remaining characters, so case-folding the word boundary is not needed.

### 2. Medical-shape `give him/her` fires on program-policy paraphrases

File: `lib/llm/post-response/channels/medical-shape.ts` line 28

The medication-administration pattern `/\bgive\s+(?:your\s+...|him|her)\b/i` fires whenever the object is `him` or `her` regardless of whether the sentence subject is a staff member or the parent. Grounded, correct policy answers are held:

- "Staff will give him his EpiPen from the classroom with his teacher" — held as `medical_instruction`
- "The teacher will give her the medication at the scheduled time per the signed authorization form" — held

This is a meaningful over-fire on the medication entry, the most likely subject for parent medication questions. The `your child` arm is correct because it implies the parent is the agent; `him`/`her` are ambiguous — actor could be staff.

**Fix:** scope the bare-pronoun arm to sentences where the actor is second-person. Require `you` or `please` within a preceding window, or exclude when the pattern is preceded by a third-person nominal within the window.

### 3. Missing medical vocabulary: `administer` and `inject`

Files:
- `lib/llm/post-response/channels/medical-shape.ts:28` (the `give` pattern)
- `lib/llm/preflight/specific-child.ts:40` (HEALTH_WORDS)

Neither `administer` nor `inject` is covered by any pattern. A model draft like "administer the EpiPen to him immediately" or "inject her with epinephrine" contains a clear medical directive but triggers neither the medical-shape `give him/her` pattern nor any preflight group. The self-escalation channel is the only backstop, and only when the model also sets `escalate: true`.

**Fix:** add `administer` and `inject` to the medical-shape patterns and to HEALTH_WORDS.

## P2 — pattern gaps (false negatives)

### 4. `call 911` directed at parent slips through

File: `lib/llm/post-response/channels/medical-shape.ts` lines 48–58

The bare `call 911` pattern was intentionally removed. The rationale is sound for policy paraphrases with a program subject ("staff will call 911"). But a model draft that says "Call 911 immediately if she stops breathing" directed at the parent is not caught. Self-escalation is the only gate.

**Fix:** reintroduce a `call 911` pattern scoped to second-person subject, e.g., when the pattern is not preceded by `staff`, `we`, `teachers`, etc. within a window.

### 5. Missing seed-referenced conditions in HEALTH_WORDS

File: `lib/llm/preflight/specific-child.ts` lines 40–54

The seed's illness-policy entry names "chicken pox" and "hand-foot-and-mouth" explicitly. HEALTH_WORDS has `strep`, `infection`, and `pink eye` but not these:

- `hand-foot-and-mouth`
- `chicken pox`
- `norovirus`
- `RSV`
- `COVID`

"My kid has hand-foot-and-mouth, should I keep him home?" — no HEALTH_WORDS match → no hold on Group 1a → passes preflight despite being a textbook specific-child question.

**Fix:** extend HEALTH_WORDS with these conditions.

### 6. `got sick`, `has a bug`, `picked up a bug` not in HEALTH_WORDS

Parents naturally say "she picked up a bug" or "he's got a stomach bug." Only "stomach" from the latter is in HEALTH_WORDS; "She picked up a bug at daycare" produces no match at all.

**Fix:** add `picked up a bug`, `got a bug`, `has a bug`, `got sick`.

### 7. `they/them` pronouns not in PRONOUN_HEALTH_PATTERNS

Gender-neutral parent communication: "Can they come in if they have a fever?" has no possessive, no name, and `they` is not in pronoun patterns. Gap for parents using gender-neutral language for their child.

**Fix:** extend `PRONOUN_HEALTH_PATTERNS` to include `they`/`them`/`their`.

### 8. "A child like mine" evades all classifier groups

"When is it safe to send a child like mine who has strep?" — `mine` is not in any possessive pattern, `child like mine` is not a family noun, so Group 1a doesn't fire. The only gate is the model's self-escalation.

**Fix:** add `mine` (as a possessive pronoun referencing a child) to the POSSESSIVE_CHILD_PATTERNS vocabulary.

## Threshold concerns

### 9. `RECALL_THRESHOLD = 0.55` (lexical channel, disabled)

File: `lib/llm/post-response/channels/lexical.ts:22`

The channel comment notes empirical recall on grounded answers in 0.28–0.53. That range overlaps the threshold, so 0.55 would still hold legitimate answers. If re-enabled, the threshold would need to be ≤ 0.28, which is too permissive to catch real hallucinations. A stemmed BM25 or higher minimum token count would be the viable path.

### 10. `MIN_SINGLE_WORD_LEN = 5` in entity channel doesn't extract `Maya` standalone

File: `lib/llm/post-response/channels/entities.ts:73`

The seed contains short proper names of relevance: `Maya` (4 chars). `Maya` is captured via the multi-word path when it appears as "Director Maya" but `Maya` alone in a non-sentence-initial position escapes entity grounding. Similarly `Lisa` if the model ever fabricates a "Director Lisa" reference.

**Fix acceptable today:** multi-word path provides the safety net for titled-name cases. **For completeness:** lower `MIN_SINGLE_WORD_LEN` to 4 or add a dedicated short-proper-name allowlist.

### 11. Proximity window: 80 chars (preflight Group 2)

File: `specific-child.ts:186`

80 characters is ~12–15 words. A name followed by a longer intervening clause and then a health word could slip. The window is a judgment call and not clearly wrong; 120 chars would add robustness for verbose parent phrasing.

## Channel ordering

Current order: `[hallucination, self-escalation, coverage, medical-shape, numeric, entities]` — defensible. The medical-shape-before-numeric ordering is intentional (operator gets more informative reason).

One concern: `medical-shape` does not catch a dosage directive if the number format doesn't match `\b\d+(?:\.\d+)?\s*(?:mg|ml|mcg|cc)\b` exactly — "5 milligrams" written out, or "half a teaspoon," escapes. Stylistic forms a model occasionally uses.

## Test coverage gaps

- No test for `give him` or `give her` with staff-as-subject policy paraphrase (issue #2)
- No test for `administer` or `inject` vocabulary gaps (issue #3)
- No test with `my pediatrician` or `my doctor` in an enrollment-document question (issue #1)
- No test for `hand-foot-and-mouth` or `chicken pox` named condition in a specific-child question (issue #5)
- No test for `they/them` pronouns in health context (issue #7)

## Verified clean

- All regex patterns compile without error (test suite passes: 357/357)
- No unescaped special characters in health vocabulary alternation
- Policy-question negatives correctly rescue the core set of false-positive classes
- `refusal: true` correctly bypasses the post-response pipeline and needs-attention log; the normalization (`escalate: false`, `cited_entries: []`) prevents a refusal from accidentally appearing as a grounded hold in the operator queue
- The preflight classifier is NOT in the refusal bypass path — preflight runs before the LLM call, refusals are only possible post-LLM. Architecturally correct
- `lexical_unsupported` is in both `HoldReason` and `VALID_HOLD_REASONS` despite the channel being disabled — defensive hygiene, channel can be re-enabled without a type migration
- The duplicate `hasn't` in `PRONOUN_HEALTH_PATTERNS[0]` is noise but harmless — regex engine dedupes the alternation at match time
