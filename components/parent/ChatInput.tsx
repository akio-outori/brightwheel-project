// Chat input with submit button. Disabled while a request is in
// flight so the parent can't double-submit (which would create
// duplicate needs-attention events).

"use client";

import { useState, type FormEvent } from "react";

export function ChatInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (question: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="question" className="sr-only">
        Ask a question
      </label>
      <textarea
        id="question"
        name="question"
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Ask a question about the program…"
        className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-50 disabled:text-slate-500"
        onKeyDown={(e) => {
          // Enter submits, Shift+Enter inserts a newline.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {disabled ? "Thinking…" : "Ask"}
      </button>
    </form>
  );
}
