// Barrel export for the post-response pipeline. Callers outside
// `lib/llm/post-response` should import from here, not from
// individual channel or pipeline files.

export { runPostResponsePipeline } from "./pipeline";
export { buildStockResponse, parseHoldReason } from "./stock-response";
export type {
  Channel,
  ChannelInput,
  ChannelVerdict,
  GroundingSource,
  HoldReason,
  PipelineResult,
  RegisteredChannel,
} from "./types";
