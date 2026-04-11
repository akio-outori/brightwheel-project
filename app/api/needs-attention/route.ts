// GET /api/needs-attention — list needs-attention events.
//
// Query params:
//   ?state=open  (default) — only events where resolvedAt is unset
//   ?state=all            — both open and resolved events
//
// Default is `open` to preserve the "bell count" contract for
// callers that just want "how many parent questions still need a
// human right now". The operator console uses `?state=all` so it
// can also show the history of resolved events under the "By
// staff" filter.

import { ensureStorageReady } from "@/lib/storage/init";
import { listAllNeedsAttention, listOpenNeedsAttention } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    await ensureStorageReady();
    const { searchParams } = new URL(req.url);
    const state = searchParams.get("state") ?? "open";
    const events = state === "all" ? await listAllNeedsAttention() : await listOpenNeedsAttention();
    return Response.json({ events });
  } catch (err) {
    console.error("[/api/needs-attention GET] failed:", err);
    return Response.json({ error: "Could not load needs-attention feed." }, { status: 500 });
  }
}
