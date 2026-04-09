// Handbook list. Client component so SWR can revalidate after a
// fix-dialog save. Groups entries by category and lets the operator
// drill into any one.

"use client";

import Link from "next/link";
import useSWR from "swr";
import type { HandbookEntry } from "@/lib/storage";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ entries: HandbookEntry[] }>;
  });

export function HandbookList() {
  const { data, error, isLoading } = useSWR("/api/handbook", fetcher);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        Could not load the handbook: {String(error.message ?? error)}
      </div>
    );
  }

  const entries = data?.entries ?? [];
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        The handbook is empty. Create your first entry to get started.
      </div>
    );
  }

  // Group by category.
  const byCategory = new Map<string, HandbookEntry[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }
  const sortedCategories = Array.from(byCategory.keys()).sort();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-slate-500">
        {entries.length} {entries.length === 1 ? "entry" : "entries"}
      </p>
      {sortedCategories.map((category) => {
        const list = byCategory.get(category)!;
        return (
          <section key={category}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {category.replace(/-/g, " ")}
            </h2>
            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {list
                .slice()
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/admin/handbook/${entry.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {entry.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {entry.body.slice(0, 120)}
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-slate-400"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
