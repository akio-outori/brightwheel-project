# Review pass — consolidated findings and remediation plan

**Branch:** `review/pass` off main HEAD `8be4a21`
**Date:** 2026-04-11
**Agents run:** review-typescript, review-trust-loop, review-tests, review-security, review-product-fit, review-mcp-boundary, review-classifier

**Overall verdict:** The verification chain is green (357 tests pass, all four coverage metrics above threshold). No P0 correctness defects found. **Two** trust-loop P0 issues, **one** classifier P1 bug with confirmed false positives on real user questions, several P1 security hardening items needed before any production deployment, and a concrete punch list of P1 product-fit copy that would embarrass in a demo.

Individual agent reports are in the same directory as this summary.

---

## P0 — must fix before the next demo

### T1. High-confidence answer renders "Verified policy" without any citation pill
**Agent:** review-trust-loop
**Files:** `components/parent/ParentChat.tsx:85`, `components/chat/ChatMessage.tsx:147–181`, `lib/llm/post-response/channels/coverage.ts:27–41`

`contractToMessage` emits `type: "answer"` when `cited_entries.length > 0`, but a model that returns `cited_entries=[]` with a non-empty `directly_addressed_by` passes the coverage channel and reaches the parent with the green "Verified policy" badge and no clickable pills. Invariant 1 (every answer cites its source) is silently breakable.

**Fix:** in `contractToMessage`, require `cited_entries.length > 0` for the answer branch. Otherwise escalate or render with an explicit "no source available" state.

### T2. Classifier pattern bug holds real enrollment questions
**Agent:** review-classifier
**File:** `lib/llm/preflight/specific-child.ts:73`

`POSSESSIVE_CHILD_PATTERNS[1]` is compiled with the `i` flag, which causes `[A-Z]` to match lowercase. Combined with `doctor`/`pediatrician` in HEALTH_WORDS, this produces confirmed false positives:

- "What does my pediatrician need to sign?" → held
- "Do I need my doctor to sign the form?" → held

These are routine enrollment questions the classifier should let pass. Every parent filling out enrollment paperwork hits this.

**Fix:** one-character change — remove the `i` flag from line 73.

### P1. "May be ready" escalation sub-copy
**Agent:** review-product-fit
**File:** `components/chat/ChatMessage.tsx:139`

"We'll follow up by phone, or you can ask again later and your answer may be ready." The phrase "may be ready" implies the system isn't sure the follow-up will actually happen. A parent who just asked something sensitive reads this as a maybe. This is the one piece of escalation copy that could make a reviewer wince — flagging as P0 because it's the emotional hinge of the escalation path.

**Fix:** "Someone from our team will follow up with you. You can also reach us directly at {CENTER.phone}."

### P2. "override" engineering vocabulary visible in the operator UI
**Agent:** review-product-fit
**Files:** `components/operator/KnowledgePanel.tsx:234–235` (amber badge), `components/operator/KnowledgePanel.tsx:391` ("Create override" button label)

Directors don't create "overrides" — they answer questions or add things they know. "Override" is the codebase's internal concept name and should never reach operator-facing copy.

**Fix:** button → "Add to handbook" or "Save answer." Badge → "staff-added" or "your answer" or drop entirely.

---

## P1 — should fix before next merge

### Trust-loop (T3–T5)

**T3.** Dead `"uncertain"` type in `ChatMessageData` union. No rendering branch exists. If any future code path produces it, the bubble silently renders as a plain white answer bubble with no confidence or escalation markers — defeats Invariants 2 and 3 latently.
**File:** `components/chat/ChatMessage.tsx:80`
**Fix:** remove from union, or add exhaustive check.

**T4.** Operator sees raw entry IDs as citation pills instead of titles. `QuestionLogPanel` never resolves IDs via `/api/handbook`.
**File:** `components/operator/QuestionLogPanel.tsx:234–249`
**Fix:** fetch `/api/handbook` in `OperatorDashboard`, pass an id→title map into `QuestionLogPanel`, and make the pills clickable modals consistent with the parent-facing citation interaction.

**T5.** Legacy `/api/needs-attention/[id]` POST resolves events without an `operatorReply`. A manual-path resolve via this endpoint leaves the parent waiting forever on the polling loop.
**File:** `app/api/needs-attention/[id]/route.ts:45`
**Fix:** add `operatorReply` to the schema, or mark the route as deprecated with a clear comment.

### TypeScript discipline (TS1–TS5)

**TS1.** Duplicate local `AnswerContract` and `NeedsAttentionEvent` interfaces in `OperatorDashboard.tsx:44–60` and `QuestionLogPanel.tsx:27–44`. Missing `refusal`, `directly_addressed_by`, `docId` fields. Silently diverge from the real types.
**Fix:** import canonical types from `@/lib/llm/contract` and `@/lib/storage/types`.

**TS2.** `as string` assertion on `entry.id` at `lib/storage/init.ts:134` — defeats the one place this codebase otherwise avoids unchecked casts.
**Fix:** tighten `SeedFileSchema` to include `id: z.string().min(1).regex(...)`.

