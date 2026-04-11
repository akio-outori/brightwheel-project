// GET /api/parent-replies?ids=<id>,<id>,...
//
// The parent client's polling target. When the parent asks a question
// that escalates, /api/ask returns a `needs_attention_event_id` that
// the ParentChat component stashes in local state. This endpoint
// takes a batch of those ids and returns the subset that (a) exist,
// (b) have been resolved by an operator, and (c) carry an
// operatorReply. Anything still open, missing, or resolved without
// a reply is omitted — an empty response is a valid "nothing new
// yet" signal.
//
// Scope is deliberately narrow: the parent client already knows
// which ids it is waiting on, so this is not a "list everything"
// endpoint. That keeps the surface from being a generic event
// browser and caps the fan-out to what the client actually needs.
//
// No auth: this is a demo and the ids are UUIDs the parent client
// already holds. A production deployment would bind events to a
// session token and validate ownership here.

import { ensureStorageReady } from "@/lib/storage/init";
import { getResolvedEventsWithReplies } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bound the batch size so a malformed or malicious query can't
// trigger an O(n) scan of thousands of object keys. Parents will
// realistically have at most a handful of in-flight escalations.
const MAX_IDS_PER_REQUEST = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const rawIds = searchParams.get("ids") ?? "";
    if (!rawIds) {
      return Response.json({ replies: [] });
    }

    // Split, trim, validate shape, dedupe, cap. Rejecting non-UUID
    // shapes at the boundary keeps the storage layer from having to
    // worry about pathological keys.
    const ids = Array.from(
      new Set(
        rawIds
          .split(",")
          .map((s) => s.trim())
          .filter((s) => UUID_RE.test(s)),
      ),
    ).slice(0, MAX_IDS_PER_REQUEST);

    if (ids.length === 0) {
      return Response.json({ replies: [] });
    }

    await ensureStorageReady();
    const events = await getResolvedEventsWithReplies(ids);

    // Return only the fields the parent client needs. Don't leak
    // the full event shape — the result block (the LLM's draft) and
    // other internals are operator-facing concerns.
    const replies = events.map((e) => ({
      id: e.id,
      question: e.question,
      reply: e.operatorReply,
      resolvedAt: e.resolvedAt,
    }));

    return Response.json({ replies });
  } catch (err) {
    console.error("[/api/parent-replies GET] failed:", err);
    return Response.json({ error: "Could not load replies." }, { status: 500 });
  }
}
