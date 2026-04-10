// The parent chat surface. Client component, owns the conversation
// history and the loading state. Fetches answers from /api/ask and
// routes every response through ParentAnswer (two-branch render:
// AnswerCard or EscalationCard, no third path).

"use client";

import { useCallback, useState } from "react";
import type { AnswerContract } from "@/lib/llm";
import { ChatInput } from "./ChatInput";
import { HandbookEntryModal } from "./HandbookEntryModal";
import { ParentAnswer } from "./ParentAnswer";
import type { CitationSource, DocumentInfo } from "./types";

interface ChatTurn {
  id: string;
  question: string;
  // result is null while the request is in flight, then the contract
  // once it resolves. On error it becomes a synthetic escalation.
  result: AnswerContract | null;
  error?: string;
}

export function ParentChat({
  document,
  sources,
}: {
  document: DocumentInfo;
  sources: CitationSource[];
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [openSource, setOpenSource] = useState<CitationSource | null>(null);

  const handleSubmit = useCallback(async (question: string) => {
    const turnId = crypto.randomUUID();
    setTurns((prev) => [...prev, { id: turnId, question, result: null }]);
    setPending(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  result: {
                    answer: "",
                    confidence: "low",
                    cited_entries: [],
                    escalate: true,
                    escalation_reason: "request_failed",
                  },
                  error: `HTTP ${res.status}`,
                }
              : t,
          ),
        );
        return;
      }

      const contract = (await res.json()) as AnswerContract;
      setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, result: contract } : t)));
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                result: {
                  answer: "",
                  confidence: "low",
                  cited_entries: [],
                  escalate: true,
                  escalation_reason: "request_failed",
                },
                error: err instanceof Error ? err.message : String(err),
              }
            : t,
        ),
      );
    } finally {
      setPending(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {turns.length > 0 && (
        <div className="flex flex-col gap-4">
          {turns.map((turn) => (
            <div key={turn.id} className="flex flex-col gap-2">
              <div className="self-end rounded-2xl rounded-br-sm bg-sky-600 px-4 py-2 text-sm text-white shadow-sm max-w-[85%]">
                {turn.question}
              </div>
              {turn.result === null ? (
                <div
                  aria-live="polite"
                  className="inline-flex items-center gap-2 self-start rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm text-slate-500"
                >
                  <span
                    aria-hidden="true"
                    className="size-2 animate-pulse rounded-full bg-slate-400"
                  />
                  Checking the family handbook…
                </div>
              ) : (
                <div className="self-start max-w-full">
                  <ParentAnswer
                    result={turn.result}
                    allSources={sources}
                    onOpenSource={setOpenSource}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ChatInput onSubmit={handleSubmit} disabled={pending} />

      <HandbookEntryModal
        source={openSource}
        document={document}
        onClose={() => setOpenSource(null)}
      />
    </div>
  );
}
