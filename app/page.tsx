// Parent landing + chat surface. Server component — fetches the
// active document's entries and operator overrides once on first
// load so citation pills can resolve ids to titles without an extra
// client-side round trip.
//
// The chat itself is a client component (ParentChat) because it
// owns conversation history and the pending state.

import { ParentChat } from "@/components/parent/ParentChat";
import type { CitationSource, DocumentInfo } from "@/components/parent/types";
import {
  getActiveDocumentId,
  getDocumentMetadata,
  listHandbookEntries,
  listOperatorOverrides,
} from "@/lib/storage";

// The handbook is fetched from MinIO on every request. Disable static
// generation — we don't want the data frozen into the build artifact,
// and MinIO isn't reachable during `next build` anyway.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const docId = getActiveDocumentId();
  const [metadata, entries, overrides] = await Promise.all([
    getDocumentMetadata(docId),
    listHandbookEntries(docId),
    listOperatorOverrides(docId),
  ]);

  // Flatten both layers into a single lookup array tagged with
  // source, so CitationPills and HandbookEntryModal don't need to
  // know where each item came from except when rendering the badge.
  const sources: CitationSource[] = [
    ...entries.map<CitationSource>((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      body: e.body,
      sourcePages: e.sourcePages,
      source: "entry",
    })),
    ...overrides.map<CitationSource>((o) => ({
      id: o.id,
      title: o.title,
      category: o.category,
      body: o.body,
      sourcePages: o.sourcePages,
      source: "override",
    })),
  ];

  const document: DocumentInfo = {
    id: metadata.id,
    title: metadata.title,
    version: metadata.version,
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {metadata.title}
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Ask a question about the program. Answers are grounded in the official family handbook
          plus any clarifications staff have added. When I&rsquo;m not sure, I pass the question to
          a real person.
        </p>
      </header>

      <ParentChat document={document} sources={sources} />
    </main>
  );
}
