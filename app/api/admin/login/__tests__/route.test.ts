// Tests for POST /api/admin/login. Validates the server-side login
// flow: correct password sets the httpOnly cookie, wrong password
// and misconfiguration return the right status codes.

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../route";

function makeRequest(body: unknown, url = "http://localhost:3000/api/admin/login"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/login", () => {
  const originalToken = process.env.STAFF_AUTH_TOKEN;

  beforeEach(() => {
    process.env.STAFF_AUTH_TOKEN = "brightdesk-demo-2026";
  });

  afterEach(() => {
    process.env.STAFF_AUTH_TOKEN = originalToken;
  });

  it("returns 401 when STAFF_AUTH_TOKEN is not configured", async () => {
    delete process.env.STAFF_AUTH_TOKEN;
    const res = await POST(makeRequest({ password: "anything" }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/not configured/i);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/login", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is empty", async () => {
    const res = await POST(makeRequest({ password: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 on wrong password", async () => {
    const res = await POST(makeRequest({ password: "nope" }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/invalid password/i);
  });

  it("returns 401 on right-length wrong password (timing-safe compare still runs)", async () => {
    const res = await POST(makeRequest({ password: "brightdesk-demo-WRONG" }));
    expect(res.status).toBe(401);
  });

  it("sets an httpOnly cookie on correct password", async () => {
    const res = await POST(makeRequest({ password: "brightdesk-demo-2026" }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie!).toMatch(/brightdesk-staff-token=brightdesk-demo-2026/);
    expect(setCookie!).toMatch(/HttpOnly/i);
    expect(setCookie!).toMatch(/SameSite=lax/i);
    // Not secure because test URL is http:
    expect(setCookie!).not.toMatch(/Secure/i);
  });

  it("sets Secure flag when the request is over https", async () => {
    const res = await POST(
      makeRequest({ password: "brightdesk-demo-2026" }, "https://example.com/api/admin/login"),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie!).toMatch(/Secure/i);
  });
});
