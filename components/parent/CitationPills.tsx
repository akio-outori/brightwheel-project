// A row of clickable pills, one per cited source (entry or override).
// Clicking a pill opens the underlying item in HandbookEntryModal.
//
// Pills are <button> elements, not <span>s, so they're keyboard
// accessible. The pill label is the source title. Overrides get a
// subtle "clarified by staff" badge so the operator's work is
// visible to the parent without making override-backed answers
// feel second-class.

"use client";

import type { CitationSource } from "./types";

export function CitationPills({
  citedIds,
  allSources,
  onOpen,
}: {
  citedIds: string[];
  allSources: CitationSource[];
  onOpen: (source: CitationSource) => void;
}) {
  if (citedIds.length === 0) return null;

  // Resolve ids → sources. Unknown ids are dropped silently — they'd
  // only happen if the model hallucinated an id (which the route
  // already catches server-side), and a broken pill would be worse
  // than omitting it.
  const resolved = citedIds
    .map((id) => allSources.find((s) => s.id === id))
    .filter((s): s is CitationSource => s !== undefined);

  if (resolved.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {resolved.map((source) => {
        const isOverride = source.source === "override";
        return (
          <button
            key={source.id}
            type="button"
            onClick={() => onOpen(source)}
            className={
              isOverride
                ? "inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                : "inline-flex max-w-full items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20 transition hover:bg-sky-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            }
            title={
              isOverride
                ? "Clarified by a staff member"
                : undefined
            }
          >
            <span aria-hidden="true">{isOverride ? "✏️" : "📎"}</span>
            <span className="truncate">{source.title}</span>
          </button>
        );
      })}
    </div>
  );
}
