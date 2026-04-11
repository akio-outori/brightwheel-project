// GET /api/handbook — read-only document + seed entries + overrides
//
// The handbook layer is immutable after seed, so there is no POST on
// this route. Operator mutations go through /api/overrides instead.
// This endpoint returns everything the UI needs to render the parent
// surface and the operator console's "current document" view in a
// single round trip: metadata, seed entries, and overrides.

import { ensureStorageReady } from "@/lib/storage/init";
import {
  getActiveDocumentId,
  getDocumentMetadata,
  listHandbookEntries,
  listOperatorOverrides,
  StorageError,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await ensureStorageReady();
    const docId = getActiveDocumentId();
    const [metadata, entries, overrides] = await Promise.all([
      getDocumentMetadata(docId),
      listHandbookEntries(docId),
      listOperatorOverrides(docId),
    ]);
    return Response.json({ document: { metadata, entries, overrides } });
  } catch (err) {
    if (err instanceof StorageError && err.code === "not_found") {
      return Response.json({ error: "Active document has not been seeded." }, { status: 404 });
    }
    console.error("[/api/handbook GET] failed:", err);
    return Response.json({ error: "Could not load handbook." }, { status: 500 });
  }
}
