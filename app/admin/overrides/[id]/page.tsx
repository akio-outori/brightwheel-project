// Override detail: view, edit, delete. Client component — the
// server already proves existence implicitly via /api/overrides/[id];
// doing it here saves a server roundtrip on every edit save.

"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { mutate } from "swr";
import { AdminShell } from "@/components/operator/AdminShell";
import type { HandbookCategory, OperatorOverride } from "@/lib/storage";

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

export default function OverrideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [override, setOverride] = useState<OperatorOverride | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<HandbookCategory>("general");
  const [body, setBody] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/overrides/${id}`);
        if (res.status === 404) {
          if (!cancelled) setLoadError("Override not found.");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as OperatorOverride;
        if (cancelled) return;
        setOverride(json);
        setTitle(json.title);
        setCategory(json.category);
        setBody(json.body);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !override) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/overrides/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, category, body }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as OperatorOverride;
      setOverride(updated);
      await mutate("/api/handbook");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    if (
      !window.confirm("Delete this override? Parents will stop seeing it in answers immediately.")
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/overrides/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? `HTTP ${res.status}`);
      }
      await mutate("/api/handbook");
      router.push("/admin/handbook");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  if (loadError) {
    return (
      <AdminShell active="handbook">
        <p className="text-sm text-rose-800">{loadError}</p>
      </AdminShell>
    );
  }

  if (!override) {
    return (
      <AdminShell active="handbook">
        <p className="text-sm text-slate-500">Loading…</p>
      </AdminShell>
    );
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
        onSubmit={handleSave}
        className="flex flex-col gap-4 rounded-lg border border-amber-200 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
          >
            override
          </span>
          <h2 className="text-base font-semibold text-slate-900">{override.title}</h2>
        </div>
        <p className="-mt-2 text-xs text-slate-500">
          Created {new Date(override.createdAt).toLocaleString()}
          {override.updatedAt && ` · updated ${new Date(override.updatedAt).toLocaleString()}`}
        </p>

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
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || saving}
            className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete override"}
          </button>
          <button
            type="submit"
            disabled={saving || title.trim().length === 0 || body.trim().length === 0}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:bg-slate-300"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </AdminShell>
  );
}
