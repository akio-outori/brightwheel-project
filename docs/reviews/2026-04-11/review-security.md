# review-security — findings

**Branch:** `review/pass` off main HEAD `8be4a21`
**Date:** 2026-04-11

## P1 — High (should fix before production)

### 1. No security response headers — CSP, X-Frame-Options, X-Content-Type-Options, HSTS all absent

File: `next.config.mjs` (entire file — no `headers()` export)

**Attack scenario:** A visitor on a shared network or a browser extension can frame `/admin` in an iframe and clickjack the operator into submitting override or reply forms; a MIME-sniffing attack on a JSON response could cause an older browser to execute it as script; there is no enforced upgrade to HTTPS.

**Fix:** Add a `headers()` export to `next.config.mjs` returning at minimum:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'` (audit `unsafe-inline` later against Tailwind/Framer Motion)

### 2. Operator console is fully unauthenticated — all write routes accessible to any client

Routes:
- `app/api/overrides/route.ts` (POST)
- `app/api/overrides/[id]/route.ts` (PUT, DELETE)
- `app/api/needs-attention/[id]/resolve-with-entry/route.ts` (POST)
- `app/api/needs-attention/[id]/route.ts` (POST)

**Attack scenario:** Any unauthenticated person who discovers the API (trivial — the parent UI ships a "Staff portal" link and the JS bundle reveals the route paths) can create, edit, or delete handbook overrides, AND can mark escalated parent questions as resolved with arbitrary reply text that the parent will then see in their chat via `/api/parent-replies` polling. This is the highest-impact attack because it injects operator-reply text directly to real parents through the live-delivery channel.

The code itself documents "No auth: this is a demo" — this is correctly flagged as a known gap, but the specific risk of injecting operator-reply text to real parents via the polling channel is worth an explicit production-blocker note.

**Fix:** Add a middleware session check (Next.js `middleware.ts` + `httpOnly` cookie from `iron-session` or `next-auth`) before any `/api/` route under the operator surface. `/api/ask` and `/api/parent-replies` stay public.

### 3. `requireEnv` error message discloses environment variable names

File: `lib/storage/client.ts` lines 19–27

The thrown message is `Storage configuration error: STORAGE_SECRET_KEY is not set.` Called indirectly by all API routes. Those routes all wrap storage calls in a `catch` and return a generic 500 — **so the variable name does not reach the HTTP response today**. Latent leakage: if a future route adds a storage call outside that catch boundary, the variable name would propagate.

**Fix:** Change `requireEnv` message to generic: `"Storage misconfiguration — check server environment."` The server log will show the full stack.

### 4. `KnowledgePanel` edit-error path leaks via `alert()`

File: `components/operator/KnowledgePanel.tsx` line 167

```ts
alert(err instanceof Error ? err.message : "Failed to save. Please try again.");
```

The `alert()` is a usability regression vs the `setError()` pattern used in every other form in the same file. Not a security issue per se but flagged for consistency.

**Fix:** Replace with `setError(...)` using the existing state variable.

## P2 — Medium

### 5. `linkifyText` generates `tel:` hrefs from model-controlled text without a length cap

File: `components/chat/ChatMessage.tsx` lines 13–69

The phone regex matches model-produced text and writes `href={`tel:${digits}`}` without any length guard. A crafted model response with 20+ digits would produce a very long `tel:` URI. Not a code-execution path (`tel:` cannot run script) but bypasses the linkification intent.

**Fix:** `if (digits.length > 15) continue;` before push.

### 6. `.env.local` clean; no `ANTHROPIC_API_KEY` bundled — verified

File: `.env.local` (gitignored, contains only local MinIO defaults)

Noted for completeness — no secret leakage risk in the repo today.

### 7. `trivy-action@master` and `trufflehog@main` pin to floating branch refs

File: `.github/workflows/pr-checks.yml` lines 121, 143

**Attack scenario:** A supply-chain compromise of either action's `master`/`main` branch could silently inject workflow steps that run with access to `ANTHROPIC_API_KEY` (which `claude-review.yml` uses).

**Fix:** Pin to specific commit SHAs, as already done for `actions/checkout@v4` and `actions/setup-node@v4`.

### 8. `semgrep-action@v1` and `bearer-action@v2` use mutable version tags

File: `.github/workflows/pr-checks.yml` lines 152, 166

Same risk class as #7, lower severity (narrower permissions). Fix: pin to SHA.

### 9. Operator console reachable from parent surface via visible "Staff portal" link

File: `components/parent/ParentChat.tsx` line 459

`href="/admin"` rendered in the public parent UI. Combined with #2, trivial discovery of the admin surface. Intentional in a demo, should be removed in production. **P2** because it's a discoverability amplifier for #2.

## npm audit

`npm audit --production` reports **0 vulnerabilities**. All production dependencies clean.

## Verified clean

- No `dangerouslySetInnerHTML` in any `.tsx` component. All LLM answer text and handbook body content is rendered through `{text}` JSX interpolation or split/mapped into `<p>` elements — React auto-escapes.
- No `eval()`, `new Function()`, or dynamic `setTimeout(string)` anywhere.
- All POST/PUT/DELETE routes parse JSON in a try/catch returning 400 on malformed input, then validate through a Zod `.strict()` schema. Zod errors return generic `{ error: "Invalid request." }` on mutation routes (exception: `POST /api/overrides` returns `issues` but the field names are `title`, `category`, `body` — not sensitive internals).
- No SSRF vectors. All `fetch()` calls are client-side to relative `/api/` paths. All server-side storage calls use the MinIO SDK pointed at `STORAGE_ENDPOINT` from env vars only.
- No stack traces in 500 responses. `err.stack` and `err.message` never appear in a `Response.json()` call.
- No `NEXT_PUBLIC_` prefixed env vars — secrets cannot be bundled into client JS.
- `robots.txt` correctly disallows all crawlers; `noindex` meta in `layout.tsx` reinforces.
- `.env.local` gitignored and contains no production secrets.
- The `[id]` path parameter in dynamic routes is used only as a storage key — never reflected in error messages or shell-interpolated. `resolvedByOverrideId` is additionally Zod-constrained to `/^[a-z0-9-]+$/`.
