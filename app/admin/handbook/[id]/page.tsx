// Single seed-entry view. Server component fetches the entry
// directly from storage (no round-trip through the API) for a fast
// first paint. Read-only — seed entries are immutable. Corrections
// are made through the operator overrides layer.

import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/operator/AdminShell";
import { HandbookEntryBody } from "@/components/operator/HandbookEntryBody";
import { getActiveDocumentId, getHandbookEntry } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HandbookEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const docId = getActiveDocumentId();
  const entry = await getHandbookEntry(docId, id);
  if (!entry) notFound();

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
            {" · "}read-only
          </p>
        </header>

        <div className="py-4">
          <HandbookEntryBody body={entry.body} />
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This entry is part of the immutable seeded handbook. To add
          a clarification or correct this content, create an operator
          override from the{" "}
          <Link
            href="/admin/overrides/new"
            className="font-semibold underline decoration-amber-500 underline-offset-2 hover:text-amber-950"
          >
            new-override
          </Link>{" "}
          page.
        </div>
      </article>
    </AdminShell>
  );
}
