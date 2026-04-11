// POST /api/ask — the parent question endpoint. This is the one place
// in the parent surface that touches lib/llm and lib/storage. Components
// consume the JSON response from this route and never import the LLM
// or storage modules directly.
//
// The flow, in order:
//   1. Parse + validate the incoming question (Zod)
//   2. Resolve the active document and load both layers
//      (seed entries + operator overrides)
//   3. Call askLLM with branded inputs carrying mcpData.document
//   4. If the model returned `refusal: true` (out-of-scope /
//      off-topic / meta), return the draft directly to the parent.
//      Refusals bypass the post-response pipeline AND the
//      needs-attention log — there is nothing for the operator to
//      follow up on, and the pipeline's grounding channels don't
//      apply to a polite "I can't help with that."
//   5. Run the deterministic post-response classifier pipeline
//      over the draft (hallucination, self-escalation, coverage,
//      lexical grounding, numeric absence, entity absence, medical
//      instruction shape)
//   6. If any channel holds, return a stock "being reviewed"
//      response to the parent and log the MODEL'S DRAFT to
//      needs-attention for operator review (the operator sees what
//      the model would have said, the parent doesn't)
//   7. Otherwise return the model's draft as-is; if the model's
//      draft happened to self-escalate, log it to needs-attention
//      but still return it (the self-escalation channel already
//      caught it above so this path is dead — kept defensively)
//
// Errors are translated at the boundary. Internal details never leak
// to the parent — a caught exception becomes a generic 500.

import { z } from "zod";
import {
  AppIntent,
  MCPData,
  SystemPrompt,
  UserInput,
  askLLM,
  type AnswerContract,
} from "@/lib/llm";
import { getActiveAgentConfig } from "@/lib/llm/config";
import { classifySpecificChild } from "@/lib/llm/preflight";
import {
  buildStockResponse,
  runPostResponsePipeline,
  type GroundingSource,
} from "@/lib/llm/post-response";
import { ensureStorageReady } from "@/lib/storage/init";
import {
  getActiveDocumentId,
  getDocumentMetadata,
  listHandbookEntries,
  listOperatorOverrides,
  logNeedsAttention,
} from "@/lib/storage";

export const runtime = "nodejs";

const AskRequestSchema = z
  .object({
    question: z.string().min(1).max(2000),
  })
  .strict();

// Intent is static. It's the app's instruction to the model about
// what *kind* of task this is. Never includes user data.
const INTENT = AppIntent(
  "Answer the parent's question using only the provided handbook " +
    "entries and operator overrides for the active document. Return JSON " +
    "matching the AnswerContract. Cite the ids you used. Prefer an " +
    "override when it directly addresses the question. If nothing in " +
    "either layer covers the question, set confidence to 'low' and " +
    "escalate. Sensitive topics always escalate.",
);

