# AI Front Desk

## The problem

Parents ask daycare programs the same questions hundreds of times a year. Staff answer them between diaper changes. An LLM can handle most of these — but when it gets one wrong, the parent doesn't know, and neither does the staff. The confidence is indistinguishable from correctness. That's the failure mode every AI assistant product has to solve before it ships.

The question isn't "can we get the model to answer?" It's **"when the model gets it wrong, how does the next parent get it right?"**

## What this is

An AI front desk for a family services organization. A parent asks a question. Three things can happen, and only three:

1. **The system knows the answer.** The parent gets a grounded response with a citation to the specific handbook entry or staff clarification it came from. The answer is auditable — you can click the source and read it.

2. **The system isn't sure.** The parent gets a warm "a staff member is taking a look at your question." No hedged answer, no "I think maybe," no confident invention. A clean hold.

3. **A staff member closes the gap.** The operator sees the question, sees what the model would have said (and why it was held), writes a two-sentence answer, and the next parent who asks the same question gets a grounded, cited response in under fifteen seconds. No restart, no retraining, no index rebuild.

That third path is the product. Everything else is infrastructure to make it reliable.

## How it stays honest

The system doesn't trust the model. Three layers of deterministic verification sit between the model's draft and what the parent sees:

**Before the model runs:** A preflight classifier detects questions about a specific child's health, injuries, or custody situation using structural pattern matching — not keywords. "My son has a fever" holds instantly. "What is the fever policy?" passes through. The distinction is grammatical (possessive + health vocabulary vs. informational question structure), not topical. This saves the model call entirely for the highest-stakes questions.

**After the model drafts:** Six verification channels inspect the draft in order. Every cited source ID must exist in the document. Every phone number, dollar amount, and temperature must appear verbatim in a source. Every proper name must trace back to the handbook. If the model directs a parent to administer medication or take their child to the ER, the draft is held for human review. Any channel that fails replaces the draft with the stock "being reviewed" response. The operator sees the original draft alongside the reason it was held.

**When the model is honest about not knowing:** The model's own escalation signal is respected. When it sets `escalate: true`, the system routes to a human without second-guessing.

## What staff see

The operator console shows a feed of held questions, each labeled with why it was held: hallucinated citation, fabricated phone number, medical instruction, specific-child question, model self-escalation, no coverage in the handbook. Staff can see what the model would have said, judge whether it's right, and either write a correction or confirm the answer. Corrections land as operator overrides — a mutable layer that sits on top of the immutable source document. The model learns to prefer overrides at query time. The source document never changes.

## What this is built on

The source data is 73 entries from the Albuquerque DCFD Family Handbook (2019), a real public document with real staff names, phone numbers, and center addresses. The trust loop isn't a story — it runs against real content where a wrong phone number is verifiably wrong.

The security boundary is a type system. Four branded TypeScript types make user text physically incapable of reaching the model's system role. Prompt injection prevention is a compile error, not a convention.

The storage is S3-compatible (MinIO locally, AWS in production). Versioning on the handbook bucket, encryption on both, date-partitioned event log. The migration story is "swap the endpoint."

The test suite is 304 unit tests with an 80%+ coverage threshold and 114 integration tests against the real Anthropic API — including 20 prompt injection attacks, 19 sensitive-topic escalations, and a full ask-escalate-fix-reask-cite cycle. CI runs 12 automated checks per PR (typecheck, lint, SAST, secrets scanning, dependency audit, container image scanning) plus Claude Code review with 7 specialized agents.

## What comes next

Authentication and per-staff identity. Per-user document routing (the seam exists; a session layer fills it). SSE push so the parent who saw "being reviewed" gets the staff answer in real time instead of on re-ask. A handbook ingestion pipeline so the next annual update isn't a manual extraction.

## The demo

Ask to see three moments: a question the preflight catches before the model runs, one where the post-response pipeline holds a fabricated phone number, and one where the staff member closes the loop and the next parent gets a citation to an override that didn't exist thirty seconds ago.
