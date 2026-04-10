"use client";

import { useState } from "react";
import { KNOWLEDGE_BASE, type KnowledgeItem } from "@/data/centerData";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Clock,
  DollarSign,
  Heart,
  UtensilsCrossed,
  MapPin,
  Users,
  Shield,
  Calendar,
};

const CATEGORIES = [...new Set(KNOWLEDGE_BASE.map((k) => k.category))];

const CATEGORY_COLORS: Record<string, string> = {
  "Hours & Schedule": "bg-blue-50 text-blue-600 border-blue-100",
  "Tuition & Fees": "bg-emerald-50 text-emerald-600 border-emerald-100",
  "Health & Safety": "bg-red-50 text-red-500 border-red-100",
  "Meals & Nutrition": "bg-orange-50 text-orange-500 border-orange-100",
  Enrollment: "bg-violet-50 text-violet-600 border-violet-100",
};

export default function KnowledgePanel() {
  const [items, setItems] = useState<KnowledgeItem[]>(KNOWLEDGE_BASE);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const startEdit = (item: KnowledgeItem) => {
    setEditing(item.id);
    setEditText(item.answer);
  };
  const saveEdit = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, answer: editText } : item,
      ),
    );
    setEditing(null);
  };

  const filtered =
    activeCategory === "all"
      ? items
      : items.filter((i) => i.category === activeCategory);

  return (
    <div>
      <div className="bg-[#5B4FCF]/5 border border-[#5B4FCF]/10 rounded-2xl p-4 mb-5">
        <p className="text-sm font-semibold text-[#5B4FCF] mb-0.5">
          Knowledge Base
        </p>
        <p className="text-xs text-gray-500 leading-relaxed">
          These are the policies the AI uses to answer parent questions. Keep
          them accurate and up to date for best results.
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {["all", ...CATEGORIES].map((cat) => (
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
          const Icon = ICON_MAP[item.icon] || Clock;
          const isEditing = editing === item.id;
          const colorClass =
            CATEGORY_COLORS[item.category] ||
            "bg-gray-50 text-gray-500 border-gray-100";

          return (
            <div
              key={item.id}
              className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border",
                      colorClass
                        .replace(/text-\S+/, "")
                        .replace(/border-\S+/, "") +
                        " bg-violet-50 border-violet-100",
                    )}
                  >
                    <Icon className="w-4 h-4 text-[#5B4FCF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-block mb-1",
                            colorClass,
                          )}
                        >
                          {item.category}
                        </span>
                        <p className="text-sm font-bold text-gray-800 leading-snug">
                          {item.question}
                        </p>
                      </div>
                      {!isEditing && (
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
                              onClick={() => saveEdit(item.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5B4FCF] text-white text-xs font-semibold rounded-lg hover:bg-[#4A3FB8] transition-colors"
                            >
                              <Check className="w-3 h-3" /> Save changes
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
                        <p className="text-sm text-gray-500 leading-relaxed">
                          {item.answer}
                        </p>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {item.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] bg-gray-50 border border-gray-100 text-gray-400 rounded-full px-2 py-0.5"
                          >
                            {tag}
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

      {/* Add new */}
      <button className="w-full mt-3 border-2 border-dashed border-gray-200 hover:border-[#5B4FCF] rounded-2xl py-4 flex items-center justify-center gap-2 text-gray-400 hover:text-[#5B4FCF] transition-all text-sm font-semibold group">
        <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
        Add knowledge entry
      </button>
    </div>
  );
}
