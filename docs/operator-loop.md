# Operator Loop

## The flow

When the preflight classifier or the post-response pipeline holds
a draft, the parent sees a stock "being reviewed" response and a
needs-attention event is written to the events bucket. The
operator's job is to see the event, understand what happened, and
close the loop by creating an operator override.

```
Parent asks → classifier/pipeline holds → stock response to parent
                                        → needs-attention event logged
                                        → operator notified

Operator opens /admin → sees event with hold reason + model draft
                      → clicks "Answer this"
                      → writes a title, category, body
                      → override created + event resolved atomically

Next parent asks the same question → override cited in the answer
```

## Needs-attention feed

`GET /api/needs-attention` returns open events sorted newest first,
scanned across a 14-day window of date-partitioned keys in the
events bucket.

Each event carries:
- The parent's question
- The model's full draft (even if the parent didn't see it)
- The `escalation_reason` including the `held_for_review:` prefix

## Hold-reason badges

The operator UI parses the `held_for_review:{reason}` prefix from
`escalation_reason` and renders a color-coded badge:

| Badge | Tone | Meaning |
|-------|------|---------|
| Hallucinated citation | Red | Model cited a non-existent source |
| Model self-escalated | Amber | Model flagged it for human review |
| No direct coverage | Amber | Model found nothing relevant |
| Medical instruction | Red | Model directed parent to take medical action |
| Fabricated number | Red | Number in answer doesn't exist in the document |
| Fabricated entity | Red | Named entity doesn't exist in the document |
| Specific child | Red | Preflight caught a specific-child question |

## Fix dialog

The fix dialog (`FixDialog`) posts to the atomic endpoint
`POST /api/needs-attention/[id]/resolve-with-entry` which:

1. Creates an operator override from the draft title/category/body
2. Resolves the needs-attention event, linking it to the override ID
3. Returns both in a single response

If step 2 fails after step 1 succeeded, the response includes
`partialSuccess: true` so the operator knows the override exists
but the event is still open.

The UI revalidates both the needs-attention feed and the handbook
list via SWR `mutate()` in the same tick — the event disappears
and the override appears simultaneously.

## Override CRUD

Operators can also create overrides directly (not through the fix
dialog) via `/admin/overrides/new`, and edit or delete existing
overrides via `/admin/overrides/[id]`.

Routes:
- `GET /api/overrides` — list overrides for the active document
- `POST /api/overrides` — create
- `GET /api/overrides/[id]` — read
- `PUT /api/overrides/[id]` — update
- `DELETE /api/overrides/[id]` — delete

## Notification bell

`NotificationBell` in the admin header uses SWR to poll
`/api/needs-attention` every 10 seconds and displays:
- An unread count badge (rose when new events arrived)
- Browser Notifications API push when the count increases
- Permission request on first admin page load

Scoped per document today; the hook filters by `docId` when
multi-document routing is added.

## Key files

- `components/operator/OperatorDashboard.tsx` — operator landing
- `components/operator/QuestionLogPanel.tsx` — needs-attention feed
- `components/operator/KnowledgePanel.tsx` — handbook + overrides
- `components/operator/NotificationBell.tsx` — badge + browser push
- `app/api/needs-attention/` — event list + resolve routes
- `app/api/needs-attention/[id]/resolve-with-entry/route.ts` — atomic fix
- `app/api/overrides/` — override CRUD routes
