// Edit-in-place for an existing handbook entry. Expands on click,
// submits via PUT /api/handbook/[id], revalidates the entry detail
// and the list on success.

"use client";

import { useState } from "react";
import { mutate } from "swr";
import type { HandbookCategory, HandbookEntry } from "@/lib/storage";

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

export function HandbookEntryEditor({
  entry,
}: {
  entry: HandbookEntry;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [category, setCategory] = useState<HandbookCategory>(entry.category);
  const [body, setBody] = useState(entry.body);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/handbook/${entry.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, category, body }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(
          detail.error ?? `Could not save (HTTP ${res.status})`,
        );
      }
      await Promise.all([
        mutate("/api/handbook"),
        mutate(`/api/handbook/${entry.id}`),
      ]);
      // Force a full reload so the server-component entry detail
      // re-renders with the new values. SWR handles client-fetched
      // data; server-component data needs a refresh.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-4 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4"
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
        Title
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
          rows={10}
          value={body}
          onChange={(e) => setBody(e.target.value)}
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
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:bg-slate-300"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
