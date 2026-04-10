// Operator landing. The needs-attention feed is the headline — it's
// the first thing the operator sees, because it's the reason they're
// here. The handbook summary lives below.

import Link from "next/link";
import { AdminShell } from "@/components/operator/AdminShell";
import { NeedsAttentionFeed } from "@/components/operator/NeedsAttentionFeed";

export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  return (
    <AdminShell active="home">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Needs attention</h2>
          <Link
            href="/admin/needs-attention"
            className="text-xs font-medium text-sky-600 hover:text-sky-700"
          >
            View all →
          </Link>
        </div>
        <NeedsAttentionFeed limit={5} />
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Family handbook</h2>
          <Link
            href="/admin/handbook"
            className="text-xs font-medium text-sky-600 hover:text-sky-700"
          >
            Manage →
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          The source of truth the AI uses to answer family questions. Add or edit entries to change
          what the assistant can answer on its own.
        </p>
      </section>
    </AdminShell>
  );
}
