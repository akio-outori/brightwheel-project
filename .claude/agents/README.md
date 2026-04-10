# Brightwheel AI Front Desk — Subagents

This directory contains specialized Claude Code subagents for the AI
Front Desk prototype. Each agent has a focused responsibility, a tight
tool surface, and a system prompt that encodes the project's invariants
for its scope.

The agents are *part of the deliverable*. An interviewer reading the
repo can learn how the project is structured to be built, not just what
got built — which is itself the answer to the brief's "would this
excite a team to fund and build for real?" question.

## Three categories

| Category | Purpose | Tool surface | Edits code? |
|----------|---------|--------------|-------------|
| **Implementation** | Build a specific component or document | Read, Write, Edit, Bash, Glob, Grep | Yes |
| **Review** | Audit a diff or run the verification chain; report findings | Read, Grep, Glob (sometimes Bash for typecheck/test/docker) | **No** |
| **Scribe** | Maintain the build journal | Read, Write, Edit, Glob (scoped to `docs/build-journal.md`) | Journal only |

The split is deliberate. Reviewers that can also edit start papering
over their own findings. Implementers that try to also be reviewers
miss things they're too close to. The scribe exists because journal
entries get skipped under build pressure — exactly when they matter
most.

## Roster

### Implementation (5)

| File | Owns |
|------|------|
| [`impl-storage.md`](impl-storage.md) | MinIO buckets, init script, handbook schema, TS storage adapter |
| [`impl-trust-mechanic.md`](impl-trust-mechanic.md) | Branded input types, `buildPrompt()`, Anthropic client wrapper, `AnswerContract`, system prompts |
| [`impl-parent-ux.md`](impl-parent-ux.md) | `/`, chat UI, `/api/ask`, citation pills, escalation card, sensitive-topic handling |
| [`impl-operator-ux.md`](impl-operator-ux.md) | `/admin`, handbook editor, needs-attention feed, one-tap fix, `/api/handbook`, `/api/needs-attention` |
| [`impl-docs.md`](impl-docs.md) | `README.md`, `WRITEUP.md`, anything under `docs/` other than the build journal |

### Review (7)

| File | Enforces |
|------|----------|
| [`review-mcp-boundary.md`](review-mcp-boundary.md) | The four-input-type security pattern. Only `SystemPrompt` is rendered raw; all other content is wrapped in `<mcp_message>` tags. Prevents prompt injection at the type-system level. |
| [`review-trust-loop.md`](review-trust-loop.md) | The thesis. Every parent answer cites + has confidence; low-confidence escalates; sensitive topics never assert; the operator console actually closes the loop. |
| [`review-typescript.md`](review-typescript.md) | TypeScript idioms — no `any`, schema-validated boundaries, error handling at boundaries only, exhaustive switches, no dead code. |
| [`review-security.md`](review-security.md) | OWASP web security — XSS, input validation, error information leakage, SSRF, dependency vulnerabilities, content security headers. Covers the general web attack surface beyond the LLM-specific boundary. |
| [`review-classifier.md`](review-classifier.md) | Deterministic classifier correctness — preflight specific-child patterns, post-response pipeline channels, regex precision, false positive/negative analysis, threshold sanity, health vocabulary completeness. |
| [`review-tests.md`](review-tests.md) | The verification chain — typecheck, lint, unit tests, `docker compose up`, and the closed-loop end-to-end smoke check. The gate before any "done." |
| [`review-product-fit.md`](review-product-fit.md) | The Brightwheel lens. Would this excite a team to fund and build for real? Voice, warmth, taste, demo emotional resonance. Audits all user-visible copy and the writeup. |

### Scribe (1)

| File | Owns |
|------|------|
| [`scribe-journal.md`](scribe-journal.md) | `docs/build-journal.md`. Drafts entries when decisions are made or components ship, in the established voice, for the main thread to review. |

## Selection matrix

When the main thread is about to delegate work, this table answers
"which agent runs first, which agents review the result?"

