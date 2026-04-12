// S2: Operator auth middleware. Protects admin write routes behind a
// shared-password cookie so unauthenticated visitors cannot inject
// operator replies or overrides that surface to real parents.
//
// Auth model: the operator sets STAFF_AUTH_TOKEN in their environment.
// The /admin/login page accepts the password, sets a `brightdesk-staff-token`
// cookie, and redirects to /admin. This middleware checks the cookie
// on every protected route. Public routes (/api/ask, /api/parent-replies,
// /api/handbook, /api/health) are not gated.
//
// This is a demo-grade shared password, not a production auth system.
// A real deployment would use next-auth or iron-session with per-user
// credentials.

import { NextRequest, NextResponse } from "next/server";

/** Routes that require operator authentication. Matched against the
 *  request pathname. POST-only routes are checked inside the handler. */
const PROTECTED_ROUTE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  methods?: string[];
}> = [
  // All override routes (GET, POST, PUT, DELETE)
  { pattern: /^\/api\/overrides(\/|$)/ },
  // Resolve-with-entry (POST only, but the route only exposes POST)
  { pattern: /^\/api\/needs-attention\/[^/]+\/resolve-with-entry(\/|$)/ },
  // Needs-attention detail POST (resolve without entry)
  { pattern: /^\/api\/needs-attention\/[^/]+\/?$/, methods: ["POST"] },
];

export function middleware(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  // Check if this route is protected
  const match = PROTECTED_ROUTE_PATTERNS.find((r) => {
    if (!r.pattern.test(pathname)) return false;
    if (r.methods && !r.methods.includes(method)) return false;
    return true;
  });

  if (!match) return undefined;

  // Verify the staff auth cookie against the environment variable
  const expectedToken = process.env.STAFF_AUTH_TOKEN;
  if (!expectedToken) {
    // If the env var isn't set, deny all protected requests. This
    // prevents accidental open access in misconfigured deployments.
    return NextResponse.json({ error: "Staff authentication is not configured." }, { status: 401 });
  }

  const cookie = request.cookies.get("brightdesk-staff-token");
  if (!cookie || cookie.value !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return undefined;
}

export const config = {
  matcher: ["/api/overrides/:path*", "/api/needs-attention/:path*"],
};
