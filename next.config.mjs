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

  // S1: Security response headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
