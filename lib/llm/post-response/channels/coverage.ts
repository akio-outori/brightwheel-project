// Coverage channel. The model is asked to fill
// `directly_addressed_by` with the ids of any items (entries or
// overrides) that *directly answer* the question, as distinct from
// items that are merely on a related topic. We hold the draft only
// when BOTH `directly_addressed_by` and `cited_entries` are empty —
// that's the honest "the model has nothing grounded to say" signal.
//
// Why not hold on empty `directly_addressed_by` alone?
// In practice the model uses the two fields differently. A hedged
// but grounded answer like "Our hours vary by center, but most open
// between 7 and 8 am" will cite `hours-of-operation` AND return
// `directly_addressed_by=[]` because no entry has the EXACT time
// for a specific unnamed center. That's honest and useful — the
// answer carries real information from a real source. Holding on it
// would force a stock response for a class of questions where the
// model IS grounded, just not exact. The hallucination channel
// already enforces that any cited id is real, so "cited something"
// is a strong enough signal of groundedness to let the answer
// through.
//
// The "directly_addressed_by=[]" signal is still load-bearing: when
// the model populates neither list, that IS the "I have nothing"
// case and we hold.

import type { Channel } from "../types";

export const coverageChannel: Channel = ({ draft }) => {
  const directly = draft.directly_addressed_by;
  const cited = draft.cited_entries;

  const hasDirect = Array.isArray(directly) && directly.length > 0;
  const hasCited = Array.isArray(cited) && cited.length > 0;

  if (hasDirect || hasCited) return { verdict: "pass" };

  return {
    verdict: "hold",
    reason: "no_direct_coverage",
    detail: "model returned cited_entries=[] and directly_addressed_by=[]",
  };
};
