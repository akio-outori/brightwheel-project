# Document Model & Storage

## Two-layer architecture

The handbook is split into two layers scoped per document:

- **Entries (seed layer):** Immutable after the init script runs.
  Seeded from the Sunflower Early Learning Family Handbook — 37
  fictional entries covering hours, tuition, enrollment, health
  policy, meals, curriculum, discipline, communication, and staff.

- **Overrides (operator layer):** Mutable. Created, updated, and
  deleted at runtime by operators through the console or the
  fix-dialog flow. Overrides layer on top of entries at query time.
  The model is instructed to prefer an override when it directly
  addresses the question.

This separation guarantees the source document never drifts from
its original content, while operators can still patch gaps and
correct mistakes in real time.

## MinIO bucket layout

```
handbook/
  documents/
    {docId}/
      metadata.json              # DocumentMetadata
      entries/{entryId}.json     # HandbookEntry (seed, immutable)
      overrides/{overrideId}.json # OperatorOverride (mutable)
  .seed-complete-v3              # Sentinel (skip re-seed if present)

events/
  needs-attention/
    {YYYY-MM-DD}/
      {HH-mm-ss}-{uuid}.json    # NeedsAttentionEvent
```

Both buckets have SSE-S3 encryption. The handbook bucket has
versioning enabled; the events bucket is append-only.

## Schemas

### DocumentMetadata

```typescript
{ id, title, version, source, seededAt }
```

Written by the init script. One per document.

### HandbookEntry

```typescript
{ id, docId, title, category, body, sourcePages[], lastUpdated }
```

IDs are lowercase kebab-case slugs. Categories: enrollment, hours,
health, safety, food, curriculum, staff, policies, communication,
fees, transportation, special-needs, discipline, emergencies,
general.

### OperatorOverride

```typescript
{ id, docId, title, category, body, sourcePages[],
  createdAt, updatedAt?, createdBy?, replacesEntryId? }
```

Same shape as entries plus timestamps and an optional
`replacesEntryId` for superseding a seed entry.

### NeedsAttentionEvent

```typescript
{ id, docId, question, result (AnswerContract),
  createdAt, resolvedAt?, resolvedByOverrideId? }
```

Events carry the `docId` so resolution targets the correct
document's override layer. Old events without `docId` are migrated
on read to the active document.

## Storage adapters

All storage access goes through typed adapters in `lib/storage/`.
No other code in the project imports the MinIO SDK.

| Adapter | File | Operations |
|---------|------|------------|
| Handbook | `handbook.ts` | `getActiveDocumentId()`, `getDocumentMetadata()`, `listHandbookEntries()`, `getHandbookEntry()` — all read-only |
| Overrides | `overrides.ts` | `listOperatorOverrides()`, `getOperatorOverride()`, `createOperatorOverride()`, `updateOperatorOverride()`, `deleteOperatorOverride()` |
| Needs-attention | `needs-attention.ts` | `logNeedsAttention()`, `listOpenNeedsAttention()`, `resolveNeedsAttention()` |
| JSON I/O | `minio-json.ts` | `readJson()`, `writeJson()`, `removeJson()`, `listObjectKeys()` — shared helpers |

## Document selection

`getActiveDocumentId()` in `handbook.ts` returns a constant
(`"dcfd-family-handbook"`) today. This is the single seam for
future per-user document routing — a session layer replaces the
body of this function; nothing else changes.

## Seed file format

`data/seed-handbook.json`:

```json
{
  "document": {
    "id": "sunflower-handbook",
    "title": "Sunflower Early Learning Family Handbook",
    "version": "2026",
    "source": "sunflower-family-handbook.pdf"
  },
  "entries": [
    { "id": "contact", "title": "...", ... }
  ]
}
```

The init script reads `document.id`, writes metadata, and streams
each entry into `documents/{docId}/entries/{id}.json`.

## Key files

- `lib/storage/types.ts` — all Zod schemas
- `lib/storage/handbook.ts` — read-only seed layer adapter
- `lib/storage/overrides.ts` — mutable override layer adapter
- `lib/storage/needs-attention.ts` — event log adapter
- `lib/storage/minio-json.ts` — shared MinIO JSON helpers
- `lib/storage/client.ts` — lazy-memoized MinIO SDK client
- `data/seed-handbook.json` — the source document
- `docker/minio-init/init.sh` — seed + migration script
