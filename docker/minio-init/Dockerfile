# syntax=docker/dockerfile:1.7
#
# Custom MinIO mc image for bootstrapping the brightwheel stack.
#
# This image extends the official minio/mc image with our init script and the
# seed handbook data baked in. The container is self-contained — there are no
# bind mounts from the host, which means:
#   - Image is portable and reproducible
#   - No host filesystem ownership issues
#   - The seed data is part of the build artifact, not a side input
#
# The init script is idempotent: it short-circuits via a sentinel object
# (`handbook/.seed-complete`) on subsequent runs.

# The minio/mc image is now RHEL 9 UBI-micro based — no package manager,
# no jq. Older releases shipped jq in the image; the init script still
# needs it to parse the seed handbook JSON.
#
# Workaround: fetch the official statically-linked jq 1.7.1 release from
# GitHub in an alpine stage, verify sha256, and COPY the single binary
# into the final image. The upstream "jq-linux-amd64" asset is built with
# static linking (no libonig/libc dependency), so it runs on any glibc or
# musl base.
FROM alpine:3.20 AS jq-stage
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o /tmp/jq \
      https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64 && \
    echo "5942c9b0934e510ee61eb3e30273f1b3fe2590df93933a93d7c58b81d19c8ff5  /tmp/jq" | sha256sum -c - && \
    chmod +x /tmp/jq

FROM minio/mc:RELEASE.2025-08-13T08-35-41Z

COPY --from=jq-stage /tmp/jq /usr/local/bin/jq

# COPY paths are relative to the build context (repo root, set in compose).
COPY docker/minio-init/init.sh /init/init.sh
COPY data/seed-handbook.json   /seed/seed-handbook.json

ENTRYPOINT ["/bin/sh", "/init/init.sh"]
