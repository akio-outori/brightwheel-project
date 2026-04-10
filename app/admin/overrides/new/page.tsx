// New-override form. This is the operator's direct path to writing
// a fresh clarification without going through the needs-attention
// feed. Most overrides will be created via the FixDialog instead —
// that one is driven by a real escalation event, which gives the
// operator tighter context. This page exists for the cases where
// the operator wants to proactively patch a gap they noticed.

"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { mutate } from "swr";
import { AdminShell } from "@/components/operator/AdminShell";
import type { HandbookCategory } from "@/lib/storage";

const CATEGORIES: HandbookCategory[] = [
  "enrollment",
  "hours",
  "health",
  "safety",
  "food",
  "curriculum",
  "staff",
  "policies",
  "communication",
  "fees",
  "transportation",
  "special-needs",
  "discipline",
  "emergencies",
  "general",
];

export default function NewOverridePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<HandbookCategory>("general");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/overrides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          body,
          sourcePages: [],
          replacesEntryId: null,
          createdBy: null,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? `Could not save (HTTP ${res.status})`);
      }
      const created = (await res.json()) as { id: string };
      await mutate("/api/handbook");
      router.push(`/admin/overrides/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <AdminShell active="handbook">
      <div className="mb-4">
        <Link
          href="/admin/handbook"
          className="text-xs font-medium text-sky-600 hover:text-sky-700"
        >
          ← Back to document
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">New operator override</h2>
          <p className="mt-1 text-xs text-slate-600">
            Overrides sit on top of the seeded handbook at query time. When an override directly
            answers a parent&rsquo;s question, the model prefers it over seed content.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
          Title
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Parking at drop-off"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as HandbookCategory)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
          Body
          <textarea
            required
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the clarification as you'd want the parent to read it."
            className="resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/admin/handbook"
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || title.trim().length === 0 || body.trim().length === 0}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:bg-slate-300"
          >
            {submitting ? "Saving…" : "Create override"}
          </button>
        </div>
      </form>
    </AdminShell>
  );
}
