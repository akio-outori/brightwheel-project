import { AdminShell } from "@/components/operator/AdminShell";
import { NeedsAttentionFeed } from "@/components/operator/NeedsAttentionFeed";

export const dynamic = "force-dynamic";

export default function NeedsAttentionPage() {
  return (
    <AdminShell active="needs-attention">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Needs attention</h2>
        <p className="mt-1 text-sm text-slate-600">
          Open questions the assistant escalated. Click <strong>Answer this</strong> to write a
          handbook entry and close the loop in one step.
        </p>
      </div>
      <NeedsAttentionFeed />
    </AdminShell>
  );
}