**TS3.** `as Anthropic` in `lib/llm/client.ts:40–42` test hook on a production code path, no `NODE_ENV` guard. Also flagged by review-mcp-boundary.
**Fix:** add `process.env.NODE_ENV === "production"` throw, and explicit eslint-disable comment.

**TS4.** `reply: e.operatorReply` in `app/api/parent-replies/route.ts:64–69` emits `string | undefined` even though the filter guarantees `string`. Client uses it unchecked.
**Fix:** define `ResolvedEventWithReply` type where `operatorReply` is non-optional; return that from `getResolvedEventsWithReplies`.

**TS5.** `needs_attention_event_id` added to `/api/ask` response with no type. Client reads it via `"needs_attention_event_id" in raw` manual check.
**Fix:** define `AskResponse` type as a typed envelope, export it, have both route and client reference.

### Security (S1–S4)

**S1.** **No security response headers.** No CSP, X-Frame-Options, X-Content-Type-Options, or HSTS. `next.config.mjs` has no `headers()` export.
**Attack:** clickjacking on `/admin`, MIME sniffing, no HTTPS enforcement.
**Fix:** add `headers()` export to `next.config.mjs`.

**S2.** **Operator console is fully unauthenticated.** Any visitor can discover `/admin` via the "Staff portal" link in the parent UI, hit the write routes, and inject operator-reply text that surfaces directly to real parents via the polling channel. The docs-noted "No auth: this is a demo" is correct, but the injection-via-polling specific risk is worth flagging explicitly as a production blocker.
**Files:** all routes under `app/api/overrides/` and `app/api/needs-attention/.../resolve-with-entry/route.ts`
**Fix:** add Next.js `middleware.ts` with session check (`iron-session` or `next-auth`) before any `/api/` route on the operator surface. `/api/ask` and `/api/parent-replies` stay public.

**S3.** `requireEnv` at `lib/storage/client.ts:19–27` throws messages naming environment variables. Latent leakage — not currently reaching HTTP responses because of the catch in the routes, but a future route that skips the catch would leak the name.
**Fix:** generic message, log stack server-side only.

**S4.** `trivy-action@master`, `trufflehog@main`, `semgrep-action@v1`, `bearer-action@v2` in `.github/workflows/pr-checks.yml` pin to mutable branch/version refs. Supply-chain risk on a workflow that has access to `ANTHROPIC_API_KEY`.
**Fix:** pin to specific commit SHAs.

### MCP boundary (M1)

**M1.** `SystemPrompt` is constructed per-request from a runtime-loaded config string. The constructor accepts any non-empty string; future interpolation could silently land per-request data in the system role.
**File:** `app/api/ask/route.ts:138,164`
**Fix:** lift `SystemPrompt(cfg.systemPrompt)` to module initialization (same pattern as `INTENT`).

### Classifier (C1–C2)

**C1.** Medical-shape `give him/her` over-fires on staff-as-subject policy paraphrases. "Staff will give him his EpiPen from the classroom" is held incorrectly.
**File:** `lib/llm/post-response/channels/medical-shape.ts:28`
**Fix:** scope the bare-pronoun arm to second-person subject only.

**C2.** Missing medical vocabulary: `administer`, `inject`. Model draft "administer the EpiPen to him immediately" triggers neither medical-shape nor any preflight group.
**Files:** `lib/llm/post-response/channels/medical-shape.ts:28`, `lib/llm/preflight/specific-child.ts:40`
**Fix:** extend HEALTH_WORDS and medical-shape patterns.

### Product-fit copy (PF1–PF5)

**PF1.** "Knowledge Base" is SaaS vocabulary. Tab label + panel header should be "Handbook."
**Files:** `OperatorDashboard.tsx:28`, `KnowledgePanel.tsx:176`

**PF2.** Third stat card layout ("By staff" / "answered") parses awkwardly. Suggested: label "Staff answered," sublabel "this session."
**File:** `OperatorDashboard.tsx:139`

**PF3.** User messages show static "P" avatar. Either capture a first name at session start or drop the avatar.
**File:** `ParentChat.tsx:267`

**PF4.** Bell dropdown empty state is flat (three separate pieces of copy, none earning the emotional beat).
**File:** `OperatorDashboard.tsx:284–290`

**PF5.** KnowledgePanel error state ("Make sure the backend is running") addresses developers, not directors.
**File:** `KnowledgePanel.tsx:117`

---

## P2 — nitpicks and hardening

**Z-order and cache hygiene**
- TS6: `JSON.parse` in `minio-json.ts::readJson` — reminder to always validate at call sites.
- TS7: `chunk as Buffer` in `minio-json.ts:22` — narrow or `Buffer.from`.
- TS8: `.catch(() => {})` on handbook fetch in `ParentChat.tsx:177` — log the warning.
- TS9: `console.log` in `lib/storage/init.ts` and `lib/llm/client.ts:98` — the client one logs the full model response in production; move to `console.debug` or `LOG_LEVEL` guard.

