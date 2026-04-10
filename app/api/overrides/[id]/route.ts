// GET    /api/overrides/[id]  — fetch a single override
// PUT    /api/overrides/[id]  — update an override
// DELETE /api/overrides/[id]  — remove an override

import { z } from "zod";
import {
  HandbookCategorySchema,
  deleteOperatorOverride,
  getActiveDocumentId,
  getOperatorOverride,
  StorageError,
  updateOperatorOverride,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    category: HandbookCategorySchema.optional(),
    body: z.string().min(1).max(20_000).optional(),
    sourcePages: z.array(z.number().int().nonnegative()).optional(),
    replacesEntryId: z.string().min(1).max(120).nullable().optional(),
    createdBy: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const docId = getActiveDocumentId();
    const override = await getOperatorOverride(docId, id);
    if (!override) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    return Response.json(override);
  } catch (err) {
    console.error(`[/api/overrides/${id} GET] failed:`, err);
    return Response.json({ error: "Could not load override." }, { status: 500 });
  }
}

export async function PUT(
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

  const parsed = UpdateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const docId = getActiveDocumentId();
    const override = await updateOperatorOverride(docId, id, parsed.data);
    return Response.json(override);
  } catch (err) {
    if (err instanceof StorageError && err.code === "not_found") {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    console.error(`[/api/overrides/${id} PUT] failed:`, err);
    return Response.json({ error: "Could not update override." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const docId = getActiveDocumentId();
    await deleteOperatorOverride(docId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error(`[/api/overrides/${id} DELETE] failed:`, err);
    return Response.json({ error: "Could not delete override." }, { status: 500 });
  }
}
