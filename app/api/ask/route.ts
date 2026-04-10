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
//   4. Run the deterministic post-response classifier pipeline
//      over the draft (hallucination, self-escalation, coverage,
//      lexical grounding, numeric absence, entity absence, medical
//      instruction shape)
//   5. If any channel holds, return a stock "being reviewed"
//      response to the parent and log the MODEL'S DRAFT to
//      needs-attention for operator review (the operator sees what
//      the model would have said, the parent doesn't)
//   6. Otherwise return the model's draft as-is; if the model's
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
import {
  getActiveDocumentId,
  getDocumentMetadata,
  listHandbookEntries,
  listOperatorOverrides,
  logNeedsAttention,
} from "@/lib/storage";

export const runtime = "nodejs";

const AskRequestSchema = z.object({
  question: z.string().min(1).max(2000),
});

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
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
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
    // 2. Resolve the active document and load both layers.
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
      await logNeedsAttention({
        docId,
        question,
        result: {
          answer: "",
          confidence: "low",
          cited_entries: [],
          escalate: true,
          escalation_reason: `held_for_review:${preflight.reason}`,
        },
      });
      console.log(
        `[/api/ask] preflight hold (${preflight.reason}): ${preflight.detail ?? "(no detail)"}`,
      );
      return Response.json(stockResponse);
    }

    // 4. Build MCPData and call the LLM.
    const cfg = await getActiveAgentConfig();
    const systemPromptText = cfg.systemPrompt;
    const mcpData = MCPData({
      center_name: "Albuquerque DCFD Family Front Desk",
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

    // 4. Run the deterministic post-response classifier pipeline.
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

    // 5. On hold: the parent sees a stock response; the operator
    // sees the model's ORIGINAL draft in the needs-attention event.
    if (pipeline.verdict === "hold") {
      const stockResponse = buildStockResponse(pipeline.reason);

      // Log the MODEL'S DRAFT (not the stock) so the operator has
      // full context about what the model wanted to say.
      await logNeedsAttention({
        docId,
        question,
        result: {
          ...draft,
          // Mirror the hold reason into escalation_reason so the
          // operator UI can render the badge off a single field.
          escalation_reason: `held_for_review:${pipeline.reason}`,
        },
      });

      console.log(
        `[/api/ask] held by ${pipeline.channel} (${pipeline.reason}): ${pipeline.detail ?? "(no detail)"}`,
      );
      return Response.json(stockResponse);
    }

    // 6. Passing path. If the model's draft happened to be low
    // confidence without escalating, log it anyway so the operator
    // can see the pattern. (The self-escalation channel already
    // holds escalate=true drafts above, so that branch is dead —
    // this catches the rare confidence=low + escalate=false case.)
    if (draft.confidence === "low") {
      await logNeedsAttention({
        docId,
        question,
        result: draft,
      });
    }

    return Response.json(draft);
  } catch (err) {
    // Generic failure — log server-side, return a safe error to the parent.
    console.error("[/api/ask] request failed:", err);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
