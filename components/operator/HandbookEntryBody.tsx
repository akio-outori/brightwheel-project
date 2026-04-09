// Renders a handbook entry body as markdown. Operator-authored (or
// seed) content is treated as untrusted on the render path — we use
// react-markdown, never dangerouslySetInnerHTML, because humans paste
// things and paste things include scripts.

"use client";

import ReactMarkdown from "react-markdown";

export function HandbookEntryBody({ body }: { body: string }) {
  return (
    <div className="prose prose-sm max-w-none text-slate-700 prose-headings:text-slate-900 prose-a:text-sky-600 prose-strong:text-slate-900">
      <ReactMarkdown>{body}</ReactMarkdown>
    </div>
  );
}
