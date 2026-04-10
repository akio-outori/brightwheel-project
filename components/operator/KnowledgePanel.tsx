"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Clock,
  DollarSign,
  Heart,
  UtensilsCrossed,
  MapPin,
  Users,
  Shield,
  Calendar,
  Plus,
  Pencil,
  Check,
  X,
  Loader2,
  BookOpen,
  FileEdit,
} from "lucide-react";
import { mutate } from "swr";
import { cn } from "@/lib/utils";

interface HandbookEntry {
  id: string;
  docId: string;
  title: string;
  category: string;
  body: string;
  sourcePages: number[];
  lastUpdated: string;
}

interface OperatorOverride {
  id: string;
  docId: string;
  title: string;
  category: string;
  body: string;
  sourcePages: number[];
  createdAt: string;
  updatedAt?: string;
  createdBy: string | null;
  replacesEntryId: string | null;
}

interface HandbookResponse {
  document: {
    metadata: {
      id: string;
      title: string;
      version: string;
      source: string;
      seededAt: string;
    };
    entries: HandbookEntry[];
    overrides: OperatorOverride[];
  };
}

type DisplayItem = {
  id: string;
  title: string;
  category: string;
  body: string;
  sourcePages: number[];
  layer: "entry" | "override";
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  enrollment: Users,
  hours: Clock,
  health: Heart,
  safety: Shield,
  food: UtensilsCrossed,
  fees: DollarSign,
  transportation: MapPin,
  curriculum: BookOpen,
  general: Calendar,
};

const CATEGORY_COLORS: Record<string, string> = {
  hours: "bg-blue-50 text-blue-600 border-blue-100",
  fees: "bg-emerald-50 text-emerald-600 border-emerald-100",
  health: "bg-red-50 text-red-500 border-red-100",
  safety: "bg-red-50 text-red-500 border-red-100",
  food: "bg-orange-50 text-orange-500 border-orange-100",
  enrollment: "bg-violet-50 text-violet-600 border-violet-100",
  curriculum: "bg-indigo-50 text-indigo-600 border-indigo-100",
  communication: "bg-sky-50 text-sky-600 border-sky-100",
  staff: "bg-teal-50 text-teal-600 border-teal-100",
  policies: "bg-slate-50 text-slate-600 border-slate-100",
  transportation: "bg-amber-50 text-amber-600 border-amber-100",
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function KnowledgePanel() {
  const { data, error, isLoading, mutate } = useSWR<HandbookResponse>("/api/handbook", fetcher);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [saving, setSaving] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
        Failed to load knowledge base. Make sure the backend is running.
      </div>
    );
  }

  const { entries, overrides } = data.document;

  // Merge entries and overrides into a single list
  const items: DisplayItem[] = [
    ...overrides.map<DisplayItem>((o) => ({
      id: o.id,
      title: o.title,
      category: o.category,
      body: o.body,
      sourcePages: o.sourcePages,
      layer: "override",
    })),
    ...entries.map<DisplayItem>((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      body: e.body,
      sourcePages: e.sourcePages,
      layer: "entry",
    })),
  ];

  const categories = [...new Set(items.map((i) => i.category))].sort();
  const filtered =
    activeCategory === "all" ? items : items.filter((i) => i.category === activeCategory);

  const startEdit = (item: DisplayItem) => {
    setEditing(item.id);
    setEditText(item.body);
  };

  const saveEdit = async (item: DisplayItem) => {
    if (item.layer !== "override") return;
    setSaving(true);
    try {
      const res = await fetch(`/api/overrides/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editText }),
      });
      if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`);
      await mutate();
      setEditing(null);
    } catch (err) {
      console.error("Failed to save override:", err);
      alert(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="bg-[#5B4FCF]/5 border border-[#5B4FCF]/10 rounded-2xl p-4 mb-5">
        <p className="text-sm font-semibold text-[#5B4FCF] mb-0.5">Knowledge Base</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          {data.document.metadata.title} (v{data.document.metadata.version}) — {entries.length}{" "}
          handbook entries, {overrides.length} operator overrides.
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {["all", ...categories].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0",
              activeCategory === cat
                ? "bg-[#5B4FCF] text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-500 hover:border-[#5B4FCF] hover:text-[#5B4FCF]",
            )}
          >
            {cat === "all" ? "All topics" : cat}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-2.5">
        {filtered.map((item) => {
          const Icon = ICON_MAP[item.category] || Clock;
          const isEditing = editing === item.id;
          const colorClass =
            CATEGORY_COLORS[item.category] || "bg-gray-50 text-gray-500 border-gray-100";

          return (
            <div
              key={item.id}
              className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border bg-violet-50 border-violet-100">
                    <Icon className="w-4 h-4 text-[#5B4FCF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-block",
                              colorClass,
                            )}
                          >
                            {item.category}
                          </span>
                          {item.layer === "override" && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-600 border-amber-100 inline-flex items-center gap-0.5">
                              <FileEdit className="w-2.5 h-2.5" />
                              override
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-gray-800 leading-snug">{item.title}</p>
                      </div>
                      {!isEditing && item.layer === "override" && (
                        <button
                          onClick={() => startEdit(item)}
                          className="w-7 h-7 rounded-lg bg-gray-50 hover:bg-violet-50 hover:text-[#5B4FCF] text-gray-400 flex items-center justify-center flex-shrink-0 transition-colors border border-gray-100"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="mt-2">
                      {isEditing ? (
                        <div>
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={4}
                            className="w-full text-sm rounded-xl border border-[#5B4FCF]/30 bg-violet-50/30 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#5B4FCF]/20 focus:border-[#5B4FCF] transition-all leading-relaxed"
                            autoFocus
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => saveEdit(item)}
                              disabled={saving}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5B4FCF] text-white text-xs font-semibold rounded-lg hover:bg-[#4A3FB8] transition-colors disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" /> {saving ? "Saving..." : "Save changes"}
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">
                          {item.body}
                        </p>
                      )}
                    </div>

                    {!isEditing && item.sourcePages.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {item.sourcePages.map((p) => (
                          <span
                            key={p}
                            className="text-[10px] bg-gray-50 border border-gray-100 text-gray-400 rounded-full px-2 py-0.5"
                          >
                            p. {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add new override */}
      <AddOverrideForm />
    </div>
  );
}

function AddOverrideForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (saving || !title.trim() || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/overrides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category: "general",
          body: body.trim(),
          sourcePages: [],
          replacesEntryId: null,
          createdBy: null,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error((detail as { error?: string }).error ?? `Failed (HTTP ${res.status})`);
      }
      await mutate("/api/handbook");
      setTitle("");
      setBody("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-3 border-2 border-dashed border-gray-200 hover:border-[#5B4FCF] rounded-2xl py-4 flex items-center justify-center gap-2 text-gray-400 hover:text-[#5B4FCF] transition-all text-sm font-semibold group"
      >
        <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
        Add override
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-2 border-[#5B4FCF]/20 rounded-2xl p-4 bg-[#5B4FCF]/5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#5B4FCF]">New override</p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5B4FCF]/30"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="The answer parents should see..."
        rows={3}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-y focus:outline-none focus:ring-2 focus:ring-[#5B4FCF]/30"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={saving || !title.trim() || !body.trim()}
        className="w-full py-2.5 bg-[#5B4FCF] hover:bg-[#4A3FB8] text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {saving ? "Saving..." : "Create override"}
      </button>
    </div>
  );
}
