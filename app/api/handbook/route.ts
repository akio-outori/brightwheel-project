// GET /api/handbook   — list all handbook entries
// POST /api/handbook  — create a new entry

import { z } from "zod";
import {
  HandbookCategorySchema,
  createHandbookEntry,
  listHandbookEntries,
  StorageError,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateRequestSchema = z.object({
  title: z.string().min(1).max(200),
  category: HandbookCategorySchema,
  body: z.string().min(1).max(20_000),
  sourcePages: z.array(z.number().int().nonnegative()).default([]),
});

export async function GET(): Promise<Response> {
  try {
    const entries = await listHandbookEntries();
    return Response.json({ entries });
  } catch (err) {
    console.error("[/api/handbook GET] failed:", err);
    return Response.json(
      { error: "Could not load handbook." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = CreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid request.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const entry = await createHandbookEntry(parsed.data);
    return Response.json(entry, { status: 201 });
  } catch (err) {
    if (err instanceof StorageError && err.code === "already_exists") {
      return Response.json(
        { error: "An entry with that title already exists." },
        { status: 409 },
      );
    }
    console.error("[/api/handbook POST] failed:", err);
    return Response.json(
      { error: "Could not create entry." },
      { status: 500 },
    );
  }
}
