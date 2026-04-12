# review-typescript — findings

**Branch:** `review/pass` off main HEAD `8be4a21`
**Date:** 2026-04-11

## Critical

None. `npm run typecheck` passes cleanly; no `any` types in production code paths.

## P1 — should fix before next merge

### 1. Duplicate local `AnswerContract` / `NeedsAttentionEvent` interfaces in operator components

Files:
- `components/operator/OperatorDashboard.tsx` lines 44–60
- `components/operator/QuestionLogPanel.tsx` lines 27–44

Both files define hand-rolled `interface AnswerContract` and `interface NeedsAttentionEvent` instead of importing the canonical types from `lib/llm/contract.ts` and `lib/storage/types.ts`. The local `AnswerContract` in `QuestionLogPanel.tsx` is missing the `refusal` and `directly_addressed_by` fields entirely. The local `NeedsAttentionEvent` in `OperatorDashboard.tsx` is missing `docId`. These diverge silently — the compiler can't catch a mismatch between the local interface and the actual API shape because there's no assertion that they're the same thing.

**Fix:** replace both local interfaces with imports:

```ts
import type { AnswerContract } from "@/lib/llm/contract";
import type { NeedsAttentionEvent } from "@/lib/storage/types";
```

Both are re-exported from `lib/storage/types.ts` so the import path works for both.

### 2. `as string` assertion on `entry.id` from a `z.record(z.unknown())` entry

File: `lib/storage/init.ts` line 134

```ts
const id = entry.id as string;
if (!id) throw new Error("Seed entry missing id");
```

`entry` comes from `SeedFileSchema`'s `z.array(z.record(z.unknown()))`, so `entry.id` is typed `unknown`. The `as string` assertion compiles, but if `entry.id` is a number or object, the downstream `${id}.json` key silently produces `[object Object].json` or `"42.json"` rather than failing cleanly.

**Fix:** narrow properly by tightening the seed schema:

```ts
z.array(
  z
    .object({ id: z.string().min(1).regex(/^[a-z0-9-]+$/) })
    .passthrough(),
)
```

Then `entry.id` is `string` and the `as string` cast disappears.

### 3. `as Anthropic` cast in the test hook is on a production code path

File: `lib/llm/client.ts` lines 40–42

```ts
export function __setClientForTests(client: unknown): void {
  cachedClient = client as Anthropic;
}
```

The comment correctly says this is a test seam, but it lives in the compiled production bundle and the `as Anthropic` cast is the pattern `lib/llm/types.ts` explicitly calls out as a bug smell. The cast is also technically unsound — `cachedClient` is `Anthropic | null` but the input is `unknown`.

**Fix (minimal):** document with an inline eslint-disable comment, AND guard against production callers:

```ts
export function __setClientForTests(client: unknown): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setClientForTests must not be called in production");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only seam
  cachedClient = client as Anthropic;
}
```

**Better fix:** move to `lib/llm/__test-hooks__.ts` excluded from production bundles.

### 4. `reply: e.operatorReply` emits `string | undefined` into the parent API response

File: `app/api/parent-replies/route.ts` lines 64–69

`e.operatorReply` is typed `string | undefined`. The filter in `getResolvedEventsWithReplies` guarantees it's defined here (`if (!migrated.operatorReply) continue`), but TypeScript doesn't capture that post-filter invariant. The client (`ParentChat.tsx:240`) uses `r.reply` directly as the message text.

**Fix:** define a `ResolvedEventWithReply` type where `operatorReply` is `string` (not optional) and have `getResolvedEventsWithReplies` return `ResolvedEventWithReply[]`. That moves the invariant into the type system.

### 5. `needs_attention_event_id` field on the `/api/ask` response is untyped

Files:
- `app/api/ask/route.ts` lines 133, 245, 260
- `components/parent/ParentChat.tsx` lines 311–314

The route appends `needs_attention_event_id` to the stock response with `{ ...stockResponse, needs_attention_event_id: event.id }`. There is no schema or TypeScript type covering this composite shape. The client extracts it with a manual `"needs_attention_event_id" in raw` check.

**Fix:** define an `AskResponse` type with the optional field, export it, and have both the route and the client reference it.

## P2 — nitpick

### 6. `JSON.parse` in `minio-json.ts::readJson` without a Zod parse at the call site

File: `lib/storage/minio-json.ts` line 25

`readJson` returns `Promise<unknown | null>`. The comment says "Callers are responsible for schema validation." Every call site in `handbook.ts`, `needs-attention.ts`, and `overrides.ts` does validate — the pattern is correct. Flagged only as a reminder: a stricter design would make `readJson` generic and require a schema argument.

### 7. `chunk as Buffer` in `minio-json.ts`

File: `lib/storage/minio-json.ts` line 22

```ts
chunks.push(chunk as Buffer);
```

The MinIO SDK's stream yields `Buffer | string`. If MinIO ever yields a string chunk, `Buffer.concat` will throw at runtime. **Fix:** narrow or use `Buffer.from(chunk)` uniformly.

### 8. `.catch(() => {})` on the handbook fetch in `ParentChat`

File: `components/parent/ParentChat.tsx` line 177

Silently swallows a handbook fetch failure. Change to `.catch((err) => console.warn("[ParentChat] handbook fetch failed:", err))` for debuggability.

### 9. `console.log` throughout `lib/storage/init.ts` and `lib/llm/client.ts`

Files:
- `lib/storage/init.ts` lines 74, 87, 101, 123, 142, 151
- `lib/llm/client.ts` lines 98, 120

`console.log` in `lib/` is the reviewer rule's defect. In `client.ts`, line 98 logs the raw model response truncated to 4000 chars — highest-risk log: every parent question and model draft at INFO level in production. Should be `console.debug` or `process.env.LOG_LEVEL` guarded.

## Verified clean

- `npm run typecheck` passes with zero errors or warnings
- No `any` types in production code paths (`app/`, `lib/`, `components/`)
- All external boundaries parse inbound bodies through Zod schemas before field access
- Storage reads (`readJson`) return `unknown` and are validated at every call site
- LLM response is parsed through `AnswerContractSchema.safeParse` before any field access
- Branded types (`SystemPrompt`, `AppIntent`, `MCPData`, `UserInput`) are constructed only in `lib/llm/types.ts`; `as X` casts exist only there plus the test hook in `lib/llm/client.ts`
- No discriminated-union switches missing exhaustiveness checks
- No unused imports or dead branches detected
