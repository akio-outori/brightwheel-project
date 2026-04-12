# AI Front Desk — Sunflower Early Learning

An AI that earns parent trust by never guessing: every answer is grounded in a real handbook, every gap is routed to a real person, and every claim is verified before the parent sees it.

A prototype AI front desk for a fictional family-owned preschool,
Sunflower Early Learning in Austin, TX. Parents ask questions about
the program. The assistant answers from the Family Handbook with
citations, or hands the question to a staff member who closes the
loop in one click. Three layers of deterministic verification sit
between the model and the parent.

The handbook is fictional content modelled after real public daycare
documentation — 37 entries covering hours, tuition, health policies,
enrollment, curriculum, and staff. Making it fictional (rather than
scraping a real center's handbook) lets the trust loop run against
named staff and specific phone numbers without putting real people
in a demo app; the verification pipeline still catches wrong facts
the same way it would against real content.

## Quick start

### Prerequisites

- Docker with `docker compose` (v2.20+)
- An Anthropic API key

### Run it

```bash
git clone <repo>
cd brightwheel-project
cp .env.example .env        # set ANTHROPIC_API_KEY=sk-ant-...
docker compose up
```

First boot seeds the handbook into MinIO and builds the Next.js app.
Subsequent boots take under 10 seconds.

| Surface          | URL                         |
| ---------------- | --------------------------- |
| Parent chat      | http://localhost:3000       |
| Operator console | http://localhost:3000/admin |

### Demo flow

1. Ask **"What time do you open?"** — grounded answer with citations
2. Ask **"My son has a fever, should I bring him in?"** — preflight
   classifier holds instantly (no model call)
3. Ask **"Do you offer a military discount?"** — model runs, finds
   nothing in the handbook, self-escalates; event appears in the
   operator feed
4. Open `/admin`, click **Answer this parent**, write two sentences,
   optionally check "Also add to handbook" — override created, event
   resolved, and the reply is delivered back to the parent's chat in
   real time as a "Reply from staff" bubble
5. Re-ask the military-discount question — if you checked the
   handbook box, a high-confidence answer citing the override you
   just wrote

### Development

```bash
npm install
npm run dev              # Next.js dev server (needs MinIO running)
npm test                 # 304 unit tests with coverage
npm run test:integration # 114 tests against real Anthropic + MinIO
npm run typecheck        # TypeScript strict
npm run lint             # ESLint + security plugin
```

## Architecture

```
Parent question
  │
  ├─ Preflight classifier (lib/llm/preflight/)
  │   Catches specific-child health/safety questions before the LLM
  │
  ├─ LLM call (lib/llm/client.ts → Anthropic SDK)
  │   Branded types enforce the MCP security boundary
  │
  └─ Post-response pipeline (lib/llm/post-response/)
      6 deterministic channels verify the draft before the parent sees it
      │
      ├─ PASS → parent sees the grounded answer
      └─ HOLD → parent sees "a staff member is reviewing this"
                operator sees the draft + hold reason
```

## Documentation

Detailed engineering docs for each subsystem:

| Document                                                 | Covers                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Trust mechanic & MCP boundary](docs/trust-mechanic.md)  | Four branded input types, prompt assembly, the `AnswerContract`, prompt injection prevention |
| [Preflight classifier](docs/preflight-classifier.md)     | Specific-child detection, pattern groups, policy-question negatives, calibration             |
| [Post-response pipeline](docs/post-response-pipeline.md) | Six deterministic channels, short-circuit architecture, stock responses, hold reasons        |
| [Document model & storage](docs/document-model.md)       | Two-layer architecture (seed entries + operator overrides), MinIO layout, storage adapters   |
| [Operator loop](docs/operator-loop.md)                   | Needs-attention feed, fix dialog, override CRUD, hold-reason badges                          |
| [Testing strategy](docs/testing-strategy.md)             | Unit tests, integration tests, coverage thresholds, CI pipeline                              |
| [Deployment & infrastructure](docs/deployment.md)        | Docker stack, distroless runner, MinIO init, CI workflows, security scanning                 |
| [Design pitch](docs/writeup.md)                          | The product thesis for reviewers who won't read source code                                  |
| [Build journal](docs/build-journal.md)                   | Chronological development record — every decision, every reversal                            |
