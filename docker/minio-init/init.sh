#!/bin/sh
# MinIO bootstrap. Idempotent — running this twice against a populated MinIO
# is a no-op. Idempotency is enforced via a sentinel object,
# `${HANDBOOK_BUCKET}/.seed-complete-v3`, which is written as the final step
# of the seed loop. The first thing this script does is check for it; if
# found, the script exits successfully without rewriting anything.
#
# Force a re-seed during dev with:
#   mc rm local/handbook/.seed-complete-v3
#
# Layout
# ------
# The handbook is scoped per-document. One seed file describes one document.
# For each entry, the script writes:
#
#   documents/{docId}/metadata.json               # DocumentMetadata
#   documents/{docId}/entries/{entryId}.json      # HandbookEntry
#
# The overrides/ prefix under the same {docId} path is owned by the
# operator console at runtime; this script does not touch it.
#
# The v2 sentinel is distinct from the old .seed-complete so that an older
# dev MinIO volume (flat `entries/` + `index.json`) reseeds cleanly on next
# restart. Legacy keys from that layout are purged here as a one-time
# migration step before the new seed is written.
#
# This script is POSIX sh. The minio/mc image is alpine-based and ships
# with `sh`, `mc`, and `jq` only. No bashisms.

set -eu

HANDBOOK_BUCKET="${STORAGE_HANDBOOK_BUCKET:-handbook}"
EVENTS_BUCKET="${STORAGE_EVENTS_BUCKET:-events}"
SEED_FILE="/seed/seed-handbook.json"
SENTINEL_KEY=".seed-complete-v3"

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

# Sentinel check — short-circuit if already seeded under the v2 layout.
if mc stat "local/${HANDBOOK_BUCKET}/${SENTINEL_KEY}" >/dev/null 2>&1; then
  echo "[minio-init] v2 sentinel found — handbook already seeded, exiting"
  exit 0
fi

# One-time migration from the old flat layout. Safe to run against a
# fresh bucket — `mc rm --recursive` against a missing prefix is a no-op.
# The old v1 sentinel is also cleared so a future rollback to this script
# behaves predictably.
echo "[minio-init] purging legacy flat-layout keys (if any)"
mc rm --recursive --force --versions "local/${HANDBOOK_BUCKET}/entries/" >/dev/null 2>&1 || true
mc rm --force --versions "local/${HANDBOOK_BUCKET}/index.json" >/dev/null 2>&1 || true
mc rm --force --versions "local/${HANDBOOK_BUCKET}/.seed-complete" >/dev/null 2>&1 || true

# Seed the handbook from the JSON file (if it exists).
if [ ! -f "${SEED_FILE}" ]; then
  echo "[minio-init] no seed file at ${SEED_FILE} — skipping seed step"
  echo "[minio-init] writing sentinel anyway so the bucket is marked ready"
else
  DOC_ID=$(jq -r '.document.id' "${SEED_FILE}")
  if [ -z "${DOC_ID}" ] || [ "${DOC_ID}" = "null" ]; then
    echo "[minio-init] error: seed file is missing .document.id"
    exit 1
  fi
  ENTRY_COUNT=$(jq '.entries | length' "${SEED_FILE}")
  echo "[minio-init] seeding document ${DOC_ID} (${ENTRY_COUNT} entries)"

  DOC_PREFIX="documents/${DOC_ID}"

  # Write document metadata. The seededAt field is stamped here, not in the
  # seed file, so every clean reseed gets a fresh timestamp without manual
  # edits. The .document object in the seed is the authoritative source for
  # everything else.
  SEEDED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg seededAt "${SEEDED_AT}" \
    '.document + {seededAt: $seededAt}' "${SEED_FILE}" \
    | mc pipe "local/${HANDBOOK_BUCKET}/${DOC_PREFIX}/metadata.json" >/dev/null

  # Stream each entry into `documents/{docId}/entries/{id}.json`. Each entry
  # is stamped with docId at write time so a lone entry blob is
  # self-describing, even though the path already encodes the same fact.
  jq -c --arg docId "${DOC_ID}" \
    '.entries[] | . + {docId: $docId}' "${SEED_FILE}" \
    | while IFS= read -r entry; do
    id=$(printf '%s' "${entry}" | jq -r '.id')
    if [ -z "${id}" ] || [ "${id}" = "null" ]; then
      echo "[minio-init] error: entry missing id"
      exit 1
    fi
    printf '%s' "${entry}" \
      | mc pipe "local/${HANDBOOK_BUCKET}/${DOC_PREFIX}/entries/${id}.json" >/dev/null
  done

  echo "[minio-init] seeded ${ENTRY_COUNT} entries under ${DOC_PREFIX}/"
fi

# Write the sentinel last so a partial seed doesn't get marked complete.
SENTINEL_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"seeded_at":"%s","layout":"v2"}' "${SENTINEL_AT}" | \
  mc pipe "local/${HANDBOOK_BUCKET}/${SENTINEL_KEY}" >/dev/null

echo "[minio-init] complete (seeded_at=${SENTINEL_AT})"
