import Link from "next/link";
import { AdminShell } from "@/components/operator/AdminShell";
import { HandbookList } from "@/components/operator/HandbookList";

export const dynamic = "force-dynamic";

export default function HandbookListPage() {
  return (
    <AdminShell active="handbook">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Family handbook
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Click any entry to view or edit it.
          </p>
        </div>
        <Link
          href="/admin/handbook/new"
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          + New entry
        </Link>
      </div>
      <HandbookList />
    </AdminShell>
  );
}
