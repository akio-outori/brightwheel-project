# AI Front Desk — Albuquerque DCFD

A prototype AI front desk for the City of Albuquerque Division of
Child and Family Development (DCFD). A parent asks a question. The
assistant answers from the real 2019 Family Handbook with a citation,
or — when it isn't sure — hands the question to a staff member and
lets them close the loop in one click. Three layers of deterministic
verification sit between the model and the parent, catching
hallucinations, medical instructions, and fabricated data before anyone
sees them. The whole stack runs locally under Docker: one API key in
`.env`, then `docker compose up`.

## What's interesting about this

- **A preflight classifier that saves the LLM call.** Before the
  model runs, a deterministic regex classifier detects questions about
  a specific child's health, injuries, medication, or custody. The
  parent gets an immediate "a staff member is reviewing this" — no
  model call, no latency, no chance of a confident-but-wrong answer
  about a child's medical situation.
- **A 6-channel post-response verification pipeline.** After the
  model drafts an answer, six deterministic channels inspect it:
  hallucinated citation IDs, fabricated phone numbers, invented staff
  names, medical-instruction shapes, empty coverage, and model
  self-escalation. Any channel hold replaces the draft with a stock
  response. The model's original draft is preserved for the operator
  with a labeled hold reason.
- **A security boundary that's a type system, not a vibe.** User
  questions reach the model only through four branded TypeScript
  types (`SystemPrompt`, `AppIntent`, `MCPData`, `UserInput`) whose
  only legitimate constructors live in one file. Prompt injection
  prevention is enforced at compile time.
- **A two-layer document model.** The seed handbook is immutable
  after load. Operator answers live in a separate overrides layer
  scoped per document. The model is told to prefer overrides. The
  seed never drifts; operator knowledge accumulates in an auditable,
  deletable layer.
- **A closed loop that actually closes.** Staff members see the gaps
  the AI admitted to, fill them in, and the _next_ parent asking
  the same question gets a high-confidence answer with a citation
  pointing to the override — in about fifteen seconds on a
  live demo, no index rebuild, no restart.
- **Real public data, faithfully extracted.** The seed is 73 entries
  from the actual DCFD Family Handbook (2019), a public city
  government publication — real names, real phone numbers, real
  center addresses.

## Try it

### Prerequisites

- Docker with `docker compose` (v2.20+ for the
  `service_completed_successfully` gate)
- An Anthropic API key

### Run it

```bash
git clone <repo>
cd brightwheel-project
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
docker compose up
```

The first boot pulls images, builds the Next.js app, creates the
MinIO buckets, enables SSE-S3 and versioning, and seeds the
handbook into the `documents/{docId}/entries/` layout. Subsequent
boots short-circuit on a sentinel object and take under 10 seconds.

When the stack is ready:

- **Parent surface:** http://localhost:3000
- **Operator console:** http://localhost:3000/admin

### The demo flow

1. On `/`, ask **"What time do you open?"** — a high-confidence
   answer grounded in the hours-of-operation entry.
2. Ask **"My son has a fever, should I bring him in?"** — the
   preflight classifier catches this before the model runs. The
   parent sees "a staff member is reviewing this" instantly.
3. Ask **"How can I schedule a tour?"** — the model runs, can't
   find coverage, self-escalates. A needs-attention event lands
   in the operator feed with the hold reason.
4. Open `/admin`. The events are labeled with hold reasons
   (specific child, model self-escalated, etc.). Click
   **Answer this**, write a short answer, save. The override
   appears and the event resolves in the same tick.
5. Back on `/`, ask **"How can I schedule a tour?"** again —
   high-confidence answer citing the override you just wrote.

## How it's built

- **Stack:** Next.js 15 on a distroless nonroot container, MinIO
  with SSE-S3 and versioning, idempotent init script with
  per-document layout.
- **Storage:** `lib/storage/` — typed adapters for handbook entries
  (read-only), operator overrides (CRUD), and needs-attention
  events. Zod schemas at every boundary. `getActiveDocumentId()`
  is the seam for future per-user document routing.
- **Trust mechanic:** `lib/llm/` — branded input types,
  `buildPrompt()` envelope assembler, Anthropic client wrapper,
  `AnswerContract` schema.
- **Preflight:** `lib/llm/preflight/` — specific-child classifier
  with four pattern groups and a policy-question negative set.
- **Post-response pipeline:** `lib/llm/post-response/` — six
  deterministic channels in short-circuit order.
- **Parent UX:** `app/page.tsx`, `components/parent/` — chat
  interface with citation display and escalation cards.
- **Operator console:** `app/admin/`, `components/operator/` —
  needs-attention feed with hold-reason badges, one-tap fix
  dialog, notification bell.
- **Tests:** 304 unit tests (89% coverage, 80% threshold enforced),
  114 integration tests against the real Anthropic API and MinIO.
- **CI:** 13 automated checks per PR — typecheck, ESLint +
  security plugin, Prettier, unit tests, build, npm audit, Trivy
  (filesystem + container), TruffleHog, Semgrep, Bearer, license
  compliance, Claude Code review with 7 agents.

## Where to read more

- [`docs/build-journal.md`](docs/build-journal.md) — the
  chronological development record.
- [`WRITEUP.md`](WRITEUP.md) — the design pitch.
- [`.claude/agents/`](.claude/agents/) — the 13 subagent specs
  that structured the build. Implementation agents own files,
  review agents enforce invariants, a scribe owns the journal.
