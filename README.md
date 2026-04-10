# AI Front Desk — Albuquerque DCFD

A prototype AI front desk for the City of Albuquerque Division of
Child and Family Development (DCFD). A parent asks a question. The
assistant answers from the real 2019 Family Handbook with a citation,
or — when it isn't sure — hands the question to a staff member and
lets them close the loop in one click. The whole stack runs locally
under Docker: one API key in `.env`, then `docker compose up`.

The point of this project isn't "wraps a handbook in a chatbot." It's
the **trust loop**: we have to get the answer right, _and_ we have to
be able to show that we did, _and_ when we can't, the next parent
still gets the right answer instead of the same wrong one.

## What's interesting about this

- **A security boundary that's a type system, not a vibe.** User
  questions reach the model only through four branded TypeScript
  types (`SystemPrompt`, `AppIntent`, `MCPData`, `UserInput`) whose
  only legitimate constructors live in one file. Prompt injection
  prevention is enforced at compile time: a cast outside
  `lib/llm/types.ts` is a reviewable defect, not a whistle in the
  wind.
- **A structured answer contract.** Every response is a
  Zod-validated `AnswerContract` with `confidence`, `cited_entries`,
  and `escalate` fields. Free-text answers from the model are a bug.
  A malformed response becomes a graceful escalation, never a 500.
- **A closed loop that actually closes.** Staff members see the gaps
  the AI admitted to, fill them in, and the _next_ parent asking
  the same question gets a high-confidence answer with a citation
  pointing to the brand-new entry — in about fifteen seconds on a
  live demo, no index rebuild, no restart.
- **S3 primitives, not a hand-rolled KV store.** Versioning on the
  handbook bucket, SSE-S3 on both buckets, date-partitioned event
  log. The migration story to AWS is "swap the endpoint."
- **Real public data, faithfully extracted.** The seed is 73 entries
  from the actual DCFD Family Handbook (2019), a public city
  government publication — real names, real phone numbers, real
  center addresses. The trust loop isn't a story; it's something
  you can demo against real source material.

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
handbook. Subsequent boots short-circuit on a sentinel object and
take under 10 seconds.

When the stack is ready:

- **Parent surface:** http://localhost:3000
- **Operator console:** http://localhost:3000/admin

### The demo flow

1. On `/`, ask **"What time do you open?"** → a high-confidence
   answer with citation pills pointing at the specific hours
   entries. Click a pill to see the underlying handbook entry.
2. Ask **"How can I schedule a tour?"** → the assistant escalates
   (the handbook doesn't cover prospective-family tours) and a
   needs-attention event lands in the feed.
3. Open `/admin`. The unanswered question is at the top of the feed,
   with the assistant's draft preserved.
4. Click **Answer this**. Fill in a title, pick a category, write a
   short answer, save. The event disappears from the feed and the
   new entry appears in the handbook list in the same render tick.
5. Back on `/`, ask **"How can I schedule a tour?"** again. This
   time it's a high-confidence answer, citing the entry you just
   wrote — no restart, no index rebuild.

That last step is the whole point. A sensitive-topic question
(anything about fever, injury, medication, custody) also always
escalates, regardless of what the model would say on its own.

## How it's built

Five layers, each a single commit on `main`:

1. **Stack** (`docker-compose.yml`, `Dockerfile`,
   `docker/minio-init/`) — Next.js 15 standalone build on
   `node:20-slim`, MinIO with built-in KMS for SSE-S3, an
   idempotent init container with date-partitioned event keys.
2. **Storage adapter** (`lib/storage/`) — the only code in the
   project that talks to MinIO. Zod schemas, typed `StorageError`,
   lazy-memoized client, full round-trip tests against a live
   bucket.
3. **Trust mechanic** (`lib/llm/`) — branded input types, the
   `buildPrompt()` envelope assembler (the only emitter of
   `<mcp_message>` tags), the Anthropic client wrapper, the
   `AnswerContract` schema, static sensitive-topic detection, and
   the `lib/llm/system-prompts/parent.md` system prompt loaded as
   application code.
4. **Parent UX** (`app/page.tsx`, `app/api/ask/route.ts`,
   `components/parent/`) — a two-branch render (AnswerCard or
   EscalationCard, no third path), clickable citation pills, a
   modal that opens the cited handbook entry.
5. **Operator console** (`app/admin/`, `app/api/handbook/`,
   `app/api/needs-attention/`, `components/operator/`) — the
   needs-attention feed as the headline, the one-tap fix dialog
   that closes the loop in two API calls and a single `mutate()`
   round.

Tests run in two layers, matched to what they're verifying: the
storage adapter hits a live MinIO in a dedicated test bucket to
catch SDK-shape drift, and the LLM boundary uses an injected fake
Anthropic client to assert the prompt envelope, JSON parsing, and
failure modes without burning real tokens. The closed-loop
end-to-end test (ask → escalate → fix → re-ask → cite) runs
against a real Anthropic key and is documented in the build
journal as a reproducible script.

## Where to read more

- [`docs/build-journal.md`](docs/build-journal.md) — the
  chronological development record. Every layer, every decision,
  every reversal (including the two mid-build reversals: bind
  mount → custom image for the init container, and scrubbing →
  real data for the seed).
- [`WRITEUP.md`](WRITEUP.md) — the one-page design pitch.
- [`.claude/agents/`](.claude/agents/) — the 12 subagent specs
  that structured the build. Implementation agents own files,
  review agents enforce invariants, a scribe owns the journal.
  The agent infrastructure is part of the deliverable — it's the
  thing that made the build disciplined.
