// Barrel export. API routes import from "@/lib/llm" and see only the
// typed surface — branded constructors, the AnswerContract, the
// post-response pipeline, and askLLM. They never import from the SDK.
//
// The branded types and their constructors share a name (the TS
// "const + type" pattern). `export { SystemPrompt }` carries both
// the value and the type through the barrel — no need for a separate
// `export type`.

export { SystemPrompt, AppIntent, MCPData, UserInput } from "./types";

export { AnswerContractSchema, PARSE_FAILURE_RESULT } from "./contract";
export type { AnswerContract } from "./contract";

export { buildPrompt } from "./prompt-builder";
export type { BuiltPrompt } from "./prompt-builder";

export { askLLM } from "./client";
