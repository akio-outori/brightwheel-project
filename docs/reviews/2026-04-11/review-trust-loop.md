# review-trust-loop — findings

**Branch:** `review/pass` off main HEAD `8be4a21`
**Date:** 2026-04-11

## Critical (breaks the thesis)

### C1. High-confidence answer rendered without citations and no "no-source" guard

File: `components/parent/ParentChat.tsx` line 85

`contractToMessage` sets `source: "Family Handbook"` when `cited_entries.length > 0` but falls through to `source: null` when `cited_entries` is empty and still emits `type: "answer"`. In `ChatMessage.tsx:147–181`, the metadata cluster (citation pills + "Verified policy" badge) is rendered when `message.type === "answer"`. A high-confidence, empty-citation answer will render the "Verified policy" / CheckCircle badge **without any citation pill**, presenting an ungrounded answer as verified.

This contradicts Invariant 1: the coverage channel (`lib/llm/post-response/channels/coverage.ts:27–41`) holds on `cited_entries=[]` AND `directly_addressed_by=[]`, but a model that returns `cited_entries=[]` with a non-empty `directly_addressed_by` passes coverage and reaches the parent with zero citation pills. The parent sees "Verified policy" with nothing to click.

**Fix:** in `contractToMessage`, treat `cited_entries.length === 0` on a `type: "answer"` path as a trust-loop break — either downgrade to escalation or at minimum suppress the "Verified policy" badge and require a "no source" state the parent can see.

### C2. Dead type `"uncertain"` in `ChatMessageData` creates a latent rendering gap

File: `components/chat/ChatMessage.tsx` line 80

`ChatMessageData.type` declares `"uncertain"` as a valid value. No code path in `contractToMessage` or the error-response handlers emits `type: "uncertain"`, but `ChatMessage.tsx` has no rendering branch for it. If any future code path produces it, the bubble renders as a plain `bg-white` answer bubble with no confidence indicator, no escalation card, and no citation surface — silently defeating Invariants 2 and 3 with no lint or type error.

`"uncertain"` is the textbook anti-pattern ("show the answer with a warning") the thesis explicitly rejects.

**Fix:** remove `"uncertain"` from the union or add an explicit exhaustive-check that TypeScript enforces. Valid render paths are `"answer"`, `"escalated"`, `"refusal"`, and `"staff_reply"`.

## P1 — should fix

### 3. Operator sees raw entry IDs as citation pills, not titles

File: `components/operator/QuestionLogPanel.tsx` lines 234–249

When the operator expands a card, cited entries are rendered as `{id}` strings (`item.result.cited_entries.map((id) => <span>{id}</span>)`). The operator console never resolves those IDs to entry titles — the `entryLookup` built by `/api/handbook` in `ParentChat.tsx` is client-local and not passed into the operator dashboard.

An operator reviewing a held draft sees `hours-of-operation-01` instead of "Hours of Operation." Weakens the demo moment where the operator understands why the answer was held.

**Fix:** fetch `/api/handbook` in `OperatorDashboard` and pass an id→title map into `QuestionLogPanel`.

### 4. Operator citation pills are `<span>`, not interactive

File: `components/operator/QuestionLogPanel.tsx` lines 240–248

Parallel to the parent-facing issue: citation id spans in the operator panel are decorative only. The operator cannot click them to verify the source text the model cited, so they cannot confirm the model cited the right entry before writing a reply.

**Fix:** resolve IDs to titles and open the entry body in a modal, consistent with the parent-facing citation interaction.

### 5. Legacy resolution endpoint accepts `resolvedByOverrideId` without `operatorReply`

File: `app/api/needs-attention/[id]/route.ts` line 45

The legacy POST requires `resolvedByOverrideId` but has no `operatorReply` field. Resolving an event through this endpoint leaves `operatorReply` unset on the stored event. `getResolvedEventsWithReplies` in `/api/parent-replies` filters on the presence of `operatorReply` — so an event resolved this way is marked `resolvedAt` (disappears from the unresolved feed) but returns nothing to the parent's polling loop. The parent's escalation bubble stays indefinitely.

**Fix:** either add `operatorReply` to this route's schema, or document clearly in the schema that this path intentionally leaves the parent without a reply and add a deprecation notice.

## P2 — nitpick

### 6. Stock-response detection relies on substring match

File: `components/parent/ParentChat.tsx` lines 69–79

`contractToMessage` determines whether to use the model's answer text or a hardcoded fallback by checking `contract.answer.includes("staff member is taking a look")`. This couples two files through a magic string.

**Fix:** add a structured field to `AnswerContract` (e.g., `stock_response: true`) that `buildStockResponse` sets, so the client doesn't have to sniff text content.

### 7. Low-confidence answer that passes the pipeline is returned with full answer text

File: `app/api/ask/route.ts` lines 253–261

After the pipeline passes, if `draft.confidence === "low"`, the route enforces `escalate: true` but the enforced contract still carries the model's original `answer` field. `contractToMessage` routes `escalate: true` to the escalated branch, but the raw `enforced.answer` is present in the JSON response body.

This is defense-in-depth gap rather than active violation — the component correctly gates on `escalate` first. But Invariant 3 should be enforced at the boundary.

## Verified

- **Invariant 3** (low confidence never renders as confident): intact — `contractToMessage` gates on `escalate || confidence === "low"`, API enforces `escalate: true` on low-confidence drafts
- **Invariant 4** (sensitive topics always escalate): intact — preflight runs before LLM call, independent of model response
- **Invariant 5** (operator closes the loop): intact — `resolve-with-entry` writes reply + optional override atomically; SWR cache invalidated on both keys after success
- **Operator-reply delivery path end-to-end**: intact — `/api/ask` returns `needs_attention_event_id` on all escalation paths, `ParentChat` stashes and polls it, `resolve-with-entry` writes `operatorReply` to the event, `/api/parent-replies` returns it, and `ParentChat` appends it as a `staff_reply` bubble
- **Invariant 7** (no XSS in rendered content): intact — no `dangerouslySetInnerHTML`; entry body in citation modal uses plain `<p>` split
- **Invariant 8** (citation pills are clickable on parent surface): intact — each pill is a `<button>` opening a modal with the full `entry.body`
- **End-to-end smoke test exists**: `components/parent/__tests__/ParentChat.test.tsx` covers the ask → escalated response + event id → polling → "Reply from staff" bubble path
