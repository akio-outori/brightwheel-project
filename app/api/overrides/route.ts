// GET  /api/overrides  — list operator overrides for the active document
// POST /api/overrides  — create a new override
//
// The overrides layer is where the operator closes the trust loop —
// patching gaps, clarifying policy, and superseding stale seed
// entries. Reads and writes are scoped to the active document via
// getActiveDocumentId().

import { z } from "zod";
import {
  HandbookCategorySchema,
  createOperatorOverride,
  getActiveDocumentId,
  listOperatorOverrides,
  StorageError,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateRequestSchema = z.object({
  title: z.string().min(1).max(200),
  category: HandbookCategorySchema,
  body: z.string().min(1).max(20_000),
  sourcePages: z.array(z.number().int().nonnegative()).default([]),
  replacesEntryId: z.string().min(1).max(120).nullable().default(null),
  createdBy: z.string().min(1).max(200).nullable().default(null),
});

export async function GET(): Promise<Response> {
  try {
    const docId = getActiveDocumentId();
    const overrides = await listOperatorOverrides(docId);
    return Response.json({ overrides });
  } catch (err) {
    console.error("[/api/overrides GET] failed:", err);
    return Response.json(
      { error: "Could not load overrides." },
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
    const docId = getActiveDocumentId();
    const override = await createOperatorOverride(docId, parsed.data);
    return Response.json(override, { status: 201 });
  } catch (err) {
    if (err instanceof StorageError && err.code === "already_exists") {
      return Response.json(
        { error: "An override with that title already exists." },
        { status: 409 },
      );
    }
    console.error("[/api/overrides POST] failed:", err);
    return Response.json(
      { error: "Could not create override." },
      { status: 500 },
    );
  }
}
