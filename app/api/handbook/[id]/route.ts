// GET /api/handbook/[id]   — fetch a single entry
// PUT /api/handbook/[id]   — update an existing entry

import { z } from "zod";
import {
  HandbookCategorySchema,
  getHandbookEntry,
  updateHandbookEntry,
  StorageError,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    category: HandbookCategorySchema.optional(),
    body: z.string().min(1).max(20_000).optional(),
    sourcePages: z.array(z.number().int().nonnegative()).optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const entry = await getHandbookEntry(id);
    if (!entry) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    return Response.json(entry);
  } catch (err) {
    console.error(`[/api/handbook/${id} GET] failed:`, err);
    return Response.json(
      { error: "Could not load entry." },
      { status: 500 },
    );
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
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = UpdateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request." },
      { status: 400 },
    );
  }

  try {
    const entry = await updateHandbookEntry(id, parsed.data);
    return Response.json(entry);
  } catch (err) {
    if (err instanceof StorageError && err.code === "not_found") {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    console.error(`[/api/handbook/${id} PUT] failed:`, err);
    return Response.json(
      { error: "Could not update entry." },
      { status: 500 },
    );
  }
}
