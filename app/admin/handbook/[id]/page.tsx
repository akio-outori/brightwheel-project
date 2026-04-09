// Single-entry view. Server component fetches the entry directly
// from storage (no round-trip through the API) for a fast first
// paint, then lets the client-side editor take over on "Edit".

import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/operator/AdminShell";
import { HandbookEntryBody } from "@/components/operator/HandbookEntryBody";
import { HandbookEntryEditor } from "@/components/operator/HandbookEntryEditor";
import { getHandbookEntry } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HandbookEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = await getHandbookEntry(id);
  if (!entry) notFound();

  return (
    <AdminShell active="handbook">
      <div className="mb-4">
        <Link
          href="/admin/handbook"
          className="text-xs font-medium text-sky-600 hover:text-sky-700"
        >
          ← All entries
        </Link>
      </div>

      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <header className="border-b border-slate-200 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {entry.category.replace(/-/g, " ")}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            {entry.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Last updated: {entry.lastUpdated}
            {entry.sourcePages.length > 0 && (
              <>
                {" · "}Source pages: {entry.sourcePages.join(", ")}
              </>
            )}
          </p>
        </header>

        <div className="py-4">
          <HandbookEntryBody body={entry.body} />
        </div>

        <HandbookEntryEditor entry={entry} />
      </article>
    </AdminShell>
  );
}