export async function POST(req: Request): Promise<Response> {
  // 1. Parse the request body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = AskRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request: question is required (1–2000 chars)." },
      { status: 400 },
    );
  }
  const { question } = parsed.data;

  try {
    // 2. Ensure storage is initialized (buckets + seed).
    await ensureStorageReady();

    // 3. Resolve the active document and load both layers.
    const docId = getActiveDocumentId();
    const [metadata, entries, overrides] = await Promise.all([
      getDocumentMetadata(docId),
      listHandbookEntries(docId),
      listOperatorOverrides(docId),
    ]);

    // 3. Preflight: specific-child classifier. If the parent's
    // question is clearly about an individual child's health or
    // safety situation (possessive + family noun, proper name near
    // health words, third-person pronouns in medical context), hold
    // immediately — don't spend an LLM call generating a draft that
    // the post-response pipeline would catch anyway. The parent
    // gets the stock "a staff member is reviewing this" response.
    const preflight = classifySpecificChild(question);
    if (preflight.verdict === "hold") {
      const stockResponse = buildStockResponse(preflight.reason);
      const event = await logNeedsAttention({
        docId,
        question,
        result: {
          answer: "(Preflight held — no model draft was generated)",
          confidence: "low",
          cited_entries: [],
          escalate: true,
          escalation_reason: `held_for_review:${preflight.reason}`,
        },
      });
      console.warn(
        `[/api/ask] preflight hold (${preflight.reason}): ${preflight.detail ?? "(no detail)"}`,
      );
      // Surface the event id so the parent client can poll
      // /api/parent-replies for the operator's follow-up.
      return Response.json({ ...stockResponse, needs_attention_event_id: event.id });
    }

    // 4. Build MCPData and call the LLM.
    const cfg = await getActiveAgentConfig();
    const systemPromptText = cfg.systemPrompt;
    const mcpData = MCPData({
      center_name: `${metadata.title} Front Desk`,
      document: {
        id: metadata.id,
        title: metadata.title,
        version: metadata.version,
        entries: entries.map((e) => ({
          id: e.id,
          title: e.title,
          category: e.category,
          body: e.body,
          source_pages: e.sourcePages,
        })),
        overrides: overrides.map((o) => ({
          id: o.id,
          title: o.title,
          category: o.category,
          body: o.body,
          source_pages: o.sourcePages,
          replaces_entry_id: o.replacesEntryId,
        })),
      },
    });

    const draft: AnswerContract = await askLLM(
      SystemPrompt(systemPromptText),
      INTENT,
      mcpData,
      UserInput(question),
    );

    // 4. Refusal short-circuit. If the model flagged this as
    // out-of-scope / off-topic (refusal: true), return the draft
    // directly. Refusals bypass the pipeline and needs-attention
    // both — there is nothing for an operator to follow up on, and
    // the grounding channels (coverage, numeric, entity) would
    // otherwise hold on an empty citation list. We do normalize the
    // shape defensively: a refusal must not also claim to escalate,
    // and must carry an empty citation set.
    if (draft.refusal === true) {
      const refusal: AnswerContract = {
        ...draft,
        escalate: false,
        cited_entries: [],
        directly_addressed_by: [],
        escalation_reason: draft.escalation_reason ?? "out_of_scope",
      };
      return Response.json(refusal);
    }

    // 5. Run the deterministic post-response classifier pipeline.
    // The pipeline flattens entries + overrides into a single list
    // of GroundingSource objects so channels don't care which layer
    // a source came from.
    const allSources: GroundingSource[] = [
      ...entries.map<GroundingSource>((e) => ({
        id: e.id,
        title: e.title,
        body: e.body,
      })),
      ...overrides.map<GroundingSource>((o) => ({
        id: o.id,
        title: o.title,
        body: o.body,
      })),
    ];

    const pipeline = runPostResponsePipeline({
      question,
      draft,
      allSources,
    });

    // 6. On hold: the parent sees a stock response; the operator
    // sees the model's ORIGINAL draft in the needs-attention event.
    if (pipeline.verdict === "hold") {
      const stockResponse = buildStockResponse(pipeline.reason);

      // Log the MODEL'S DRAFT (not the stock) so the operator has
      // full context about what the model wanted to say.
      const event = await logNeedsAttention({
        docId,
        question,
        result: {
          ...draft,
          // Mirror the hold reason into escalation_reason so the
          // operator UI can render the badge off a single field.
          escalation_reason: `held_for_review:${pipeline.reason}`,
        },
      });

      console.warn(
        `[/api/ask] held by ${pipeline.channel} (${pipeline.reason}): ${pipeline.detail ?? "(no detail)"}`,
      );
      return Response.json({ ...stockResponse, needs_attention_event_id: event.id });
    }

    // 7. Passing path. If the model's draft happened to be low
    // confidence without escalating, log it anyway so the operator
    // Enforce the trust-loop invariant at the API boundary: a
    // low-confidence response must always escalate. The client
    // guards this too, but the API is the authoritative boundary.
    if (draft.confidence === "low") {
      const enforced: AnswerContract = {
        ...draft,
        escalate: true,
        escalation_reason: draft.escalation_reason ?? "low_confidence",
      };
      const event = await logNeedsAttention({ docId, question, result: enforced });
      return Response.json({ ...enforced, needs_attention_event_id: event.id });
    }

    return Response.json(draft);
  } catch (err) {
    // Generic failure — log server-side, return a safe error to the parent.
    console.error("[/api/ask] request failed:", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
