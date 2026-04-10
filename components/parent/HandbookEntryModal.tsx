// A simple modal that shows a cited source's full body. Opens when
// the parent clicks a citation pill. Uses native <dialog> so it's
// accessible (Esc to close, backdrop click) without pulling in a
// modal library.
//
// Handles both seed entries and operator overrides uniformly — the
// only visual difference is the source label at the bottom.

"use client";

import { useEffect, useRef } from "react";
import type { CitationSource, DocumentInfo } from "./types";

export function HandbookEntryModal({
  source,
  document,
  onClose,
}: {
  source: CitationSource | null;
  document: DocumentInfo;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (source && !dialog.open) dialog.showModal();
    if (!source && dialog.open) dialog.close();
  }, [source]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = () => onClose();
    dialog.addEventListener("close", handler);
    return () => dialog.removeEventListener("close", handler);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-lg rounded-lg p-0 backdrop:bg-slate-900/40"
      onClick={(e) => {
        // Clicking the backdrop closes the modal; clicking inside doesn't.
        if (e.target === dialogRef.current) onClose();
      }}
    >
      {source && (
        <div className="flex max-h-[80vh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {source.category.replace(/-/g, " ")}
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-slate-900">
                {source.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4 text-sm leading-relaxed text-slate-700">
            {source.body.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="mb-3 whitespace-pre-wrap last:mb-0">
                {para}
              </p>
            ))}
          </div>
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
            {source.source === "override" ? (
              <span>Added by a staff member as a clarification</span>
            ) : source.sourcePages.length > 0 ? (
              <span>
                Source: {document.title} ({document.version}), page
                {source.sourcePages.length > 1 ? "s" : ""}{" "}
                {source.sourcePages.join(", ")}
              </span>
            ) : (
              <span>
                Source: {document.title} ({document.version})
              </span>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
