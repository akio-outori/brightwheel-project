/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,

  // The LLM config and prompt files live under config/ and are read
  // at runtime by lib/llm/config.ts (via fs.readFile). Next's
  // standalone output tracer only copies files it can statically
  // detect from imports, so plain readFile targets get dropped.
  // Pin them explicitly so they make it into .next/standalone/config.
  outputFileTracingIncludes: {
    "/api/ask": ["./config/**/*", "./data/**/*"],
    "/api/handbook": ["./data/**/*"],
    "/": ["./config/**/*"],
  },
};

export default nextConfig;
