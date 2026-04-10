// Types for the post-response classifier pipeline. The pipeline runs
// after the LLM has produced a draft answer and decides whether that
// draft is safe to return to the parent. It is entirely deterministic
// — every channel is plain TypeScript, no model calls, no network.
//
// Architecture borrowed from two places:
//   - go-mcp-sdk/sdk/grounding/* — stacked channels (lexical, numeric,
//     proximity) that each compute evidence for whether an LLM output
//     is grounded in provided source material.
//   - agent-dmz/internal/classify/pipeline.go — short-circuit classifier
//     pipeline that stops at the first channel to raise a verdict.
//
// The pipeline itself is dumb: it runs channels in order, returns the
// first hold, or passes if everything is clean. Per-channel logic
// lives in lib/llm/post-response/channels/*.ts.

import type { AnswerContract } from "../contract";

/** A single source of grounding the draft can cite. Entries ∪ overrides
 *  are funneled through this shape so channels do not care which layer
 *  a source came from. */
export interface GroundingSource {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/** What every channel receives. `cited` is the subset of `allSources`
 *  whose id is in `draft.cited_entries` or `draft.directly_addressed_by`;
 *  pre-resolving it saves channels from having to recompute. */
export interface ChannelInput {
  readonly question: string;
  readonly draft: AnswerContract;
  readonly cited: ReadonlyArray<GroundingSource>;
  readonly allSources: ReadonlyArray<GroundingSource>;
}

/** Verdict from a single channel. Channels that pass return
 *  `{ verdict: "pass" }` with no reason; channels that hold return
 *  `{ verdict: "hold", reason, detail? }`. The reason is a stable
 *  namespace identifier (e.g. "hallucinated_citation") that downstream
 *  UI and logs treat as an enum. `detail` is a free-form string for
 *  operator visibility — it is never shown to the parent. */
export type ChannelVerdict =
  | { readonly verdict: "pass" }
  | {
      readonly verdict: "hold";
      readonly reason: HoldReason;
      readonly detail?: string;
    };

/** Stable identifiers for every hold reason the pipeline can emit.
 *  Adding a new channel means adding a new value here. The operator
 *  UI keys its hold-reason badges off this enum. */
export type HoldReason =
  | "hallucinated_citation"
  | "model_self_escalated"
  | "no_direct_coverage"
  | "lexical_unsupported"
  | "fabricated_numeric"
  | "fabricated_entity"
  | "medical_instruction"
  | "specific_child_question";

/** A channel is a pure function from input to verdict. No I/O, no
 *  async, no state. Enforced by the signature — this is a deliberate
 *  constraint so the pipeline stays testable and fast. */
export type Channel = (input: ChannelInput) => ChannelVerdict;

/** A named channel in the pipeline registry. The name is used in
 *  error logs and (when relevant) in the detail field. */
export interface RegisteredChannel {
  readonly name: string;
  readonly run: Channel;
}

/** Pipeline result. `pass` means every channel passed; the route
 *  returns the model's draft unchanged. `hold` means one channel
 *  raised a verdict; the route returns a stock response instead and
 *  writes the draft into needs-attention for operator review. */
export type PipelineResult =
  | { readonly verdict: "pass" }
  | {
      readonly verdict: "hold";
      readonly reason: HoldReason;
      readonly detail?: string;
      readonly channel: string;
    };
