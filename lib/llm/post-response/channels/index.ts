// The channel registry. Order matters — the pipeline is
// short-circuit, so the first channel to hold wins. Cheaper checks
// run first so passing drafts are scored with minimum work.
//
// Adding a new channel:
//   1. Implement it as a pure `Channel` in this directory
//   2. Add a `HoldReason` value in ../types.ts
//   3. Import and register it below, in the order that makes sense
//   4. Add a unit test in __tests__/channels.test.ts

import { hallucinationChannel } from "./hallucination";
import { selfEscalationChannel } from "./self-escalation";
import { coverageChannel } from "./coverage";
import { numericChannel } from "./numeric";
import { entitiesChannel } from "./entities";
import { medicalShapeChannel } from "./medical-shape";
import type { RegisteredChannel } from "../types";

// The lexical channel (./lexical.ts) is intentionally NOT registered
// here. Empirical recall on the integration suite showed legitimate
// grounded answers clustering in the 0.28–0.53 range — meaningfully
// overlapping with the partial-hallucination range — because models
// naturally paraphrase with vocabulary ("open", "between", "find")
// that isn't literally in the source body. At any threshold that
// catches real hallucinations, the channel also holds too many
// legitimate answers. The code is kept on disk (and unit-tested)
// for future reactivation with a stronger metric (stemmed
// BM25-style scoring, or answer-against-question-plus-source union),
// but it does not run in the pipeline today.

export const channels: ReadonlyArray<RegisteredChannel> = [
  // Cheapest deterministic checks first — id set membership.
  { name: "hallucination", run: hallucinationChannel },
  { name: "self-escalation", run: selfEscalationChannel },
  { name: "coverage", run: coverageChannel },

  // Medical-shape runs BEFORE the grounding channels because it
  // produces the semantically strongest hold reason for operators:
  // "the model wrote a medical directive" is more informative than
  // "the model mentioned Tylenol which isn't in the cited sources".
  // Short-circuit on the most specific signal first.
  { name: "medical-shape", run: medicalShapeChannel },

  // Grounding channels — numeric and entity absence. These are
  // sharp signals: a fabricated phone number or a fabricated staff
  // name is almost always a real fabrication, not a paraphrase.
  { name: "numeric", run: numericChannel },
  { name: "entities", run: entitiesChannel },
];
