// Anthropic SDK wrapper. This is the only file in the codebase that
// imports `@anthropic-ai/sdk`. The exported surface is a single
// function, `askLLM`, which takes branded inputs and returns a
// schema-validated AnswerContract.
//
// Every failure mode collapses to the same graceful escalation result:
// a parse failure, a schema mismatch, a short network blip that the
// caller doesn't catch — all of them return PARSE_FAILURE_RESULT, not
// a thrown error, so the parent never sees a 500. The one exception
// is a hard SDK crash before the request is even built; that propagates
// so boundary handlers can surface it.

import Anthropic from "@anthropic-ai/sdk";
import { AnswerContract, AnswerContractSchema, PARSE_FAILURE_RESULT } from "./contract";
import { buildPrompt } from "./prompt-builder";
import type { AppIntent, MCPData, SystemPrompt, UserInput } from "./types";

// Lazy-memoized client. Constructing at module top level would read
// the API key at import time, which breaks test environments that
// don't have one set and makes mocking in unit tests harder.
let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  return cachedClient;
}

// Test hook. Lets a test inject a fake Anthropic client instance
// without stubbing the module system. The fake only needs to
// implement `messages.create` returning `{ content: [{ type: "text", text: string }] }`.
export function __setClientForTests(client: unknown): void {
  cachedClient = client as Anthropic;
}

export function __resetClientForTests(): void {
  cachedClient = null;
}

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

export async function askLLM(
  system: SystemPrompt,
  intent: AppIntent,
  data: MCPData,
  user: UserInput,
): Promise<AnswerContract> {
  const prompt = buildPrompt(system, intent, data, user);

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: prompt.system,
    messages: prompt.messages,
  });

  // The SDK returns a discriminated union of content blocks; we
  // only want the text ones. TS narrows on the discriminant.
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Defensive: the model is instructed to return a bare JSON object, but
  // sometimes returns it wrapped in a ```json fence. Strip common fence
  // shapes before parsing.
  const unfenced = stripCodeFence(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    return PARSE_FAILURE_RESULT;
  }

  const result = AnswerContractSchema.safeParse(parsed);
  if (!result.success) {
    return PARSE_FAILURE_RESULT;
  }
  return result.data;
}

function stripCodeFence(text: string): string {
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i;
  const m = text.match(fence);
  return m && m[1] ? m[1].trim() : text;
}

// The exported types a caller needs. Keep this list small — every
// export is a commitment the reviewer has to re-check.
export type { AnswerContract } from "./contract";
