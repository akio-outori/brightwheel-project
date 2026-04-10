# syntax=docker/dockerfile:1.7
#
# Multi-stage Next.js 15 standalone build.
# - Stage 1 (deps): install npm dependencies once with a cached layer
# - Stage 2 (builder): produce the standalone server
# - Stage 3 (runner): distroless nonroot — node binary only, no shell,
#   no package managers, no root, minimal OS attack surface
#
# The "standalone" output mode produces .next/standalone/server.js but does NOT
# copy public/ or .next/static/ — those have to be copied separately in the
# runner stage. Getting this wrong serves blank pages with 404s on every asset.

# ---- Stage 1: deps ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Stage 2: builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Stage 3: runner (distroless nonroot) ----
# gcr.io/distroless/nodejs22-debian12:nonroot ships the Node 22
# runtime and nothing else — no npm, no yarn, no shell, no apt, no
# corepack, no root user. This eliminates the entire class of
# "bundled npm package CVEs" and runs as uid 65534 by default.
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone output, then static and public copied in separately.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The LLM config and prompt files are read at runtime by
# lib/llm/config.ts. next.config.mjs already declares them in
# outputFileTracingIncludes, but that tracing only kicks in when
# Next's compiler can find a route importing the path — which it
# doesn't, because readFile isn't an import. Copy config/ in
# explicitly as a safety net.
COPY --from=builder /app/config ./config

EXPOSE 3000

CMD ["server.js"]
