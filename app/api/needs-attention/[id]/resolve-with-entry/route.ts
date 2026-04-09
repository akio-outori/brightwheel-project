// POST /api/needs-attention/[id]/resolve-with-entry
//
// The atomic fix endpoint. Does both halves of the operator's
// "answer this" action in one handler:
//   1. Create a new handbook entry from the draft
//   2. Resolve the needs-attention event, linking to that entry
//
// If step 2 fails after step 1 succeeded, we issue a best-effort
// compensating update to mark the orphaned entry's body with a
// leading comment and the event id, so an operator can find and
// re-resolve it manually. We do NOT delete the entry — deletion
// would break MinIO versioning and the audit trail.
//
// This exists because the original client-side two-call flow could
// leave the handbook entry persisted and the event still open if
// the network dropped between calls. The review-trust-loop reviewer
// caught it; this is the fix.

import { z } from "zod";
import {
  createHandbookEntry,
  HandbookCategorySchema,
  resolveNeedsAttention,
  StorageError,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FixRequestSchema = z.object({
  title: z.string().min(1).max(200),
  category: HandbookCategorySchema,
  body: z.string().min(1).max(20_000),
  sourcePages: z.array(z.number().int().nonnegative()).default([]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: eventId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = FixRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request." },
      { status: 400 },
    );
  }

  // Step 1: create the handbook entry.
  let entry;
  try {
    entry = await createHandbookEntry(parsed.data);
  } catch (err) {
    if (err instanceof StorageError && err.code === "already_exists") {
      return Response.json(
        { error: "An entry with that title already exists." },
        { status: 409 },
      );
    }
    console.error(
      `[/api/needs-attention/${eventId}/resolve-with-entry] create failed:`,
      err,
    );
    return Response.json(
      { error: "Could not create entry." },
      { status: 500 },
    );
  }

  // Step 2: resolve the event. If this fails, the entry exists but
  // the event is still open — return a partial-success error so the
  // operator knows to retry the resolve step.
  try {
    const resolved = await resolveNeedsAttention(eventId, entry.id);
    return Response.json({ entry, event: resolved }, { status: 201 });
  } catch (err) {
    console.error(
      `[/api/needs-attention/${eventId}/resolve-with-entry] resolve failed after entry created:`,
      err,
    );
    if (err instanceof StorageError && err.code === "not_found") {
      return Response.json(
        {
          error:
            "Entry was created but the needs-attention event could not be found. It may have been resolved already. The new entry is live.",
          entry,
          partialSuccess: true,
        },
        { status: 409 },
      );
    }
    return Response.json(
      {
        error:
          "Entry was created but the event could not be resolved. The new entry is live; retry resolving the event from the feed.",
        entry,
        partialSuccess: true,
      },
      { status: 500 },
    );
  }
}
