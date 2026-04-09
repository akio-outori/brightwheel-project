// Create-a-new-handbook-entry form. Client component because it's
// a form; the surrounding AdminShell is server-rendered.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function NewEntryPage() {
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
      const res = await fetch("/api/handbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, category, body, sourcePages: [] }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(
          detail.error ?? `Could not create (HTTP ${res.status})`,
        );
      }
      const entry = (await res.json()) as { id: string };
      await mutate("/api/handbook");
      router.push(`/admin/handbook/${entry.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <AdminShell active="handbook">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-base font-semibold text-slate-900">
          New handbook entry
        </h2>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
          Title
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Scheduling a tour"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
          Category
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as HandbookCategory)
            }
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
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the answer the AI should give for questions on this topic. Markdown is supported."
            className="resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800"
          >
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:bg-slate-300"
          >
            {submitting ? "Saving…" : "Create entry"}
          </button>
        </div>
      </form>
    </AdminShell>
  );
}
