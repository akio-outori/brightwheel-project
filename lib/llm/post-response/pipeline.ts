// Pipeline orchestrator. Runs the registered channels in order,
// short-circuits on the first `hold` verdict, and returns a
// PipelineResult the route can act on.
//
// The channel registry is a const array in channels/index.ts — this
// file does not know which channels exist, it just runs whatever it's
// handed. Adding a channel is a one-line change in the registry.

import { channels } from "./channels";
import type { ChannelInput, GroundingSource, PipelineResult } from "./types";
import type { AnswerContract } from "../contract";

/** Pre-resolve the cited subset of allSources from the draft's id
 *  fields, then run every channel in order. First hold wins. */
export function runPostResponsePipeline(args: {
  question: string;
  draft: AnswerContract;
  allSources: ReadonlyArray<GroundingSource>;
}): PipelineResult {
  const { question, draft, allSources } = args;

  // Resolve the subset of sources the model claims to have used. Any
  // id the model cited that doesn't exist in allSources is NOT added
  // here — the hallucination channel will catch it.
  const citedIdSet = new Set<string>([
    ...draft.cited_entries,
    ...(draft.directly_addressed_by ?? []),
  ]);
  const cited: GroundingSource[] = allSources.filter((s) => citedIdSet.has(s.id));

  const input: ChannelInput = { question, draft, cited, allSources };

  for (const channel of channels) {
    const v = channel.run(input);
    if (v.verdict === "hold") {
      return {
        verdict: "hold",
        reason: v.reason,
        detail: v.detail,
        channel: channel.name,
      };
    }
  }

  return { verdict: "pass" };
}
