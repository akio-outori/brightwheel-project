# Deployment & Infrastructure

## Docker stack

Three services defined in `docker-compose.yml`:

| Service | Image | Purpose |
|---------|-------|---------|
| `minio` | `minio/minio` | S3-compatible object storage |
| `minio-init` | `minio/mc` | Bucket creation, encryption, seeding |
| `app` | Built from `Dockerfile` | Next.js 15 standalone server |

### Build stages

The Dockerfile uses a multi-stage build:

1. **deps** (`node:22-bookworm-slim`) — `npm ci` with cached layer
2. **builder** (`node:22-bookworm-slim`) — `npm run build` producing
   the standalone output
3. **runner** (`gcr.io/distroless/nodejs22-debian12:nonroot`) — the
   Node 22 runtime and nothing else. No shell, no npm, no yarn,
   no corepack, no root user.

The distroless nonroot base eliminates the entire class of
"bundled npm package CVEs" that affect standard Node images and
reduces the OS attack surface to the minimum needed for
`node server.js`.

### MinIO init script

`docker/minio-init/init.sh` runs on every `docker compose up` and
is idempotent:

1. Creates `handbook` and `events` buckets
2. Enables versioning on `handbook`, SSE-S3 on both
3. Checks for `.seed-complete-v3` sentinel — exits if present
4. Purges any legacy flat-layout keys (one-time migration)
5. Reads `document.id` from the seed JSON
6. Writes `documents/{docId}/metadata.json`
7. Streams each entry to `documents/{docId}/entries/{id}.json`
8. Writes the sentinel last (partial seeds don't get marked)

### Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Yes | — | API key for the Anthropic SDK |
| `STORAGE_ENDPOINT` | No | `http://minio:9000` | MinIO/S3 endpoint |
| `STORAGE_ACCESS_KEY` | No | `minioadmin` | MinIO access key |
| `STORAGE_SECRET_KEY` | No | `minioadmin` | MinIO secret key |
| `STORAGE_HANDBOOK_BUCKET` | No | `handbook` | Handbook bucket name |
| `STORAGE_EVENTS_BUCKET` | No | `events` | Events bucket name |
| `STAFF_AUTH_TOKEN` | No | — | Shared password for operator console login |
| `STORAGE_RESET_ON_INIT` | No | — | When `true`, drain events bucket on startup |

## CI workflows

### PR Checks (`pr-checks.yml`)

Runs on every pull request to main. 13 jobs:

**Correctness:** typecheck, ESLint + security plugin, Prettier

**Tests:** unit tests with MinIO service container + coverage
enforcement, Next.js production build

**Vulnerability scanning:** npm audit (all severities), Trivy
filesystem scan, Trivy container image scan (builds the Docker
image and scans it)

**Static analysis:** TruffleHog secrets scan, Semgrep SAST
(typescript, react, owasp-top-ten, nodejs rulesets), Bearer SAST
(data flow analysis)

**Compliance:** license-checker (fails on GPL/AGPL/SSPL in
production deps)

### Claude Code Review (`claude-review.yml`)

Runs 7 review agents via the Claude Code GitHub Action:
review-typescript, review-mcp-boundary, review-trust-loop,
review-security, review-classifier, review-product-fit,
review-tests.

## Security scanning

### Container image

The distroless base image has near-zero attack surface.
`.trivyignore` suppresses any upstream CVEs that haven't been
patched in the distroless build yet (each entry is documented
with a justification and a removal condition).

### Dependencies

npm audit runs at all severity levels in CI. The project currently
has 0 vulnerabilities across production and dev dependencies.

### SAST coverage

| Tool | Rulesets | What it finds |
|------|---------|--------------|
| ESLint + eslint-plugin-security | eval, unsafe regex, timing attacks, buffer, child process | Node.js-specific patterns |
| Semgrep | p/typescript, p/react, p/owasp-top-ten, p/nodejs | XSS, injection, OWASP categories |
| Bearer | Data flow analysis | Input-to-sink tracing, sensitive data exposure |
| TruffleHog | Verified secrets | Leaked API keys, tokens, passwords |

## Railway (demo)

The demo instance runs on Railway, configured in `railway.toml`:

- Builds from the multi-stage Dockerfile
- Healthcheck on `/api/health` (30s timeout)
- Restarts on failure (max 3 retries)
- MinIO runs as a separate Railway service with persistent volume
- `STORAGE_RESET_ON_INIT=true` drains the events bucket on each
  deploy so the operator console starts clean; handbook entries and
  overrides persist across deploys
- App-level init (`lib/storage/init.ts`) replaces the minio-init
  container since Railway doesn't support `depends_on` with
  `service_completed_successfully`

## Production deployment notes

The stack is designed for straightforward migration to cloud:

- **MinIO → AWS S3:** Change `STORAGE_ENDPOINT` to the S3 endpoint.
  Enable SSE-KMS with a customer-managed CMK (replaces SSE-S3).
  Enable S3 versioning on the handbook bucket. The storage adapters
  use the S3 API exclusively — no MinIO-specific calls.

- **Container → any container runtime:** The distroless image runs
  on ECS, Fargate, Cloud Run, Fly.io, or any Docker-compatible
  platform. The healthcheck needs an HTTP probe on `/api/health`
  (the Dockerfile no longer has a HEALTHCHECK since distroless has
  no shell).

- **SSE push to parents:** Currently the parent who sees "being
  reviewed" must re-ask to see the operator's override. Production
  would add SSE/WebSocket for real-time delivery.

- **Operator notifications:** Polling-based feed today.
  Production adds email/SMS/webhook notification channels scoped
  by document.

## Key files

- `Dockerfile` — multi-stage build with distroless runner
- `docker-compose.yml` — local development stack
- `docker/minio-init/init.sh` — idempotent seed + migration
- `.github/workflows/pr-checks.yml` — 13-check CI pipeline
- `.github/workflows/claude-review.yml` — agent-based PR review
- `.trivyignore` — documented CVE suppressions
- `.env.example` — environment variable template
