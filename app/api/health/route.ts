// Liveness endpoint for the Docker healthcheck. Stays minimal and dependency-free
// so a failure here always means the Next.js process is wedged, never that a
// downstream (MinIO, Anthropic) is unavailable.

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
