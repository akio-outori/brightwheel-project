# Testing Strategy

## Two test layers

Tests are split by what they verify and what infrastructure they
need:

| Layer | Framework | What it needs | Count | Runs in CI |
|-------|-----------|---------------|-------|------------|
| Unit | Vitest | MinIO (test buckets) | 408 | Every PR |
| Integration | Vitest (separate config) | Real Anthropic API + MinIO | 174 | Manual (`npm run test:integration`) |

## Unit tests (408 tests, 22 files)

### Coverage

80% threshold enforced in `vitest.config.ts` for statements,
branches, functions, and lines. Tests fail if coverage drops
below the threshold.

### What's tested

**Preflight classifier** (231 tests)
Each test exercises a distinct classifier decision path. No
combinatorial padding — every test represents a real question a
parent would ask. Covers possessives, proper names, pronouns,
contractions, euphemisms, policy-question negatives, attendance
verbs, custody patterns.

**Post-response pipeline channels** (70 tests)
Per-channel positive/negative fixtures: hallucination, self-
escalation, coverage, lexical tokenizer, numeric, entities,
medical-shape. Plus pipeline orchestration, stock response helpers,
and suggested-questions tests.

**LLM client** (7 tests)
Valid JSON parsing, code-fence unwrapping, invalid JSON fallback,
schema-invalid fallback, non-text content blocks, SDK exception
propagation, prompt passthrough.

**LLM config loader** (5 tests)
Happy path, missing file, bad JSON, schema failure, missing env var.

**Prompt builder** (11 tests)
System prompt isolation, MCP wrapping, envelope shape, injection
escaping, branded type constructor validation.

**Storage adapters** (26 tests)
Round-trip tests against real MinIO in test buckets: document
metadata, handbook entries (read-only), override CRUD, needs-
attention log/list/resolve, docId filtering, schema validation,
error codes.

**Route handlers** (47 tests across 10 files)
Every API endpoint with mocked dependencies: input validation,
preflight integration, pipeline integration, error handling,
hallucination holds, self-escalation holds, CRUD operations,
404/409/500 paths.

### Running

```bash
npm test                    # all unit tests
npm test -- --coverage      # with coverage report
npm test -- --reporter=verbose  # see every test name
```

## Integration tests (174 tests, 8 files)

These hit the **real Anthropic API** and **real MinIO** against the
seeded handbook. They verify trust-loop behavior end-to-end.

### Suites

| File | Tests | What it verifies |
|------|-------|-----------------|
| accuracy | 43 | Grounded high-confidence answers for handbook topics |
| sensitive | 28 | Medical, injury, custody, emergency questions all escalate |
| injection | 26 | Prompt injection attacks (role hijacking, system prompt extraction, Unicode obfuscation, authority fabrication) |
| grounding | 25 | Literal fact recall (phone numbers, dollar amounts, staff names, addresses, policy thresholds) |
| off-topic | 18 | Out-of-scope questions (weather, recipes, AI meta) declined |
| escalation | 15 | Gap questions (topics the handbook doesn't cover) correctly escalate |
| contract | 13 | Weird inputs (long text, Unicode, Spanish, JSON-shaped, punctuation) produce valid contracts |
| closed-loop | 6 | Full ask → escalate → fix → re-ask → cite cycle (multiple paths + sensitive-override-holds test) |

### Cleanup

The `setupIntegrationTest()` helper wires `afterAll` hooks that:
- Delete any `[test]`-tagged overrides from the overrides layer
- Sweep all needs-attention events from the events bucket
- Reset the in-process document cache

This prevents cross-run state pollution — the failure mode that
originally exposed the need for the two-layer document model.

### Running

```bash
# Requires ANTHROPIC_API_KEY in env + MinIO on localhost:9000
ANTHROPIC_API_KEY=sk-ant-... npm run test:integration
```

### Cost

~$0.50–$1.00 per full run on Sonnet 4.6. Tests run sequentially
(no file parallelism) to avoid rate limiting.

## CI pipeline

13 checks run on every PR to main (plus Claude Code review in a
separate workflow):

| Check | What it catches |
|-------|----------------|
| TypeScript strict | Type errors |
| ESLint + security plugin | Code quality, eval, unsafe regex, timing attacks |
| Prettier | Format consistency |
| Unit tests + coverage | Functional correctness, 80% threshold |
| Next.js build | Build errors |
| npm audit (all severities) | Known CVEs in all deps |
| Trivy filesystem | Dependency CVEs (broader DB) |
| Trivy container image | OS-level CVEs in the Docker image |
| TruffleHog | Leaked credentials |
| Semgrep SAST | OWASP top 10, TS/React/Node.js patterns |
| Bearer SAST | Data flow analysis (input → sink) |
| License compliance | Copyleft detection |
| Claude Code review | 7 specialized agents (typescript, mcp-boundary, trust-loop, security, classifier, tests, product-fit) |

## Key files

- `vitest.config.ts` — unit test config + coverage thresholds
- `vitest.integration.config.ts` — integration test config
- `vitest.setup.ts` — test setup hooks
- `.github/workflows/pr-checks.yml` — CI workflow
- `.github/workflows/claude-review.yml` — Claude review agents
- `lib/__integration__/_helpers.ts` — shared integration helpers + cleanup
