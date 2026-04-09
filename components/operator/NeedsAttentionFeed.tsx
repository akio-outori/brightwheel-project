// The needs-attention feed. Client component because it uses SWR to
// revalidate after the one-tap fix. Shows the newest events first;
// empty state is celebratory, not blank.

"use client";

import useSWR from "swr";
import type { NeedsAttentionEvent } from "@/lib/storage";
import { NeedsAttentionItem } from "./NeedsAttentionItem";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ events: NeedsAttentionEvent[] }>;
  });

export function NeedsAttentionFeed({ limit }: { limit?: number }) {
  const { data, error, isLoading } = useSWR(
    "/api/needs-attention",
    fetcher,
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        Could not load the feed: {String(error.message ?? error)}
      </div>
    );
  }

  const events = data?.events ?? [];
  const visible = limit ? events.slice(0, limit) : events;

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-2xl" aria-hidden="true">
          ✓
        </p>
        <p className="mt-1 text-sm font-medium text-emerald-900">
          All caught up
        </p>
        <p className="mt-1 text-xs text-emerald-800/80">
          No family questions need your attention right now.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((event) => (
        <NeedsAttentionItem key={event.id} event={event} />
      ))}
      {limit && events.length > limit && (
        <p className="text-xs text-slate-500">
          Showing {limit} of {events.length} open events.
        </p>
      )}
    </div>
  );
}
