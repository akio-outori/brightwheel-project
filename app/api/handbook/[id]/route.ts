// GET /api/handbook/[id] — fetch a single seed entry (read-only)
//
// The handbook layer is immutable, so there is no PUT on this route.
// Operator edits go through the override layer instead.

import { getActiveDocumentId, getHandbookEntry } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const docId = getActiveDocumentId();
    const entry = await getHandbookEntry(docId, id);
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
