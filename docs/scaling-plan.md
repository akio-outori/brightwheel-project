# AI Front Desk — Product & Scaling Plan

## The product

Every daycare runs differently. Their snow day policy, their late
fee exceptions, their approach to potty training transitions, their
way of handling tour requests — none of this is in the handbook they
printed last August. It lives in the director's head.

The AI Front Desk turns that knowledge into a living, center-specific
intelligence layer. Every time a parent asks a question the handbook
doesn't cover, the director answers it once, and every future parent
gets that answer instantly — grounded, cited, verified. After six
months of daily use, the AI doesn't just know the handbook. It knows
how *this director* runs *this program*.

That's the product. Not a chatbot. Not a handbook search. A
per-center knowledge base that gets smarter every time a parent asks
a question, built entirely from the operator's own expertise.

**Why this is a moat:** Any competitor with an API key can build a
handbook chatbot. None of them can replicate the institutional
knowledge that 50,000 directors have taught their individual AI
front desks over months of daily use. That knowledge compounds
with every answered question, is non-transferable, and belongs to
each center alone.

## Three invariants

Every phase of the scaling plan preserves these:

1. **The trust loop works.** Every answer is grounded, verified,
   and citable — or it's held for a human. No hedging, no
   confident invention.
2. **Child-specific data never enters the knowledge layer.** A
   parent asking about their sick child talks to a human. The
   system's knowledge is program-level policy, not individual
   children. Privacy through absence, not access control.
3. **Per-center intelligence is the unit of value.** No
   cross-center aggregation, no shared knowledge base, no training
   on other programs' data. Each center's AI is theirs alone.

---

## Current state (prototype)

- **Model provider:** Anthropic direct API (Haiku 4.5)
- **Context strategy:** Full handbook + all overrides loaded per
  request (~15-20K tokens)
- **Storage:** MinIO (S3-compatible), per-document prefix layout
- **Verification:** Preflight classifier (pre-model) + 6-channel
  post-response pipeline (post-model), all deterministic
- **Language:** TypeScript (Next.js monolith — frontend + API routes)
- **Auth:** Shared-password cookie middleware
- **Deployment:** Docker Compose (local), Railway (demo)
- **Tests:** 357 unit tests (80%+ coverage), 114 integration tests
  against the real Anthropic API

This architecture handles a single center with <200 entries. The
phases below describe the path to production at scale.

---

## Phase 1 — Production foundation

**Goal:** Ship to real centers on Brightwheel's infrastructure.
No architectural changes to the trust loop.

**Trigger:** Day one.
**Duration:** 2-3 months.
**Team:** 1-2 engineers (Sr. Principal + one Staff eng).

### Bedrock migration

Single-file change. Replace `@anthropic-ai/sdk` in
`lib/llm/client.ts` with `@aws-sdk/client-bedrock-runtime`. The
`buildPrompt` output (system + messages array) maps directly to
Bedrock's `InvokeModel` request body. The agent config system
supports multiple providers — add a `bedrock` path alongside
`anthropic` in the config loader.

What Bedrock provides:

- **Data residency.** Parent questions never leave the VPC. "The
  data never leaves our infrastructure" is a sentence the compliance
  team can put in a SOC 2 narrative.
- **IAM-based auth.** No API keys in environment variables. The
  service assumes an IAM role with `bedrock:InvokeModel` on specific
  model ARNs. Key rotation is automatic.
- **Guardrails.** Bedrock's content filtering layer runs alongside
  the preflight classifier and post-response pipeline. Guardrails
  catches toxicity and PII patterns; the deterministic pipeline
  catches fabricated facts, hallucinated citations, and medical
  instructions. Complementary layers, not redundant ones.
- **Model evaluation.** Bedrock's eval tooling can run alongside
  our integration test suite for A/B testing model upgrades.

What doesn't change: preflight classifier, post-response pipeline,
branded types, answer contract, storage layer, operator loop. All
pure TypeScript, provider-agnostic.

### Storage migration

MinIO → S3. The storage adapter already speaks the S3 API — change
the endpoint env var. Enable SSE-KMS with a customer-managed CMK
(replacing the dev KMS key in docker-compose). Bucket layout, object
keys, and Zod schemas are unchanged.

### Auth

Replace shared-password middleware with Brightwheel's existing auth.
The AI service validates a JWT or session token from the Rails
monolith on protected routes. Parent-facing routes tie to the
parent's Brightwheel session for center routing.

### Multi-center routing

The `getActiveDocumentId()` call is currently a constant. Replace
with a session-based lookup: the parent's Brightwheel session
identifies their center → center maps to a document ID → document
ID scopes all storage reads. The seam exists — `docId` is already
threaded through entries, overrides, and events. Routing change,
not architectural change.

**Capacity at end of Phase 1:** Hundreds of centers, each with its
own handbook and override layer, full-context loading, Bedrock model
calls, S3 storage. No embedding, no retrieval.

