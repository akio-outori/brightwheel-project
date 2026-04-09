// The one-tap fix dialog. Two API calls (create entry, resolve event)
// happen on submit. Both succeed or both visibly fail — we do NOT
// leave a dangling entry if the resolve fails. On success, SWR
// revalidates both feeds so the event disappears and the entry
// appears in the same render tick.

"use client";

import { useEffect, useRef, useState } from "react";
import { mutate } from "swr";
import type { HandbookCategory, NeedsAttentionEvent } from "@/lib/storage";

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

export function FixDialog({
  event,
  onClose,
}: {
  event: NeedsAttentionEvent;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<HandbookCategory>("general");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = () => onClose();
    dialog.addEventListener("close", handler);
    return () => dialog.removeEventListener("close", handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      // 1. Create the handbook entry
      const entryRes = await fetch("/api/handbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          body,
          sourcePages: [],
        }),
      });
      if (!entryRes.ok) {
        const detail = await entryRes.json().catch(() => ({}));
        throw new Error(
          detail.error ?? `Could not create entry (HTTP ${entryRes.status})`,
        );
      }
      const entry = (await entryRes.json()) as { id: string };

      // 2. Resolve the needs-attention event, linking to the new entry
      const resolveRes = await fetch(
        `/api/needs-attention/${event.id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resolvedByEntryId: entry.id }),
        },
      );
      if (!resolveRes.ok) {
        const detail = await resolveRes.json().catch(() => ({}));
        throw new Error(
          detail.error ??
            `Could not resolve event (HTTP ${resolveRes.status})`,
        );
      }

      // 3. Revalidate both feeds so the UI catches up immediately
      await Promise.all([
        mutate("/api/needs-attention"),
        mutate("/api/handbook"),
      ]);

      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-lg rounded-lg p-0 backdrop:bg-slate-900/40"
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Answer this question
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Parent asked: <span className="italic">{event.question}</span>
          </p>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
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
            Answer
            <textarea
              required
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the answer the parent should have gotten. Markdown is supported."
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
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={submitting}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              title.trim().length === 0 ||
              body.trim().length === 0
            }
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:bg-slate-300"
          >
            {submitting ? "Saving…" : "Save and close the loop"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
