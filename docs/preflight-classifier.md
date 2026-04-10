# Preflight Classifier

## Purpose

The preflight classifier runs **before the LLM call** on the
parent's question text. It detects questions about a specific
child's medical or safety situation and short-circuits to a stock
"a staff member is reviewing this" response — saving the model
call cost, eliminating latency, and preventing the model from
generating a confident-but-wrong answer about a child's health.

General policy questions ("What is the fever policy?") pass
through. Specific-child questions ("My son has a fever") hold.

## Architecture

Compiled regex patterns grouped by threat category, running in
short-circuit order. The first match wins. Each pattern group has
a documented purpose and a corresponding set of unit tests.

Location: `lib/llm/preflight/specific-child.ts`

## Pattern groups

### Group 1a — Possessive + family noun + health vocabulary

Matches: "My child has a fever", "Our daughter is allergic to
peanuts", "My toddler was vomiting"

The health vocabulary covers symptoms, conditions, medications,
injuries, and euphemisms: ~80 terms including contractions and
informal phrasing ("threw up", "under the weather", "isn't
feeling well").

**Policy-question override:** Questions matching a policy pattern
("What is the...", "How does the program...", "When should I...",
"At what temperature...", "How long does...") pass through even
when they contain "my child" + health words.

### Group 1b — Possessive + attendance-decision verb + health

Matches: "Is it OK to send my child with a runny nose?", "Can my
son still come if he has a cough?"

Requires health context — "Can my daughter attend the summer
session?" (no health word) passes through.

### Group 2 — Proper name + health proximity

Matches: "Tommy has a fever", "Sarah is allergic to tree nuts"

Case-sensitive name extraction (won't match lowercase "children").
Names are checked against an allowlist of sentence starters, days,
months, and program-specific words. Proximity window: 80 chars.

### Group 3a — Euphemisms

Matches: "He hasn't been himself since yesterday"

Fires independently of health vocabulary because the phrasing
itself conveys illness.

### Group 3b — Pronoun + health context

Matches: "He has diarrhea", "She's been vomiting", "He's really
out of it", "Should I bring her in with a fever?"

Handles contractions (he's, she's, hasn't). Requires health
vocabulary in the question to prevent false positives on "He wants
to join the art class."

### Group 4 — Action requests

Matches: "Can you give my son Tylenol?", "Can my daughter still
come if she has a cold?"

Health-context actions require health vocabulary. Custody/
authorization actions ("double-check her pickup authorization")
hold unconditionally.

## What does NOT trigger

The negative set is as important as the positive set:

- "What is the sick-child exclusion policy?"
- "How does the program handle food allergies?"
- "What immunizations are required?"
- "At what temperature should I keep my child home?"
- "How long does my child need to be fever-free?"
- "Where is my child's classroom?"
- "My son loves the art projects you do"
- "Should I bring my child in today?" (no health context)

## Unit tests

164 targeted tests in
`lib/llm/preflight/__tests__/specific-child.test.ts`. Each test
exercises a distinct decision path — no combinatorial padding.
Categories:

- Possessive + family noun (12 hold, 6 pass)
- Proper name + health (10 hold, 4 pass)
- Pronoun + health (10 hold, 6 pass)
- Action requests (6 hold health, 2 hold custody, 3 pass)
- Complex/informal phrasing (38 hold)
- General policy questions (52 pass)
- Health-adjacent in general context (17 pass)
- Off-topic (10 pass)
- Possessive without health (15 pass)

## Key files

- `lib/llm/preflight/specific-child.ts` — the classifier
- `lib/llm/preflight/types.ts` — `PreflightVerdict` type
- `lib/llm/preflight/index.ts` — barrel export
- `app/api/ask/route.ts` — where the preflight is called (before the LLM)
