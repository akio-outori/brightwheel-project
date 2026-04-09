// A row of clickable pills, one per cited handbook entry. Clicking
// a pill opens the underlying entry in HandbookEntryModal.
//
// Pills are <button> elements, not <span>s, so they're keyboard
// accessible. The pill label is the entry title, not the id — ids
// are for the model, titles are for the parent.

"use client";

import type { HandbookEntry } from "@/lib/storage";

export function CitationPills({
  citedEntryIds,
  allEntries,
  onOpen,
}: {
  citedEntryIds: string[];
  allEntries: HandbookEntry[];
  onOpen: (entry: HandbookEntry) => void;
}) {
  if (citedEntryIds.length === 0) return null;

  // Resolve ids → entries. Unknown ids are dropped silently — they'd
  // only happen if the model hallucinated an id, and surfacing a
  // broken pill to the parent is worse than omitting it.
  const resolved = citedEntryIds
    .map((id) => allEntries.find((e) => e.id === id))
    .filter((e): e is HandbookEntry => e !== undefined);

  if (resolved.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {resolved.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onOpen(entry)}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20 transition hover:bg-sky-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <span aria-hidden="true">📎</span>
          <span className="truncate">{entry.title}</span>
        </button>
      ))}
    </div>
  );
}
