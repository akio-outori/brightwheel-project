// Agent config loader. Reads a JSON config file that names the model,
// temperature, max tokens, and — critically — points at a markdown file
// containing the system prompt. Prompt + model + temperature become
// deployable artifacts that move together, instead of being scattered
// across hardcoded constants in TypeScript and a side-channel loader.
//
// The shape follows a JSON agent-config convention: a single file
// names the model, temperature, max tokens, and points at a markdown
// file containing the system prompt. We use Zod with real types
// because the project expects schema validation at every boundary.
//
// One active config is hardcoded below. Swapping models is a single
// line edit in this file (or a future env-var selector). Two configs
// ship in the repo — haiku (active) and sonnet (dormant) — so the
// upgrade path is visible in `config/agents/` rather than buried in
// a comment.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const AgentConfigSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  version: z.string().min(1),
  metadata: z.object({
    system_prompt_file: z.string().min(1),
    llm_provider: z.literal("anthropic"),
    llm_model: z.string().min(1),
    llm_temperature: z.number().min(0).max(2),
    llm_max_tokens: z.number().int().positive().max(16_000),
    llm_api_key_env: z.string().min(1),
  }),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// The resolved shape callers actually use. `systemPrompt` is the
// contents of the referenced markdown file, not a path; `apiKey` is
// the resolved environment variable value, not its name.
export interface LoadedAgentConfig {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly systemPrompt: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly apiKey: string;
}

// ---------------------------------------------------------------------------
// The active config
// ---------------------------------------------------------------------------

// Hardcoded for now. When a second config becomes user-selectable
// (env var, query param, whatever), this constant is the single
// seam that needs to change.
const ACTIVE_CONFIG_PATH = "config/agents/parent-front-desk-sonnet.json";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

// Same cache pattern as the old system-prompts loader: in production,
// load once per process lifetime; in dev, re-read every call so edits
// to the config or the prompt file are picked up without a restart.
let cached: LoadedAgentConfig | null = null;

export function __resetConfigCacheForTests(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function getActiveAgentConfig(): Promise<LoadedAgentConfig> {
  if (cached && process.env.NODE_ENV === "production") return cached;

  const loaded = await loadAgentConfig(ACTIVE_CONFIG_PATH);
  cached = loaded;
  return loaded;
}

// Exported for testability and for a future env-selectable path.
// `configPath` is resolved relative to `process.cwd()` so it works
// in both the repo root (dev) and the app working dir (container).
export async function loadAgentConfig(configPath: string): Promise<LoadedAgentConfig> {
  const absoluteConfigPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(process.cwd(), configPath);

  let rawJson: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is built from a hardcoded constant or Zod-validated config
    rawJson = await readFile(absoluteConfigPath, "utf-8");
  } catch (err) {
    throw new Error(
      `Agent config file not found or unreadable: ${absoluteConfigPath} (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(
      `Agent config file is not valid JSON: ${absoluteConfigPath} (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }

  const result = AgentConfigSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(
      `Agent config file failed schema validation: ${absoluteConfigPath}\n` +
        result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"),
    );
  }
  const cfg = result.data;

  // Resolve the system prompt file path. Relative paths in the config
  // are resolved relative to process.cwd(), matching how we resolve
  // the config file itself.
  const promptPath = path.isAbsolute(cfg.metadata.system_prompt_file)
    ? cfg.metadata.system_prompt_file
    : path.join(process.cwd(), cfg.metadata.system_prompt_file);

  let systemPrompt: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path resolved from Zod-validated config field
    systemPrompt = await readFile(promptPath, "utf-8");
  } catch (err) {
    throw new Error(
      `System prompt file referenced by ${absoluteConfigPath} not found: ${promptPath} (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }

  // Resolve the API key from the env var named in the config. Throwing
  // here rather than in the LLM client means the failure mode is clear
  // at startup — "your config said to read X, X is unset" — instead of
  // surfacing as an Anthropic 401 two layers down.
  const apiKey = process.env[cfg.metadata.llm_api_key_env];
  if (!apiKey) {
    throw new Error(
      `Agent config ${cfg.id} requires env var ${cfg.metadata.llm_api_key_env} to be set, but it is not.`,
    );
  }

  return Object.freeze({
    id: cfg.id,
    name: cfg.name,
    version: cfg.version,
    systemPrompt,
    model: cfg.metadata.llm_model,
    temperature: cfg.metadata.llm_temperature,
    maxTokens: cfg.metadata.llm_max_tokens,
    apiKey,
  });
}