---

## Phase 2 — Context compression

**Goal:** Extend the full-context approach to handle larger
handbooks without introducing retrieval.

**Trigger:** First center exceeds ~200 entries.
**Duration:** 1 month.
**Team:** 1 engineer.

### Structured fact representation

Handbook entries are authored prose. A 200-token paragraph might
contain 30-40 tokens of actual facts (hours, phone numbers, dollar
amounts, policy rules, names). Store each entry in two
representations:

- **Display body:** Original prose, shown in citation modals and
  the operator knowledge base.
- **Fact body:** Structured key-value facts, used in the MCP
  envelope sent to the model.

The preferred approach: author in structured format from the start
and generate the prose display version from it. Operators write
facts; the system renders them as natural language. No extraction
pipeline required — a schema change at the authoring layer.

**Token impact:** 4-5x compression. A center with 200 entries
goes from ~80K tokens (prose) to ~15-20K tokens (facts).
Full-context loading remains viable up to ~500 entries per center.

**Verification impact:** The post-response pipeline checks against
fact bodies instead of prose. Tighter source material means tighter
verification — fewer false negatives on fabrication detection.

**Capacity at end of Phase 2:** Hundreds of entries per center
with full-context loading. Large multi-site operators with
location-specific handbooks.

---

## Phase 3 — Retrieval

**Goal:** Handle handbooks that exceed the compressed context
ceiling.

**Trigger:** Multi-site operators onboard, or single-center
knowledge bases grow past ~500 entries.
**Duration:** 2-3 months.
**Team:** 2-3 engineers.

### pgvector

Brightwheel is on Postgres via RDS. pgvector is an extension
install, not a new service.

Embed each entry and override at write time. At query time:

1. **Deterministic context selection first.** Filter by center,
   by location, by program type (infant vs. Pre-K). Scope the
   search space structurally before touching embeddings.
2. **Hybrid retrieval.** Vector similarity + BM25 keyword search
   over the scoped subset.
3. **Top-k results populate the MCP envelope.**

The change is in one place: the MCPData construction in the ask
route. The prompt, the contract, the preflight classifier, the
post-response pipeline — none of them change. They verify whatever
context they're given.

### Post-response pipeline as retrieval safety net

Full-context loading is a natural defense against hallucination
because the model has everything available. Retrieval introduces a
new failure mode: the model confabulates from training data because
the relevant entry wasn't retrieved.

The existing pipeline catches this:
- **Hallucination channel:** "You cited an ID that wasn't in the
  context" — the retrieval-miss signal.
- **Numeric channel:** Fabricated phone numbers or dollar amounts
  the model invented to fill the gap.
- **Entity channel:** Fabricated staff names or place names not in
  any provided source.

The pipeline built for the prototype is the safety net for the
retrieval architecture added later.

### What not to use

Bedrock Knowledge Bases. They handle chunking, embedding, and
retrieval, but they don't support the `directly_addressed_by`
anti-bridging mechanism, the two-layer document model, or the
post-response verification pipeline. Use Bedrock for the model
call. Own the retrieval.

**Capacity at end of Phase 3:** Unlimited entries per center.
Per-center knowledge bases of any size, retrieved efficiently,
verified deterministically.

---

## Phase 4 — Per-center intelligence

**Goal:** Each center's AI becomes an expert on that center.

**Trigger:** 1,000+ centers active.
**Duration:** 3-6 months.
**Team:** 3-4 engineers.

The infrastructure phases above exist to support this one. This
is where the product value compounds.

### Operator-facing intelligence

**Gap analysis.** Surface the questions that escalated most
frequently for *this center* and haven't been addressed by an
override. "Tour scheduling escalated 12 times this month — would
you like to write an answer?" The needs-attention feed already
has this data. Aggregate per center, surface the top unanswered
topics.

**Suggested drafts.** When an operator clicks "Answer this,"
pre-fill from the question and existing handbook context. The
model that can't answer the parent confidently *can* draft a
starting point for the operator. The operator edits and saves.
Draft saves time; human review preserves accuracy.

**Seasonal prompts.** Daycare operations are cyclical. Enrollment
spikes in spring. Illness questions spike in winter. Holiday
closures in November. Prompt operators proactively: "Last
December, parents asked about holiday closures 40 times. Your
handbook covers the policy, but you might want to add your
specific 2027 dates."

**Coverage dashboard.** Show the operator what percentage of
incoming questions their knowledge base handles at high confidence
versus escalation. "87% of parent questions answered automatically
this month, up from 61% in September." That number is the
operator's ROI — visible proof that teaching the AI is worth
their time.

### Parent-facing answers

The parent sees none of the intelligence layer. They see an
answer grounded in the handbook or an override, with a citation,
verified by the pipeline. They don't know or care that the answer
exists because the operator taught it to the system three weeks
ago. They just get the right answer fast.

### What this is not

