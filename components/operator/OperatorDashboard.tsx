"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Sun,
  MessageSquare,
  BookOpen,
  TrendingUp,
  Clock,
  ArrowLeft,
  AlertTriangle,
  Bell,
  LogOut,
  Settings as SettingsIcon,
  User as UserIcon,
} from "lucide-react";
import { CENTER } from "@/data/centerData";
import { CURRENT_STAFF } from "@/data/staffUser";
import QuestionLogPanel from "@/components/operator/QuestionLogPanel";
import KnowledgePanel from "@/components/operator/KnowledgePanel";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { NeedsAttentionEvent } from "@/lib/storage/types";

const TABS = [
  { id: "questions", label: "Questions", icon: MessageSquare },
  { id: "knowledge", label: "Handbook", icon: BookOpen },
] as const;

// SWR key for the full needs-attention list (open + resolved).
// Shared across OperatorDashboard and QuestionLogPanel so both see
// the same cache entry and a `mutate()` from one surface refreshes
// the other.
export const EVENTS_SWR_KEY = "/api/needs-attention?state=all";

// Filter state type used by the stats-card sort buttons.
export type EventFilter = "all" | "unresolved" | "resolved";

// CURRENT_STAFF lives in `@/data/staffUser` so the settings
// dropdown here and the /admin/profile page render from the
// same source.

// NeedsAttentionEvent imported from canonical source above.

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Click-outside handler that closes a popover when the user
 *  clicks or taps anywhere outside the given ref. Used by the
 *  bell dropdown and the settings menu. Escape also closes. */
function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  isOpen: boolean,
) {
  useEffect(() => {
    if (!isOpen) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onClose, isOpen]);
}