**Security minor**
- S5: `linkifyText` generates `tel:` hrefs from model text with no length cap. `if (digits.length > 15) continue;`.
- S6: `KnowledgePanel` uses `alert()` for save errors instead of `setError()` (inconsistency, not a vuln).
- S7: "Staff portal" link on parent UI — remove in production.

**MCP boundary**
- M2: Refusal short-circuit skips post-response pipeline entirely. Low-risk but total bypass. Optional defense: run `hallucinationChannel` on refusals as well.

**Classifier gaps (false negatives, no confirmed over-fires)**
- C3: `call 911` directed at parent slips through (pattern intentionally removed; consider scoped re-add).
- C4: Seed-referenced conditions (`hand-foot-and-mouth`, `chicken pox`, `norovirus`, `RSV`, `COVID`) missing from HEALTH_WORDS.
- C5: Colloquial illness phrases missing (`got sick`, `picked up a bug`, `has a bug`).
- C6: `they/them` gender-neutral pronouns missing from `PRONOUN_HEALTH_PATTERNS`.
- C7: `mine` missing from POSSESSIVE_CHILD_PATTERNS — "a child like mine" evades all groups.
- C8: `MIN_SINGLE_WORD_LEN = 5` misses `Maya` as a standalone — safety net is the multi-word path.
- C9: Proximity window 80 chars — 120 would be more robust for verbose parent phrasing.

**Product-fit flat spots**
- PF6: "Powered by BrightDesk AI" footer → rebrand as `Sunflower Early Learning · AI Front Desk` for the demo.
- PF7: "Try asking..." label in suggested questions is redundant with the greeting.
- PF8: System prompt voice instructions at line 305 — consider moving to the top (voice-before-format).
- PF9: README first line is project description, not thesis. Mirror the writeup's opening.

**Test coverage gaps** — add regression tests for:
- `give him` with staff-as-subject paraphrase
- `administer` / `inject` vocabulary
- `my pediatrician` / `my doctor` enrollment questions
- `hand-foot-and-mouth` / `chicken pox` named conditions
- `they/them` pronouns
- High-confidence answer with empty `cited_entries` (should be held)

---

## Remediation plan — suggested ordering

**Round 1 — P0 fixes (one small PR)**
1. C1 trust-loop: downgrade empty-citation answer in `contractToMessage`
2. Classifier T2: remove `i` flag from `POSSESSIVE_CHILD_PATTERNS[1]`
3. Product-fit P1: rewrite "may be ready" escalation sub-copy
4. Product-fit P2: rename "override" vocabulary in operator UI
5. Add regression tests for #1, #2, #4

**Round 2 — Trust loop and types cleanup (medium PR)**
- T3: remove `"uncertain"` dead type
- T4: operator citation pills with titles + clickable modals
- T5: deprecate or extend legacy resolve route
- TS1–TS5: type hygiene pass

**Round 3 — Security hardening (medium PR)**
- S1: security headers in `next.config.mjs`
- S2: middleware auth for admin routes (could be a stub with a shared password initially)
- S3: sanitize `requireEnv` errors
- S4: pin GitHub action SHAs
- S5: `tel:` length cap
- S7: remove Staff portal link in production build

**Round 4 — Classifier extension (medium PR)**
- C1: scope `give him/her` to second-person subject
- C2: add `administer`, `inject`
- C3: scoped `call 911` re-add
- C4: extend HEALTH_WORDS with seed-referenced conditions
- C5: add colloquial illness phrases
- C6: add `they/them` pronouns
- C7: add `mine`
- Regression tests for each

**Round 5 — Product-fit copy pass (small PR)**
- PF1: Knowledge Base → Handbook
- PF2: third stat card label
- PF3: parent avatar decision (name prompt or drop)
- PF4: bell empty state
- PF5: KnowledgePanel error copy
- PF6: footer attribution
- PF7: SuggestedQuestions label
- PF8: system prompt reorder
- PF9: README first line

**Round 6 — Nitpicks (optional)**
- Everything flagged P2 that wasn't bundled above

---

## What's verified green (do not regress)

- Typecheck, lint, prettier, 357 unit tests all passing
- Coverage ≥ threshold on all four metrics (branches is the tightest at 78.5% vs 75%)
- MCP boundary is intact: `buildPrompt()` is the only emitter of `<mcp_message>` tags, no branded-type casts outside `lib/llm/types.ts` (except the flagged test hook), `@anthropic-ai/sdk` imported in exactly one file
- All POST/PUT/DELETE routes parse through Zod `.strict()` schemas
- No XSS vectors: no `dangerouslySetInnerHTML`, no `eval`, no unsafe refs
- `npm audit --production`: 0 vulnerabilities
- Operator reply delivery path end-to-end: `/api/ask` → event id → polling → `resolve-with-entry` → `operatorReply` stored → `/api/parent-replies` → `staff_reply` bubble. Works. Tested.
- Sensitive-topic preflight classifier runs before LLM call; model never sees held questions
- `robots.txt` + `noindex` metadata in place
- Refusal path correctly bypasses operator queue without polluting needs-attention
