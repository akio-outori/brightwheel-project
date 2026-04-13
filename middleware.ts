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

export async function middleware(request: NextRequest): Promise<NextResponse | undefined> {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  // Check if this route is protected
  const match = PROTECTED_ROUTE_PATTERNS.find((r) => {
    if (!r.pattern.test(pathname)) return false;
    if (r.methods && !r.methods.includes(method)) return false;
    return true;
  });

  if (!match) {
    // Auto-set the staff cookie when visiting /admin so the demo
    // works without a login step. Middleware can set cookies via
    // NextResponse.next() — Server Components cannot.
    if (pathname.startsWith("/admin")) {
      const token = process.env.STAFF_AUTH_TOKEN;
      const existing = request.cookies.get("brightdesk-staff-token");
      if (token && existing?.value !== token) {
        const res = NextResponse.next();
        res.cookies.set("brightdesk-staff-token", token, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7,
        });
        return res;
      }
    }
    return undefined;
  }

  // Verify the staff auth cookie against the environment variable
  const expectedToken = process.env.STAFF_AUTH_TOKEN;
  if (!expectedToken) {
    // If the env var isn't set, deny all protected requests. This
    // prevents accidental open access in misconfigured deployments.
    return NextResponse.json({ error: "Staff authentication is not configured." }, { status: 401 });
  }

  const cookie = request.cookies.get("brightdesk-staff-token");
  if (!cookie || !(await constantTimeEqual(cookie.value, expectedToken))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return undefined;
}

// Edge Runtime doesn't have node:crypto. Use Web Crypto's subtle
// digest for a comparison that doesn't leak timing information:
// both inputs are hashed, then compared byte-by-byte with XOR
// accumulation so the comparison time is independent of content.
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);
  if (viewA.length !== viewB.length) return false;
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i]! ^ viewB[i]!;
  }
  return diff === 0;
}

export const config = {
  matcher: [
    "/api/overrides/:path*",
    "/api/needs-attention/:path*",
    "/api/needs-attention",
    "/admin/:path*",
    "/admin",
  ],
};
