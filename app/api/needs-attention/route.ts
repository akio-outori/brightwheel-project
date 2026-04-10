// GET /api/needs-attention — list open escalation events (newest first)

import { ensureStorageReady } from "@/lib/storage/init";
import { listOpenNeedsAttention } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await ensureStorageReady();
    const events = await listOpenNeedsAttention();
    return Response.json({ events });
  } catch (err) {
    console.error("[/api/needs-attention GET] failed:", err);
    return Response.json({ error: "Could not load needs-attention feed." }, { status: 500 });
  }
}
