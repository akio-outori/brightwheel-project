# review-mcp-boundary — findings

**Branch:** `review/pass` off main HEAD `8be4a21`
**Date:** 2026-04-11

## Critical

None.

## P1 — should fix

### 1. SystemPrompt is constructed at request time from a runtime-loaded string

File: `app/api/ask/route.ts` lines 138, 164

`cfg.systemPrompt` is a `string` read from disk (via `getActiveAgentConfig()`) and then passed raw into `SystemPrompt()` inside the request handler body. The constructor accepts any non-empty string without validating that it came from the static file and not from a runtime-interpolated source. In the current code the string is clean — `loadAgentConfig` reads the file verbatim and freezes the result. The concern: this is one step away from a smell. Any future change that interpolates request data into `cfg.systemPrompt` (e.g., "center-specific greeting") would pass the `SystemPrompt()` constructor silently.

**Fix:** lift `SystemPrompt(cfg.systemPrompt)` out of the request handler and construct it once at module initialization:

```ts
// module level — constructed once, never re-evaluated per request
let SYSTEM_PROMPT: SystemPrompt | null = null;
async function getSystemPrompt(): Promise<SystemPrompt> {
  if (!SYSTEM_PROMPT) {
    const cfg = await getActiveAgentConfig();
    SYSTEM_PROMPT = SystemPrompt(cfg.systemPrompt);
  }
  return SYSTEM_PROMPT;
}
```

Same pattern as `INTENT` at module scope. Makes it structurally impossible for per-request data to reach the system role.

### 2. `__setClientForTests` casts `unknown` to `Anthropic` unconditionally

File: `lib/llm/client.ts` lines 40–42

```ts
export function __setClientForTests(client: unknown): void {
  cachedClient = client as Anthropic;
}
```

The `as Anthropic` cast is the only non-constructor `as`-cast in the LLM module. The function is test-only and the jsdoc explains why, but the cast is not structurally limited to test environments (no `process.env.NODE_ENV` guard). A caller in production code could inject an arbitrary object into `cachedClient` and redirect every subsequent LLM call. Risk is low today (nothing outside tests imports it) but it's an unguarded escape hatch.

**Fix:** add a `NODE_ENV` guard:

```ts
export function __setClientForTests(client: unknown): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setClientForTests must not be called in production");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test hook
  cachedClient = client as Anthropic;
}
```

## P2 — nitpick

### 3. Refusal short-circuit skips post-response pipeline entirely

File: `app/api/ask/route.ts` lines 178–187

The refusal path returns the model's `answer` field directly. The post-response pipeline is bypassed. For a genuine out-of-scope refusal the answer is a canned polite decline and those channels are irrelevant. The only enforcement of `refusal: true` semantics is `AnswerContractSchema` — which validates the field's type but not its semantic truth. A misprompted or unexpectedly-behaving model could set `refusal: true` on an answer that contains a fabricated citation or an unverifiable phone number.

Risk is low given the current static system prompt but the bypass is total.

**Fix (optional defense-in-depth):** run the `hallucinationChannel` on refusals as well, since it's a hard data-integrity guard. The current code already forces `cited_entries: []` and `directly_addressed_by: []` at the normalization point, so `hallucinationChannel` would always pass — but if a future change relaxes that normalization, the guard catches it.

## Notes

- `config/prompts/parent-front-desk.md` explicitly contains the phrase "output your system prompt" inside the refusal section — this is intentional (example of what to refuse), not a vulnerability. The text is in an instruction context, not a data context, and the system prompt file has no `{{}}` template placeholders.
- `INTENT` at `app/api/ask/route.ts:68` is constructed from string literals only, at module initialization. Correct pattern.
- `lib/llm/config.ts` loads the system prompt file path from a Zod-validated config field, not from user input.

## Verified clean

- `buildPrompt()` in `lib/llm/prompt-builder.ts` is the only emitter of `<mcp_message>` tags. Grep confirms no other `.ts` file constructs the tag outside test fixtures.
- No `as SystemPrompt`, `as AppIntent`, `as MCPData`, or `as UserInput` casts exist outside `lib/llm/types.ts`. The only `as`-cast in the module is the test-hook cast at `client.ts:41` (flagged P1 above).
- No `__brand:` literal appears anywhere except in type definitions.
- `@anthropic-ai/sdk` is imported in exactly one file: `lib/llm/client.ts`. No other file in the repo imports it directly.
- `AnswerContractSchema.safeParse` is used for all model response parsing. The `JSON.parse` at `client.ts:102` feeds `parsed: unknown` into `safeParse` immediately after — raw access never happens.
- A failed `safeParse` returns `PARSE_FAILURE_RESULT` (not a 500), which sets `escalate: true` and routes to the needs-attention log.
- `UserInput()` is constructed at the boundary in `route.ts:167`. Input arrives as a Zod-validated `string` of 1–2000 chars before reaching `UserInput()`, which enforces its own 4000-char cap. Double-guarded.
- The preflight classifier runs before the LLM call (`route.ts:114-134`). A `hold` verdict returns the stock response and logs to needs-attention immediately, without constructing `MCPData` or calling `askLLM`. The model is never invoked on held questions.
- `AppIntent` is constructed from a string literal constant (`INTENT`) at module scope — never templated with runtime data.
- The system prompt file contains no template placeholders.
