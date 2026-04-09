# syntax=docker/dockerfile:1.7
#
# Multi-stage Next.js 15 standalone build.
# - Stage 1 (deps): install npm dependencies once with a cached layer
# - Stage 2 (builder): produce the standalone server
# - Stage 3 (runner): minimal runtime, non-root, no curl
#
# The "standalone" output mode produces .next/standalone/server.js but does NOT
# copy public/ or .next/static/ — those have to be copied separately in the
# runner stage. Getting this wrong serves blank pages with 404s on every asset.

# ---- Stage 1: deps ----
FROM node:20.18.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Stage 2: builder ----
FROM node:20.18.0-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Stage 3: runner ----
FROM node:20.18.0-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user. The standalone server doesn't need root.
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Standalone output, then static and public copied in separately.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Healthcheck via node's built-in http module — the slim image has no curl
# and we deliberately do not install it.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
