// Server-side login route. Validates the staff password and sets an
// httpOnly cookie so the token is never readable by client-side JS.

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  password: z.string().min(1).max(200),
});

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expectedToken = process.env.STAFF_AUTH_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ error: "Staff authentication is not configured." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  if (!constantTimeEqual(parsed.data.password, expectedToken)) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const isSecure = request.nextUrl.protocol === "https:";
  const res = NextResponse.json({ ok: true });
  res.cookies.set("brightdesk-staff-token", expectedToken, {
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
