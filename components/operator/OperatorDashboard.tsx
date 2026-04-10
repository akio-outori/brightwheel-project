"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Sun,
  MessageSquare,
  BookOpen,
  TrendingUp,
  Clock,
  ArrowLeft,
  Sparkles,
  Bell,
} from "lucide-react";
import { CENTER } from "@/data/centerData";
import QuestionLogPanel from "@/components/operator/QuestionLogPanel";
import KnowledgePanel from "@/components/operator/KnowledgePanel";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "questions", label: "Questions", icon: MessageSquare },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
] as const;

interface AnswerContract {
  answer: string;
  confidence: "high" | "low";
  cited_entries: string[];
  escalate: boolean;
  escalation_reason?: string;
}

interface NeedsAttentionEvent {
  id: string;
  question: string;
  result: AnswerContract;
  createdAt: string;
  resolvedAt?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function OperatorDashboard() {
  const [tab, setTab] = useState<string>("questions");
  const { data: naData } = useSWR<{ events: NeedsAttentionEvent[] }>(
    "/api/needs-attention",
    fetcher,
    { refreshInterval: 10000 },
  );

  const events = naData?.events ?? [];
  const escalatedCount = events.filter((e) => e.result.escalate).length;
  const totalQuestions = events.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <div className="bg-[#5B4FCF] px-5 pt-10 pb-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-24 translate-x-24" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <Sun className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white/70 text-[10px] font-medium tracking-wide uppercase">
                  brightdesk
                </p>
                <h1 className="text-white font-bold text-sm">{CENTER.name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {escalatedCount > 0 && (
                <div className="relative">
                  <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                    <Bell className="w-4 h-4 text-white" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                    {escalatedCount}
                  </span>
                </div>
              )}
              <Link
                href="/"
                className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white border border-white/20 rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20 transition-all"
              >
                <ArrowLeft className="w-3 h-3" /> Parent view
              </Link>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Open events",
                value: totalQuestions.toString(),
                sublabel: "needs attention",
                icon: TrendingUp,
              },
              {
                label: "Escalated",
                value: escalatedCount.toString(),
                sublabel: "awaiting staff",
                icon: Sparkles,
              },
              {
                label: "Response time",
                value: "< 2s",
                sublabel: "AI avg response",
                icon: Clock,
              },
            ].map((s) => (
              <div key={s.label} className="bg-white/15 backdrop-blur rounded-xl p-3 text-center">
                <s.icon className="w-4 h-4 text-white/70 mx-auto mb-1" />
                <div className="text-xl font-bold text-white">{s.value}</div>
                <div className="text-[10px] text-white/60 leading-tight mt-0.5">{s.sublabel}</div>
              </div>
            ))}
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
        {tab === "questions" && <QuestionLogPanel />}
        {tab === "knowledge" && <KnowledgePanel />}
      </div>
    </div>
  );
}
