// Document view for the operator console. Shows the active
// document's metadata, the read-only seed entries, and the mutable
// operator overrides in two visually distinct sections.
//
// Client component so SWR can revalidate after a fix-dialog save
// or a direct create/delete on the overrides endpoint.

"use client";

import Link from "next/link";
import useSWR from "swr";
import type { DocumentMetadata, HandbookEntry, OperatorOverride } from "@/lib/storage";

interface HandbookResponse {
  document: {
    metadata: DocumentMetadata;
    entries: HandbookEntry[];
    overrides: OperatorOverride[];
  };
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<HandbookResponse>;
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

  const document = data?.document;
  if (!document) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No document loaded.
      </div>
    );
  }

  const { metadata, entries, overrides } = document;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{metadata.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Version {metadata.version} · seeded {new Date(metadata.seededAt).toLocaleDateString()}{" "}
              · read-only
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <SeedEntriesList entries={entries} />
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Operator overrides</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Clarifications and corrections added by staff. These layer on top of the handbook at
              query time.
            </p>
          </div>
          <Link
            href="/admin/overrides/new"
            className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
          >
            + New override
          </Link>
        </div>
        <OverridesList overrides={overrides} />
      </section>
    </div>
  );
}

function SeedEntriesList({ entries }: { entries: HandbookEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="mt-2 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No entries found in the seeded document.
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
    <div className="mt-3 flex flex-col gap-5">
      {sortedCategories.map((category) => {
        const list = byCategory.get(category)!;
        return (
          <div key={category}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {category.replace(/-/g, " ")}
            </h3>
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
                        <p className="truncate text-sm font-medium text-slate-900">{entry.title}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {entry.body.slice(0, 120)}
                        </p>
                      </div>
                      <span aria-hidden="true" className="shrink-0 text-slate-400">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function OverridesList({ overrides }: { overrides: OperatorOverride[] }) {
  if (overrides.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        No overrides yet. Overrides are created automatically when you answer an escalated question
        from the needs-attention feed, or you can add one directly with the button above.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40">
      {overrides
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((override) => (
          <li key={override.id}>
            <Link
              href={`/admin/overrides/${override.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-amber-50"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
                  >
                    override
                  </span>
                  <p className="truncate text-sm font-medium text-slate-900">{override.title}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {override.body.slice(0, 120)}
                </p>
              </div>
              <span aria-hidden="true" className="shrink-0 text-slate-400">
                →
              </span>
            </Link>
          </li>
        ))}
    </ul>
  );
}