| Path / change | Primary | Required reviewers |
|---------------|---------|---------------------|
| `lib/storage/**`, `data/**`, `docker/minio-init/**` | `impl-storage` | `review-typescript`, `review-security`, `review-tests` |
| `docker-compose.yml` (storage services), `docker/**` | `impl-storage` | `review-tests` |
| `lib/llm/**` (excluding `post-response/`, `preflight/`) | `impl-trust-mechanic` | `review-mcp-boundary`, `review-typescript`, `review-tests` |
| `lib/llm/post-response/**`, `lib/llm/preflight/**` | `impl-trust-mechanic` | `review-classifier`, `review-typescript`, `review-tests` |
| `app/page.tsx`, `app/(parent)/**`, `components/parent/**` | `impl-parent-ux` | `review-trust-loop`, `review-security`, `review-typescript`, `review-product-fit`, `review-tests` |
| `app/api/ask/**` | `impl-parent-ux` | `review-mcp-boundary`, `review-classifier`, `review-trust-loop`, `review-security`, `review-typescript`, `review-tests` |
| `app/admin/**`, `components/operator/**` | `impl-operator-ux` | `review-trust-loop`, `review-security`, `review-typescript`, `review-product-fit`, `review-tests` |
| `app/api/handbook/**`, `app/api/needs-attention/**`, `app/api/overrides/**` | `impl-operator-ux` | `review-trust-loop`, `review-security`, `review-typescript`, `review-tests` |
| `README.md`, `WRITEUP.md`, `docs/**` (except journal) | `impl-docs` | `review-product-fit`, `review-tests` (verifies setup steps) |
| `package.json`, `package-lock.json` | — | `review-security` (dependency audit) |
| Any non-trivial decision in conversation | — | `scribe-journal` |
| A component shipping (impl agent reports done) | — | `scribe-journal`, `review-tests` |
| Final pre-demo gate | — | `review-tests`, `review-product-fit` |

The reviewers run *after* the implementation agent reports it's done
with self-review, not as a substitute for it. Implementation agents
are expected to invoke their relevant reviewers themselves before
reporting back to the main thread.

## How agents are used

### For implementation work

1. The main thread identifies which component a task belongs to and
   delegates to the matching `impl-*` agent.
2. The implementation agent does the work, runs `npm run typecheck`
   and any local checks, and **invokes the reviewers listed in its
   self-review section** before reporting back.
3. The implementation agent reports back with a summary of what it
   built and what the reviewers found.
4. The main thread spot-checks, asks for revisions if needed, and
   commits.

### For review work

Reviewers are read-only. They run on a diff (or on a freshly modified
file set), produce findings in the structured reporting format
defined in their spec, and exit. The reviewer never edits the code
it reviewed — it reports, and the main thread (or the original
implementer) decides what to act on.

`review-tests` is a slightly different shape: it doesn't review a
diff, it runs the project. But it follows the same discipline —
report failures, never fix them.

### For journal work

`scribe-journal` is invoked whenever a decision is made or a
component ships. It drafts an entry in the established voice and
reports back with a summary; the main thread reviews and the entry
is committed.

## Shared conventions (apply to every agent)

These are baked into every agent's system prompt; listing them here
for transparency.

1. **Never import or reference code from `~/Documents/eadier/` or the
   `@eadieitsolutions/*` npm scope.** Patterns are fair to learn from
   privately, but every line in this repo is written fresh.
2. **The four-input-type discipline is load-bearing.** Any LLM call
   assembles its prompt via `buildPrompt(systemPrompt, intent, data,
   userInput)` — no exceptions, no inline string concatenation, no
   `as` casts to launder types.
3. **Structured output only on the parent path.** Free-form text
   responses from the model are a bug. Every parent-facing call
   returns a schema-validated `AnswerContract`.
4. **Mobile-first.** Every UI change is verified at 375px viewport
   before wide.
5. **Update the build journal when a non-trivial decision is made.**
   Either inline, or hand it off to `scribe-journal`.
6. **No new external dependencies without surfacing it to the main
   thread.** The dependency list is part of the design.
7. **Errors propagate inside trusted code, translate at boundaries.**
   No swallowed errors, no defensive validation in trusted paths.
8. **A thing is not done until `review-tests` says it is.** Local
   checks passing isn't enough — the docker stack must come up
   clean and the closed-loop e2e smoke check must pass.

## Related documentation

- [`docs/build-journal.md`](../../docs/build-journal.md) — the
  chronological development record
- [`README.md`](../../README.md) — project overview and one-command
  setup *(written during the polish step)*
- [`WRITEUP.md`](../../WRITEUP.md) — the design pitch *(written
  during the polish step)*
