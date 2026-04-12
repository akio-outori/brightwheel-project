"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// S2: Simple shared-password login page for the operator console.
// Sets the `brightdesk-staff-token` cookie that middleware.ts checks
// on protected admin write routes. This is demo-grade auth — a real
// deployment would use next-auth or similar.

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError("Password is required.");
      return;
    }

    // Set the cookie client-side. The middleware validates it against
    // STAFF_AUTH_TOKEN on each protected request. httpOnly is not set
    // because this is a demo shared password, not a session token.
    // SameSite=Lax prevents CSRF on cross-origin POST.
    document.cookie = `brightdesk-staff-token=${encodeURIComponent(password.trim())}; path=/; SameSite=Lax; max-age=${60 * 60 * 24 * 7}`;
    router.push("/admin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-xl font-semibold text-gray-800">Staff Login</h1>
        {error && <p className="mb-4 text-center text-sm text-red-600">{error}</p>}
        <label htmlFor="staff-password" className="mb-2 block text-sm font-medium text-gray-700">
          Staff password
        </label>
        <input
          id="staff-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          autoFocus
        />
        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
