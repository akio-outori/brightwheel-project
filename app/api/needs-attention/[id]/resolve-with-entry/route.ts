// POST /api/needs-attention/[id]/resolve-with-entry
//
// The primary "answer the parent" endpoint. Every call resolves the
// event with the operator's parent-facing reply; creating a handbook
// override is an OPTIONAL side effect when the operator explicitly
// checks "also add this to the handbook."
//
// The split matters because escalations are not homogeneous. A
// child-specific question ("my son fell at pickup, is he OK?") is a
// one-off staff-to-parent reply that must never become a reusable
// handbook entry. A generalizable question ("do you offer summer
// camp?") is exactly the kind of answer the operator wants banked
// in the handbook so the next parent gets it automatically. The
// checkbox is the seam between those two cases — the operator
// decides, because the operator is the one who knows.
//
// Request shape:
//   {
//     replyToParent: string,                // required, always
//     handbookOverride?: {                  // optional opt-in
//       title: string,
//       category: HandbookCategory,
//       sourcePages?: number[],
//       replacesEntryId?: string | null,
//     }
//   }
//
// When `handbookOverride` is present, the override body is the same
// text as `replyToParent` — the operator wrote one message, and both
// surfaces receive it. The parent client polls /api/parent-replies
// using event ids it collected from /api/ask to surface the reply.
//
// Error ordering: if the operator opted into a handbook override
// and the override create fails, we return the error before
// touching the event — the resolve should not happen if the
// operator's stated intent (reply + override) cannot be fully
// satisfied. If the override succeeds but the resolve fails, we
// return a partial-success response so the operator can retry.
// We do not delete the override — it's visible in the handbook
// panel and the operator can clean it up if it's orphaned.
//
// The URL path keeps its historical `/resolve-with-entry` suffix to
// avoid UI churn.

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

const FixRequestSchema = z
  .object({
    replyToParent: z.string().min(1).max(4000),
    handbookOverride: z
      .object({
        title: z.string().min(1).max(200),
        category: HandbookCategorySchema,
        sourcePages: z.array(z.number().int().nonnegative()).default([]),
        replacesEntryId: z.string().min(1).max(120).nullable().default(null),
      })
      .strict()
      .optional(),
  })
  .strict();

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
  const { replyToParent, handbookOverride } = parsed.data;

  const docId = getActiveDocumentId();

  // Step 1 (conditional): create the operator override if the
  // operator opted in. The override body is the same text as the
  // parent-facing reply — one message, two surfaces.
  let override: Awaited<ReturnType<typeof createOperatorOverride>> | undefined;
  if (handbookOverride) {
    try {
      override = await createOperatorOverride(docId, {
        title: handbookOverride.title,
        category: handbookOverride.category,
        body: replyToParent,
        sourcePages: handbookOverride.sourcePages,
        replacesEntryId: handbookOverride.replacesEntryId,
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
  }

  // Step 2: resolve the event, storing the parent reply AND the
  // override id (if we created one). If this fails after the
  // override was created, the override is orphaned until the
  // operator retries — we return partial-success so the UI can
  // message that clearly.
  try {
    const resolved = await resolveNeedsAttention(eventId, {
      operatorReply: replyToParent,
      resolvedByOverrideId: override?.id,
    });
    return Response.json({ override: override ?? null, event: resolved }, { status: 201 });
  } catch (err) {
    console.error(`[/api/needs-attention/${eventId}/resolve-with-entry] resolve failed:`, err);
    if (err instanceof StorageError && err.code === "not_found") {
      return Response.json(
        {
          error: override
            ? "The handbook entry was saved but the event could not be found. It may have been resolved already."
            : "The event could not be found. It may have been resolved already.",
          override: override ?? null,
          partialSuccess: Boolean(override),
        },
        { status: 409 },
      );
    }
    return Response.json(
      {
        error: override
          ? "The handbook entry was saved but the event could not be resolved. Retry from the feed."
          : "Could not resolve the event. Please try again.",
        override: override ?? null,
        partialSuccess: Boolean(override),
      },
      { status: 500 },
    );
  }
}
