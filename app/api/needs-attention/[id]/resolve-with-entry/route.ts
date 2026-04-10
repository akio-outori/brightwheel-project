// POST /api/needs-attention/[id]/resolve-with-entry
//
// The atomic fix endpoint. Does both halves of the operator's
// "answer this" action in one handler:
//   1. Create a new operator override from the draft
//   2. Resolve the needs-attention event, linking to that override
//
// The URL path keeps its historical `/resolve-with-entry` suffix to
// avoid UI churn; internally the resolver is always an override
// now, since the handbook layer is immutable after seed.
//
// If step 2 fails after step 1 succeeded, we return a partial-success
// response so the operator can retry the resolve step from the feed.
// We do not delete the override — the operator will see it in the
// overrides list and can clean it up if it's truly orphaned.
//
// This atomicity matters because the original client-side two-call
// flow could leave the override persisted and the event still open
// if the network dropped between calls.

import { z } from "zod";
import {
  HandbookCategorySchema,
  createOperatorOverride,
  getActiveDocumentId,
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
  replacesEntryId: z.string().min(1).max(120).nullable().default(null),
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
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = FixRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const docId = getActiveDocumentId();

  // Step 1: create the operator override.
  let override;
  try {
    override = await createOperatorOverride(docId, {
      ...parsed.data,
      createdBy: null,
    });
  } catch (err) {
    if (err instanceof StorageError && err.code === "already_exists") {
      return Response.json(
        { error: "An override with that title already exists." },
        { status: 409 },
      );
    }
    console.error(`[/api/needs-attention/${eventId}/resolve-with-entry] create failed:`, err);
    return Response.json({ error: "Could not create override." }, { status: 500 });
  }

  // Step 2: resolve the event. If this fails, the override exists
  // but the event is still open — return a partial-success error so
  // the operator can retry the resolve step.
  try {
    const resolved = await resolveNeedsAttention(eventId, override.id);
    return Response.json({ override, event: resolved }, { status: 201 });
  } catch (err) {
    console.error(
      `[/api/needs-attention/${eventId}/resolve-with-entry] resolve failed after override created:`,
      err,
    );
    if (err instanceof StorageError && err.code === "not_found") {
      return Response.json(
        {
          error:
            "Override was created but the needs-attention event could not be found. It may have been resolved already. The new override is live.",
          override,
          partialSuccess: true,
        },
        { status: 409 },
      );
    }
    return Response.json(
      {
        error:
          "Override was created but the event could not be resolved. The new override is live; retry resolving the event from the feed.",
        override,
        partialSuccess: true,
      },
      { status: 500 },
    );
  }
}