Not a shared knowledge base. Not cross-center aggregation. Not
a training signal from other programs. Each center's intelligence
is theirs alone, built from their questions, shaped by their
operator's judgment.

The flywheel is local: this center's parents ask, this center's
operator answers, this center's AI gets smarter. Insights for
the operator. Answers for the parent. Same data, different
surfaces.

---

## Phase 5 — Service separation

**Goal:** Extract the AI platform from the Next.js monolith into
a standalone compiled service.

**Trigger:** AI platform team reaches 4+ engineers and monolith
coupling becomes friction.
**Duration:** 2-3 months.
**Team:** Full AI platform team.

### Go service

The AI platform becomes a Go service with its own repo, deploy,
and team. It exposes a small API surface:

| Endpoint | Purpose |
|----------|---------|
| `POST /ask` | Parent question → verified answer |
| `GET /handbook` | Entries + overrides for a document |
| `POST /overrides` | Operator creates a program-level override |
| `POST /events/{id}/resolve` | Operator resolves a needs-attention event |
| `GET /events` | Needs-attention feed |
| `GET /parent-replies` | Polling endpoint for staff reply delivery |

The Rails monolith calls these over HTTP. The frontend is a
separate TypeScript app that also calls these endpoints. The Go
service owns the preflight classifier, the post-response pipeline,
the branded-type boundary (Go interfaces enforce the same
constraints at compile time with no runtime cost), the storage
layer, and the Bedrock client.

### Why Go

The workload is I/O-bound (waiting on Bedrock, not crunching
data). Go's GC pauses are sub-millisecond — invisible against
300-800ms model latency. Single binary deployment. Strong
concurrency model. Mature AWS SDK. Hiring pool is smaller than
Python but larger than Rust, and the readability bar is low enough
that a Ruby or Python engineer can review Go code within a week.

### What stays TypeScript

The frontend. The operator dashboard and parent chat surface are
React components calling the Go service's API. No AI logic in the
frontend.

---

## Privacy architecture (cross-cutting)

One invariant, enforced at every phase:

**Child-specific data never enters the knowledge layer.**

The architecture enforces this through absence, not access control.
The path from child-specific data to the knowledge layer doesn't
exist — not because it's blocked, but because it was never built.

**How it works:** Child-specific questions (possessive + family
noun + health vocabulary, proper name near medical context,
third-person pronouns in health context) are caught by the
preflight classifier and routed to a human. The operator replies
directly to the parent. No override is created. The reply is a
message, not knowledge. It doesn't persist in the retrieval layer,
doesn't get embedded, doesn't compound in the knowledge base.

The general policy ("children with a fever of 100.4 or higher
must stay home for 24 hours") is in the handbook. It's
embeddable, retrievable, citable. The specific situation ("your
son Tommy has a fever, here's what to do") is a conversation
between the operator and the parent. The system handles both —
one through the knowledge layer, one through the messaging layer
— and the boundary between them is structural.

**Why absence, not access control:** Access control says "we have
the data but restrict who can see it." Access control fails when
someone misconfigures a role, when a breach dumps the database,
when an acquisition changes the privacy policy, when a government
subpoenas the records. Absence doesn't fail because there's
nothing to breach, misconfigure, subpoena, or sell.

**Phase-by-phase enforcement:**

| Phase | How the invariant holds |
|-------|------------------------|
| 1 | Preflight classifier holds child-specific questions. Operator replies directly. No override path offered. |
| 2 | Structured facts extracted from program-level entries only. Overrides are program-level by design. |
| 3 | pgvector embeds entries and program-level overrides only. Child data was never in the override layer. |
| 4 | Per-center intelligence built from overrides, which are program-level. Coverage dashboards count questions, not children. |
| 5 | Go service enforces the same boundary. Classifier, override schema, and embedding pipeline carry the invariant forward. |

---

## Sequencing summary

| Phase | What the operator gets | What we build | Capacity |
|-------|----------------------|---------------|----------|
| 1 — Foundation | Their center has its own AI front desk, live on Brightwheel's infrastructure | Bedrock, S3, auth, multi-center routing | Hundreds of centers |
| 2 — Compression | The knowledge base handles more topics without slowing down | Structured fact representation at authoring time | ~500 entries/center |
| 3 — Retrieval | The knowledge base can grow without limits | pgvector, hybrid search, deterministic pre-filtering | Unlimited entries/center |
| 4 — Intelligence | The system tells them what to teach it next, drafts answers for them, and proves its own ROI | Gap analysis, suggested drafts, seasonal prompts, coverage dashboard | 50,000 centers, each getting smarter |
| 5 — Separation | Faster, more reliable, independently scalable | Go service, API contracts, separate deploy | Platform scale |

Each phase is additive. Nothing gets thrown away. The trust loop,
the verification pipeline, and the privacy invariant carry forward
at every phase. The per-center knowledge base — the product — gets
deeper and more valuable at every phase.
