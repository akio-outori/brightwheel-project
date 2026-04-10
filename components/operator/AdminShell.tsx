// Shared admin chrome — the header, nav bar, and main content area
// every /admin page renders into. Server component; client components
// nest inside.

import Link from "next/link";
import type { ReactNode } from "react";
import { NotificationBell } from "./NotificationBell";

export function AdminShell({
  active,
  children,
}: {
  active: "home" | "needs-attention" | "handbook";
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              DCFD Front Desk — Staff Console
            </p>
            <h1 className="mt-0.5 text-lg font-semibold text-slate-900">Operator Console</h1>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <NotificationBell />
            <nav className="flex gap-1 text-sm">
              <NavLink href="/admin" active={active === "home"}>
                Home
              </NavLink>
              <NavLink href="/admin/needs-attention" active={active === "needs-attention"}>
                Needs attention
              </NavLink>
              <NavLink href="/admin/handbook" active={active === "handbook"}>
                Handbook
              </NavLink>
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white"
          : "rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100"
      }
    >
      {children}
    </Link>
  );
}
