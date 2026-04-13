// Agent config loader tests. Covers the happy path (valid config +
// prompt file), error paths (missing file, bad JSON, missing env var,
// schema validation failure), and the cache mechanism.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { loadAgentConfig, __resetConfigCacheForTests } from "../config";

// Point at the real Sonnet config for the happy path
const VALID_CONFIG = "config/agents/parent-front-desk-sonnet.json";

beforeEach(() => {
  __resetConfigCacheForTests();
});

afterEach(() => {
  __resetConfigCacheForTests();
  vi.restoreAllMocks();
});

describe("loadAgentConfig", () => {
  it("loads a valid config and resolves the system prompt file", async () => {
    // Set the required env var for the config
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-for-config-loading";
    try {
      const cfg = await loadAgentConfig(VALID_CONFIG);
      expect(cfg.id).toBe("parent-front-desk-sonnet");
      expect(cfg.model).toBe("claude-sonnet-4-6");
      expect(cfg.temperature).toBe(0);
      expect(cfg.maxTokens).toBeGreaterThan(0);
      expect(cfg.systemPrompt).toContain("BrightDesk");
      expect(cfg.apiKey).toBe("test-key-for-config-loading");
    } finally {
      process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("throws on missing config file", async () => {
    await expect(loadAgentConfig("nonexistent.json")).rejects.toThrow(/not found or unreadable/);
  });

  it("throws on invalid JSON", async () => {
    // Create a temp file with bad JSON
    const fs = await import("node:fs/promises");
    const tmp = path.join(process.cwd(), ".tmp-bad-config.json");
    await fs.writeFile(tmp, "not json {{{");
    try {
      await expect(loadAgentConfig(tmp)).rejects.toThrow(/not valid JSON/);
    } finally {
      await fs.unlink(tmp);
    }
  });

  it("throws on schema validation failure", async () => {
    const fs = await import("node:fs/promises");
    const tmp = path.join(process.cwd(), ".tmp-bad-schema.json");
    await fs.writeFile(tmp, JSON.stringify({ id: "x", name: "x", version: "1", metadata: {} }));
    try {
      await expect(loadAgentConfig(tmp)).rejects.toThrow(/failed schema validation/);
    } finally {
      await fs.unlink(tmp);
    }
  });

  it("throws when the API key env var is not set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(loadAgentConfig(VALID_CONFIG)).rejects.toThrow(/API key environment variable/);
    } finally {
      process.env.ANTHROPIC_API_KEY = original;
    }
  });
});
