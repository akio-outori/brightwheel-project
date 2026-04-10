# AI Front Desk — Design Pitch

A parent types a question into a daycare front desk on a Sunday
night. The model might know the answer — or it might confidently
make one up. The question the product has to answer isn't "can an
LLM answer this?"; it's **"when it gets this wrong, how does the
next parent get it right?"** Every decision in this prototype is
in service of closing that loop in public, not papering over it.

## The thesis: three layers of defense

Most LLM demos fail one test: _show me the question you got
wrong, and what happens next_. The typical answer is "add it to
training data," "RAG better," or "escalate to a human" — shrugs
dressed as roadmaps.

This prototype answers it with three concrete layers:

### Layer 1 — Preflight: before the model sees it

A deterministic classifier runs on the parent's question _before_
the LLM is called. It detects questions about a specific child's
medical situation, injuries, custody concerns, and medication
requests using structural pattern matching — possessives, proper
names near health vocabulary, pronoun contractions, attendance-
decision verbs. General policy questions ("what is the fever
policy?") pass through; specific-child questions ("my son has a
fever") are held immediately. The parent sees a warm "a staff
member is reviewing this" card. No model call, no cost, no
latency, no chance the model generates a confident-but-wrong
answer about a child's health.

### Layer 2 — Post-response pipeline: after the model drafts, before the parent sees it

Six deterministic channels inspect the model's draft answer in
short-circuit order:

1. **Hallucination check** — every cited source ID must exist in
   the document. Fabricated IDs collapse the response.
2. **Self-escalation passthrough** — if the model says "a human
   should see this," we respect it.
3. **Coverage gate** — if the model cites nothing and addresses
   nothing, it has no grounded content to offer.
4. **Medical-instruction shape** — patterns that detect the model
   directing a parent to administer medication, keep a child home
   for a specific duration, or go to the ER.
5. **Numeric absence** — every phone number, dollar amount, and
   temperature in the draft must appear verbatim in the document.
   Fabricated numbers are caught deterministically.
6. **Entity absence** — every proper name, place name, and
   organization the model mentions must trace back to the source.

When any channel holds, the parent sees the stock "being reviewed"
response. The model's original draft is preserved in the operator
feed with a labeled hold reason, so the operator knows _why_ the
system flagged it and can make a fast judgment call.

We built a seventh channel (lexical grounding via token recall),
ran it against the full integration suite, found that legitimate
paraphrases scored 0.28–0.53 — overlapping with partial
hallucinations — and deactivated it. The code and tests are on
disk. A disabled channel with a documented reason is better than a
threshold that holds good answers.

### Layer 3 — Closed loop: when neither layer is enough, a human closes the gap

The original thesis, still the demo moment. When the assistant
doesn't know something, it says so, with a calm escalation card
that names why. The unanswered question lands in a staff feed with
the model's draft and the hold reason. A staff member clicks
_Answer this_, writes two sentences, and the **next parent asking
the same question gets a high-confidence answer citing the entry
the staff member just wrote** — about fifteen seconds, no index
rebuild, no restart. That's the demo.

Staff answers land in an **operator overrides** layer that sits on
top of the immutable seed document. The model is told to prefer
overrides when they directly address the question. The seed
handbook never changes after load; operator knowledge accumulates
in a separate, auditable, deletable layer.

## What I built

- A **preflight specific-child classifier** with four pattern
  groups, a policy-question negative set, and 160+ targeted unit
  tests covering possessives, proper names, pronouns,
  contractions, euphemisms, and edge cases.
- A **6-channel post-response verification pipeline** with
  per-channel unit tests and a pipeline integration test.
- A **two-layer document model** (immutable seed entries +
  mutable operator overrides) scoped per document, with the
  `getActiveDocumentId()` seam for future per-user routing.
- A **four-input-type security boundary** (`SystemPrompt`,
  `AppIntent`, `MCPData`, `UserInput`) — prompt injection
  prevention as a compile error, not a hope.
- A **Zod-validated answer contract** with `confidence`,
  `cited_entries`, `directly_addressed_by`, `escalate`. Malformed
  model output becomes a graceful escalation, never a 500.
- **73 real entries** extracted from the DCFD Family Handbook
  (2019) — real names, phone numbers, center addresses.
- **S3 primitives on MinIO** (versioning, SSE-S3, date-partitioned
  event log). Migration to AWS is "swap the endpoint."
- An **operator notification bell** with browser Notifications API
  and hold-reason badges on every escalation event.
- **304 unit tests** across 16 files at 89% statement coverage
  with an 80% threshold enforced in CI.
- **114 integration tests** hitting the real Anthropic API and
  MinIO, including 20 prompt injection attacks, 19 sensitive-topic
  escalations, 25 grounded-answer accuracy checks, 15 literal
  fact recalls, and a 3-test closed-loop cycle.
- **CI with 13 automated checks**: typecheck, ESLint + security
  plugin, Prettier, unit tests with coverage, production build,
  npm audit (all severities), Trivy filesystem scan, TruffleHog
  secrets scan, Semgrep SAST, Bearer SAST, license compliance,
  Trivy container image scan, and Claude Code review with 7
  specialized agents.

**Out, and why:**

- **Auth.** Day one of the real build. Doesn't change the thesis.
- **SSE push-back to the parent.** The parent who saw the "being
  reviewed" card re-asks later and gets the override. Production
  would add SSE for real-time delivery. Documented, not built.
- **Streaming, delete buttons, multi-turn memory.** Optimizations
  or distractions from the loop. Explicit cuts, not omissions.

## A note on prompt injection

Four branded TypeScript types make user text physically incapable
of reaching the system role — any bypass is a compile error. The
two smallest files in the repo,
[`lib/llm/types.ts`](lib/llm/types.ts) and
[`lib/llm/prompt-builder.ts`](lib/llm/prompt-builder.ts), carry
the most weight.

## What I'd build next

- **Auth + an org model.** Staff sessions, per-entry authorship,
  audit trail.
- **Per-user document routing.** The `getActiveDocumentId()` seam
  is ready; a session layer picks the document from user metadata.
- **Custody/AI-meta preflight patterns.** Currently caught by
  model self-escalation (defense in depth works); moving them to
  the preflight layer saves the LLM call.
- **Bedrock + customer-managed KMS.** One file changes.
- **A handbook ingestion pipeline** for future PDFs. The 2019
  extraction was one-off; the next release shouldn't be.

---

If you want to see it land: ask me to walk through a parent
question that the preflight catches before the model runs, one
where the post-response pipeline holds a hallucinated phone
number, and one where the staff member closes the loop and the
next parent gets a citation to an override that didn't exist
thirty seconds ago. Three layers, one demo.
