// System-prompt loader. Reads the static parent.md file from the
// filesystem and caches the contents for process lifetime. The file
// is treated as application code — it's checked in, it has no
// placeholders, and it's loaded once.
//
// In dev we re-read on every call so edits to parent.md are picked up
// without a restart. In production (NODE_ENV === "production") we
// cache. The cache key is the file path, not the file content —
// changing parent.md in a running production process requires a
// redeploy, same as any other code change.

import { readFile } from "node:fs/promises";
import path from "node:path";

let cached: string | null = null;

export async function loadParentSystemPrompt(): Promise<string> {
  if (cached && process.env.NODE_ENV === "production") return cached;

  const filePath = path.join(
    process.cwd(),
    "lib",
    "llm",
    "system-prompts",
    "parent.md",
  );
  const contents = await readFile(filePath, "utf-8");
  cached = contents;
  return contents;
}
