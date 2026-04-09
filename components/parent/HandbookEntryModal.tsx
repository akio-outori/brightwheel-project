// A simple modal that shows a handbook entry's full body. Opens when
// the parent clicks a citation pill. Uses native <dialog> so it's
// accessible (Esc to close, backdrop click) without pulling in a
// modal library.

"use client";

import { useEffect, useRef } from "react";
import type { HandbookEntry } from "@/lib/storage";

export function HandbookEntryModal({
  entry,
  onClose,
}: {
  entry: HandbookEntry | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (entry && !dialog.open) dialog.showModal();
    if (!entry && dialog.open) dialog.close();
  }, [entry]);

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
      {entry && (
        <div className="flex max-h-[80vh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {entry.category.replace(/-/g, " ")}
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-slate-900">
                {entry.title}
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
            {entry.body.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="mb-3 whitespace-pre-wrap last:mb-0">
                {para}
              </p>
            ))}
          </div>
          {entry.sourcePages.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
              Source: DCFD Family Handbook (2019), page
              {entry.sourcePages.length > 1 ? "s" : ""}{" "}
              {entry.sourcePages.join(", ")}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
