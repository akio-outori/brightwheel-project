// POST /api/needs-attention/[id] — resolve an open event, linking
// it to the operator override that answered the question.
//
// DEPRECATED: This is the non-atomic resolution path (create override
// first, then resolve). The atomic path is
// /api/needs-attention/[id]/resolve-with-entry — prefer that from
// the UI. This endpoint exists for tests and for flows where an
// override already exists. It resolves without an operatorReply,
// which means the parent will never see a staff response via the
// polling channel. New callers should use resolve-with-entry instead.

import { z } from "zod";
import { resolveNeedsAttention, StorageError } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ResolveRequestSchema = z
  .object({
    resolvedByOverrideId: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9-]+$/),
    operatorReply: z.string().min(1).max(4000).optional(),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = ResolveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "resolvedByOverrideId is required." }, { status: 400 });
  }

  try {
    const event = await resolveNeedsAttention(id, {
      resolvedByOverrideId: parsed.data.resolvedByOverrideId,
      ...(parsed.data.operatorReply ? { operatorReply: parsed.data.operatorReply } : {}),
    });
    return Response.json(event);
  } catch (err) {
    if (err instanceof StorageError && err.code === "not_found") {
      return Response.json({ error: "Event not found or already resolved." }, { status: 404 });
    }
    console.error(`[/api/needs-attention/${id} POST] failed:`, err);
    return Response.json({ error: "Could not resolve event." }, { status: 500 });
  }
}
