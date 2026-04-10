// Shared types for the parent surface components. The parent UI
// doesn't care whether a citation came from a seed entry or an
// operator override — both resolve to the same visual pill + modal.
// But it does want to *show* which layer the citation came from, so
// the parent can see the operator's clarifying work when it applies.
//
// `CitationSource` is the flattened view: one entry per item,
// regardless of layer, with a `source` tag that drives a subtle
// "operator clarification" badge on the pill.

import type { HandbookCategory } from "@/lib/storage";

export interface CitationSource {
  id: string;
  title: string;
  category: HandbookCategory;
  body: string;
  sourcePages: readonly number[];
  /** "entry" = immutable seed, "override" = operator-authored. */
  source: "entry" | "override";
}

export interface DocumentInfo {
  id: string;
  title: string;
  version: string;
}
