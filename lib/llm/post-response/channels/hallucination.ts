// Hallucination channel. Every id the model cites (in cited_entries
// or directly_addressed_by) must exist in the union of entries ∪
// overrides for the active document. A fabricated id means the
// draft is citing a source that isn't real — the single most
// dangerous failure mode for a grounded front desk, since the
// parent sees a fluent answer backed by nothing.
//
// This used to live as an ad-hoc block inside app/api/ask/route.ts.
// Moving it into a channel standardizes the hold-reason shape and
// lets it run alongside the rest of the pipeline.

import type { Channel } from "../types";

export const hallucinationChannel: Channel = ({ draft, allSources }) => {
  const known = new Set<string>(allSources.map((s) => s.id));
  const citedIds = [
    ...draft.cited_entries,
    ...(draft.directly_addressed_by ?? []),
  ];

  const unknown = citedIds.filter((id) => !known.has(id));
  if (unknown.length === 0) return { verdict: "pass" };

  return {
    verdict: "hold",
    reason: "hallucinated_citation",
    detail: `unknown ids: ${unknown.join(", ")}`,
  };
};
