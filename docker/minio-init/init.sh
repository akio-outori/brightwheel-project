#!/bin/sh
# MinIO bootstrap. Idempotent — running this twice against a populated MinIO
# is a no-op. Idempotency is enforced via a sentinel object,
# `${HANDBOOK_BUCKET}/.seed-complete`, which is written as the final step of
# the seed loop. The first thing this script does is check for it; if found,
# the script exits successfully without rewriting anything.
#
# Force a re-seed during dev with: `mc rm local/handbook/.seed-complete`
#
# This script is POSIX sh. The minio/mc image is alpine-based and ships
# with `sh`, `mc`, and `jq` only. No bashisms.

set -eu

HANDBOOK_BUCKET="${STORAGE_HANDBOOK_BUCKET:-handbook}"
EVENTS_BUCKET="${STORAGE_EVENTS_BUCKET:-events}"
SEED_FILE="/seed/seed-handbook.json"
SENTINEL_KEY=".seed-complete"

echo "[minio-init] starting"
echo "[minio-init] handbook bucket: ${HANDBOOK_BUCKET}"
echo "[minio-init] events bucket:   ${EVENTS_BUCKET}"

# Configure the alias. Retries against the healthcheck-backed dependency
# should not be necessary, but a few seconds of grace doesn't hurt.
mc alias set local http://minio:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null

# Buckets (idempotent)
mc mb --ignore-existing "local/${HANDBOOK_BUCKET}"
mc mb --ignore-existing "local/${EVENTS_BUCKET}"

# Versioning on the handbook bucket only — handbook entries need history;
# events are append-only and don't.
mc version enable "local/${HANDBOOK_BUCKET}" >/dev/null

# Server-side encryption on both buckets. MinIO uses its built-in KMS, keyed
# by the MINIO_KMS_SECRET_KEY env var on the server. Production AWS would use
# SSE-KMS with a customer-managed CMK rotated through KMS — this is the
# documented prototype shortcut.
mc encrypt set sse-s3 "local/${HANDBOOK_BUCKET}"
mc encrypt set sse-s3 "local/${EVENTS_BUCKET}"

# Sentinel check — short-circuit if already seeded.
if mc stat "local/${HANDBOOK_BUCKET}/${SENTINEL_KEY}" >/dev/null 2>&1; then
  echo "[minio-init] sentinel found — handbook already seeded, exiting"
  exit 0
fi

# Seed the handbook from the JSON file (if it exists).
if [ ! -f "${SEED_FILE}" ]; then
  echo "[minio-init] no seed file at ${SEED_FILE} — skipping seed step"
  echo "[minio-init] writing sentinel anyway so the bucket is marked ready"
else
  ENTRY_COUNT=$(jq '.entries | length' "${SEED_FILE}")
  echo "[minio-init] seeding ${ENTRY_COUNT} handbook entries"

  # Stream each entry into MinIO. `jq -c .entries[]` emits one entry per line;
  # we read each line, extract the id, and pipe the entry JSON into MinIO at
  # entries/{id}.json.
  jq -c '.entries[]' "${SEED_FILE}" | while IFS= read -r entry; do
    id=$(printf '%s' "${entry}" | jq -r '.id')
    if [ -z "${id}" ] || [ "${id}" = "null" ]; then
      echo "[minio-init] error: entry missing id"
      exit 1
    fi
    printf '%s' "${entry}" | mc pipe "local/${HANDBOOK_BUCKET}/entries/${id}.json" >/dev/null
  done

  # Build index.json containing all entries (full-entry pattern, not summaries).
  # This is what the storage adapter's listHandbookEntries() reads in one round trip.
  jq -c '{entries: .entries}' "${SEED_FILE}" | mc pipe "local/${HANDBOOK_BUCKET}/index.json" >/dev/null

  echo "[minio-init] seeded ${ENTRY_COUNT} entries and index.json"
fi

# Write the sentinel last so a partial seed doesn't get marked complete.
SEEDED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"seeded_at":"%s"}' "${SEEDED_AT}" | \
  mc pipe "local/${HANDBOOK_BUCKET}/${SENTINEL_KEY}" >/dev/null

echo "[minio-init] complete (seeded_at=${SEEDED_AT})"
