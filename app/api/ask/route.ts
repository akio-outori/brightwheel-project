// POST /api/ask — the parent question endpoint. This is the one place
// in the parent surface that touches lib/llm and lib/storage. Components
// consume the JSON response from this route and never import the LLM
// or storage modules directly.
//
// The flow, in order:
//   1. Parse + validate the incoming question (Zod)
//   2. Static sensitive-topic check on the raw text (defense in depth)
//   3. Load the handbook index (single read from MinIO)
//   4. Call askLLM with branded inputs
//   5. Apply the sensitive-topic override — if the static check fired,
//      the response escalates regardless of what the model said
//   6. If the final result escalates (low confidence or escalate flag),
//      log a needs-attention event BEFORE responding
//   7. Return the AnswerContract JSON
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
  isSensitiveTopic,
  type AnswerContract,
} from "@/lib/llm";
import { getActiveAgentConfig } from "@/lib/llm/config";
import {
  listHandbookEntries,
  logNeedsAttention,
} from "@/lib/storage";

export const runtime = "nodejs";

const AskRequestSchema = z.object({
  question: z.string().min(1).max(2000),
});

// Intent is static. It's the app's instruction to the model about
// what *kind* of task this is. Never includes user data.
const INTENT = AppIntent(
  "Answer the parent's question using only the provided handbook entries. " +
    "Return JSON matching the AnswerContract. Cite the entry IDs you used. " +
    "If no entry covers the question, set confidence to 'low' and escalate. " +
    "Sensitive topics (medical, safety, custody, allergies) always escalate.",
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
    // 2. Sensitive-topic check (defense in depth).
    const sensitive = isSensitiveTopic(question);

    // 3. Load handbook entries for grounding.
    const handbook = await listHandbookEntries();

    // 4. Build MCPData and call the LLM. The active agent config
    // gives us the system prompt (loaded from a markdown file) plus
    // model/temperature/maxTokens — the client wrapper consumes the
    // same config for its own settings.
    const cfg = await getActiveAgentConfig();
    const systemPromptText = cfg.systemPrompt;
    const mcpData = MCPData({
      center_name: "Albuquerque DCFD Family Front Desk",
      handbook_entries: handbook.map((e) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        body: e.body,
        source_pages: e.sourcePages,
      })),
    });

    const modelResult: AnswerContract = await askLLM(
      SystemPrompt(systemPromptText),
      INTENT,
      mcpData,
      UserInput(question),
    );

    // 5. Sensitive-topic override. If the static check fired, force
    // escalation regardless of model confidence. Also preserve the
    // model's own escalation reason if it already escalated.
    const finalResult: AnswerContract = sensitive
      ? {
          ...modelResult,
          confidence: "low",
          escalate: true,
          escalation_reason:
            modelResult.escalation_reason ?? "sensitive_topic",
        }
      : modelResult;

    // 6. Log to needs-attention if this is an escalation.
    if (finalResult.escalate || finalResult.confidence === "low") {
      await logNeedsAttention({
        question,
        result: finalResult,
      });
    }

    // 7. Return the contract.
    return Response.json(finalResult);
  } catch (err) {
    // Generic failure — log server-side, return a safe error to the parent.
    console.error("[/api/ask] request failed:", err);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