export default function OperatorDashboard() {
  const [tab, setTab] = useState<string>("questions");
  const [filter, setFilter] = useState<EventFilter>("all");
  // Which question card is expanded in the feed. Lifted to the
  // dashboard so the bell dropdown can programmatically open a
  // specific event when the operator clicks a notification row.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const bellRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  useClickOutside(bellRef, () => setBellOpen(false), bellOpen);
  useClickOutside(settingsRef, () => setSettingsOpen(false), settingsOpen);

  const { data: naData } = useSWR<{ events: NeedsAttentionEvent[] }>(EVENTS_SWR_KEY, fetcher, {
    refreshInterval: 10000,
  });

  // Fetch the handbook once so we can resolve cited-entry IDs to
  // human-readable titles in QuestionLogPanel.
  const { data: handbookData } = useSWR<{
    document?: {
      entries?: Array<{ id: string; title: string }>;
      overrides?: Array<{ id: string; title: string }>;
    };
  }>("/api/handbook", fetcher);

  const entryTitleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const e of handbookData?.document?.entries ?? []) map.set(e.id, e.title);
    for (const o of handbookData?.document?.overrides ?? []) map.set(o.id, o.title);
    return map;
  }, [handbookData]);

  const events = naData?.events ?? [];
  const unresolved = events.filter((e) => !e.resolvedAt);
  const resolved = events.filter((e) => e.resolvedAt);

  // The stat cards are three sort/filter buttons. Clicking one
  // changes which subset of events the QuestionLogPanel shows.
  const statCards: Array<{
    id: EventFilter;
    label: string;
    count: number;
    sublabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: "all",
      label: "Parent questions",
      count: events.length,
      sublabel: "total",
      icon: TrendingUp,
    },
    {
      id: "unresolved",
      label: "Awaiting your answer",
      count: unresolved.length,
      sublabel: "needs staff",
      icon: AlertTriangle,
    },
    {
      id: "resolved",
      label: "Staff answered",
      count: resolved.length,
      sublabel: "this session",
      icon: Clock,
    },
  ];

  const filteredEvents =
    filter === "unresolved" ? unresolved : filter === "resolved" ? resolved : events;

  // Bell dropdown → clicking a notification row jumps into the
  // feed: set the filter to "unresolved", expand the target
  // event, and close the dropdown. The QuestionLogPanel will
  // scroll the expanded card into view.
  function openEventFromBell(id: string) {
    setFilter("unresolved");
    setExpandedId(id);
    setBellOpen(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/*
        Top nav.
        NOTE on overflow: the purple header used to have
        `overflow-hidden` so the decorative circle in the
        corner didn't bleed outside its bounds. But that also
        clipped the bell / settings dropdowns, which need to
        extend downward *past* the header into the content
        area. Fix: the header itself no longer clips, and the
        decorative circle lives in a dedicated absolutely-
        positioned clipping container that sits behind the
        content. `pointer-events-none` keeps it from eating
        clicks meant for the buttons above.
      */}
      <div className="bg-[#5B4FCF] px-5 pt-10 pb-5 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-24 translate-x-24" />
        </div>
        {/*
          The inner wrapper deliberately does NOT set `z-10`. A
          `relative z-10` here would create a new stacking context
          — everything inside (including the bell / settings
          dropdowns) would then be trapped inside a z-10 group
          sitting at the root level, and because the sticky tab
          bar below is ALSO at z-10 (and comes later in the DOM),
          the tab bar's stacking context paints on top of the
          header's, clipping any dropdown that extends past the
          header's bottom edge. Leaving this wrapper as plain
          `relative` with no z-index keeps it out of the
          stacking-context machinery so the dropdowns' z-40
          competes globally and can land above the tab bar.
        */}
        <div className="relative max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            {/* Brand / staff settings menu */}
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen((v) => !v);
                  setBellOpen(false);
                }}
                className="flex items-center gap-2.5 group"
                aria-haspopup="menu"
                aria-expanded={settingsOpen}
              >
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                  <Sun className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-white/70 text-[10px] font-medium tracking-wide uppercase">
                    brightdesk
                  </p>
                  <h1 className="text-white font-bold text-sm">{CENTER.name}</h1>
                </div>
              </button>
              {settingsOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl ring-1 ring-black/5 overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#5B4FCF] text-white flex items-center justify-center font-semibold text-sm">
                      {CURRENT_STAFF.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {CURRENT_STAFF.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{CURRENT_STAFF.role}</p>
                      <p className="text-[11px] text-gray-400 truncate">{CURRENT_STAFF.email}</p>
                    </div>
                  </div>
                  <nav className="py-1 text-sm text-gray-700">
                    <Link
                      href="/admin/profile"
                      className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 text-left"
                      onClick={() => setSettingsOpen(false)}
                    >
                      <UserIcon className="w-4 h-4 text-gray-400" />
                      Profile
                    </Link>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 text-left"
                      onClick={() => setSettingsOpen(false)}
                    >
                      <SettingsIcon className="w-4 h-4 text-gray-400" />
                      Notification preferences
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 text-left text-red-600"
                      onClick={() => setSettingsOpen(false)}
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </nav>
                </div>
              )}
            </div>

            {/* Right side — bell + parent view link */}
            <div className="flex items-center gap-2">
              <div className="relative" ref={bellRef}>
                <button
                  type="button"
                  onClick={() => {
                    setBellOpen((v) => !v);
                    setSettingsOpen(false);
                  }}
                  className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center relative"
                  aria-haspopup="menu"
                  aria-expanded={bellOpen}
                  aria-label={`${unresolved.length} unanswered question${unresolved.length === 1 ? "" : "s"}`}
                >
                  <Bell className="w-4 h-4 text-white" />
                  {unresolved.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-amber-400 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                      {unresolved.length}
                    </span>
                  )}
                </button>
                {bellOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl ring-1 ring-black/5 overflow-hidden z-40">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900">
                        {unresolved.length === 0
                          ? "You're all caught up!"
                          : `${unresolved.length} unanswered question${unresolved.length === 1 ? "" : "s"}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {unresolved.length === 0
                          ? "No parents waiting — the AI handled everything so far."
                          : "Click one to jump in."}
                      </p>
                    </div>
                    {/* No internal scroll — the dropdown sizes to its
                        content so everything is visible at once. If
                        the queue grows unreasonably long in practice
                        we can add a virtualized list, but the whole
                        point of the dashboard is that this queue is
                        short. */}
                    <div>
                      {unresolved.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-gray-400">
                          Nothing to review — nice work!
                        </div>
                      ) : (
                        unresolved.map((evt) => (
                          <button
                            key={evt.id}
                            type="button"
                            onClick={() => openEventFromBell(evt.id)}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                          >
                            <p className="text-sm text-gray-800 font-medium leading-snug line-clamp-2">
                              {evt.question}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-1">
                              {format(new Date(evt.createdAt), "h:mm a")}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Link
                href="/"
                className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white border border-white/20 rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20 transition-all"
              >
                <ArrowLeft className="w-3 h-3" /> Parent view
              </Link>
            </div>
          </div>

          {/* Stat cards — each is a sort/filter button. Active
              filter gets a highlighted ring. */}
          <div className="grid grid-cols-3 gap-3">
            {statCards.map((s) => {
              const isActive = filter === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFilter(s.id)}
                  aria-pressed={isActive}
                  className={cn(
                    "text-left rounded-xl p-3 transition-all border",
                    isActive
                      ? "bg-white text-[#5B4FCF] border-white shadow-md"
                      : "bg-white/15 backdrop-blur border-white/10 text-white hover:bg-white/25",
                  )}
                >
                  <s.icon
                    className={cn("w-4 h-4 mb-1", isActive ? "text-[#5B4FCF]" : "text-white/70")}
                  />
                  <div className="text-xl font-bold leading-none">{s.count}</div>
                  <div
                    className={cn(
                      "text-[10px] leading-tight mt-1",
                      isActive ? "text-[#5B4FCF]/70" : "text-white/70",
                    )}
                  >
                    {s.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold border-b-2 transition-all",
                tab === t.id
                  ? "border-[#5B4FCF] text-[#5B4FCF]"
                  : "border-transparent text-gray-400 hover:text-gray-600",
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {tab === "questions" && (
          <QuestionLogPanel
            events={filteredEvents}
            filter={filter}
            expandedId={expandedId}
            onExpandChange={setExpandedId}
            entryTitleMap={entryTitleMap}
          />
        )}
        {tab === "knowledge" && <KnowledgePanel />}
      </div>
    </div>
  );
}
