// Liveness endpoint for the Docker healthcheck. Stays minimal and dependency-free
// so a failure here always means the Next.js process is wedged, never that a
// downstream (MinIO, Anthropic) is unavailable.
//
// `sha` is the git commit the running build was made from. Railway auto-injects
// RAILWAY_GIT_COMMIT_SHA at runtime; GIT_SHA is a manual override for other hosts.
// CI uses this to poll until the deployed version matches the commit it merged.

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    sha: process.env.GIT_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown",
  });
}
