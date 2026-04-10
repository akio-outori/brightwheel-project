// Notification bell for the operator console. Shows an unread-count
// badge driven by the existing SWR poll of /api/needs-attention, and
// fires a browser Notification (OS-level) when a new event arrives
// while the operator is not focused on the admin tab.
//
// Scope note: today there is one active document, so "operators for
// this document" = "any operator loading /admin". A future session
// layer will filter the SWR response by docId — when that lands,
// this component can pass a docId query param to its fetcher
// without changing its external interface.
//
// The browser Notifications API is the demo push channel.
// Production deployments will layer SSE / email / SMS on top; those
// are documented in WRITEUP as out-of-scope for this build.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { NeedsAttentionEvent } from "@/lib/storage";

const FEED_URL = "/api/needs-attention";
const LAST_SEEN_KEY = "brightwheel:lastSeenNeedsAttentionCount";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ events: NeedsAttentionEvent[] }>;
  });

function readLastSeen(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(LAST_SEEN_KEY);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function writeLastSeen(n: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_SEEN_KEY, String(n));
}

export function NotificationBell() {
  const { data } = useSWR(FEED_URL, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
  });

  // Stable reference for the events array so useEffect deps don't
  // re-fire on every SWR render regardless of whether the data
  // actually changed.
  const events = useMemo(() => data?.events ?? [], [data]);
  const count = events.length;

  // Track the previous count across renders so we can compute
  // "something new arrived" without firing on initial mount.
  const prevCountRef = useRef<number | null>(null);

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );

  // On mount, detect the Notification API and initialize permission.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  // Fire a browser notification on new events. Skip the very first
  // render (`prevCountRef.current === null`) so an operator loading
  // a fresh tab doesn't get a notification for every open event.
  useEffect(() => {
    if (data === undefined) return;
    const prev = prevCountRef.current;
    prevCountRef.current = count;

    if (prev === null) return; // first render
    if (count <= prev) return; // no growth
    if (permission !== "granted") return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const newCount = count - prev;
    // Fire a single notification summarizing the delta. A
    // per-event notification loop would spam the operator on a
    // multi-event revalidation.
    const latest = events[0];
    const bodyText = latest
      ? `"${latest.question.slice(0, 120)}"`
      : "Open the needs-attention feed to see the details.";
    try {
      new Notification(
        newCount === 1
          ? "New question needs attention"
          : `${newCount} new questions need attention`,
        { body: bodyText, tag: "brightwheel-needs-attention" },
      );
    } catch {
      // Silent — a failing Notification constructor isn't actionable
      // from here and shouldn't break the UI.
    }
  }, [data, count, events, permission]);

  // Reset the unread baseline when the operator visits the feed.
  // We don't have a router event here; use a click handler on the
  // badge itself as a best-effort acknowledgement.
  function handleAcknowledge(): void {
    writeLastSeen(count);
  }

  const lastSeen = readLastSeen();
  const unread = Math.max(0, count - lastSeen);

  async function requestPermission(): Promise<void> {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const next = await Notification.requestPermission();
      setPermission(next);
    } catch {
      // User dismissed or browser refused — stay on "default".
    }
  }

  if (permission === "unsupported") {
    return (
      <BadgeOnly
        unread={unread}
        totalOpen={count}
        onAcknowledge={handleAcknowledge}
      />
    );
  }

  if (permission === "default") {
    return (
      <div className="flex items-center gap-2">
        <BadgeOnly
          unread={unread}
          totalOpen={count}
          onAcknowledge={handleAcknowledge}
        />
        <button
          type="button"
          onClick={requestPermission}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
          title="Enable OS-level notifications when new questions arrive"
        >
          Enable alerts
        </button>
      </div>
    );
  }

  return (
    <BadgeOnly
      unread={unread}
      totalOpen={count}
      onAcknowledge={handleAcknowledge}
    />
  );
}

function BadgeOnly({
  unread,
  totalOpen,
  onAcknowledge,
}: {
  unread: number;
  totalOpen: number;
  onAcknowledge: () => void;
}) {
  const label =
    totalOpen === 0
      ? "Feed is clear"
      : unread > 0
        ? `${unread} new · ${totalOpen} open`
        : `${totalOpen} open`;
  return (
    <a
      href="/admin/needs-attention"
      onClick={onAcknowledge}
      className={
        unread > 0
          ? "inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-200"
          : totalOpen > 0
            ? "inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200"
            : "inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200"
      }
    >
      <span aria-hidden="true">🔔</span>
      <span>{label}</span>
    </a>
  );
}
