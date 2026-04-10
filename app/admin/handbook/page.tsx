import { AdminShell } from "@/components/operator/AdminShell";
import { HandbookList } from "@/components/operator/HandbookList";

export const dynamic = "force-dynamic";

export default function HandbookListPage() {
  return (
    <AdminShell active="handbook">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Document</h2>
        <p className="mt-1 text-sm text-slate-600">
          The seeded handbook is read-only. Use operator overrides below to add clarifications or
          correct outdated policy.
        </p>
      </div>
      <HandbookList />
    </AdminShell>
  );
}
