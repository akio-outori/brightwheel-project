"use client";

// Read-only staff profile page. This is a static display surface —
// no editing, no mutation — that renders whatever the shared
// `CURRENT_STAFF` constant says. When a real auth layer lands,
// the data source behind `staffUser.ts` becomes a session read
// and this component doesn't need to change.

import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Award, Globe, Calendar, Sun } from "lucide-react";
import { format } from "date-fns";
import { CENTER } from "@/data/centerData";
import { CURRENT_STAFF } from "@/data/staffUser";

export default function StaffProfile() {
  const joinedYear = new Date(CURRENT_STAFF.joinedAt).getUTCFullYear();
  const tenureYears = new Date().getUTCFullYear() - joinedYear;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav — mirror the operator dashboard styling but keep
          it simpler (no filters, no bell, no settings dropdown).
          The decorative circle is wrapped in its own clipping
          container for the same reason the dashboard does it. */}
      <div className="bg-[#5B4FCF] px-5 pt-10 pb-10 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-24 translate-x-24" />
        </div>
        <div className="relative max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <Sun className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white/70 text-[10px] font-medium tracking-wide uppercase">
                  brightdesk
                </p>
                <h1 className="text-white font-bold text-sm">{CENTER.name}</h1>
              </div>
            </div>
            <Link
              href="/admin"
              className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white border border-white/20 rounded-xl px-3 py-2 bg-white/10 hover:bg-white/20 transition-all"
            >
              <ArrowLeft className="w-3 h-3" /> Back to dashboard
            </Link>
          </div>

          {/* Hero — avatar + name + role */}
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-white text-[#5B4FCF] text-2xl font-bold flex items-center justify-center shadow-lg ring-4 ring-white/20">
              {CURRENT_STAFF.initials}
            </div>
            <div className="text-white min-w-0 flex-1">
              <p className="text-white/60 text-[11px] font-medium tracking-wide uppercase">
                Staff profile
              </p>
              <h2 className="text-2xl font-bold leading-tight mt-0.5">{CURRENT_STAFF.name}</h2>
              <p className="text-white/80 text-sm mt-0.5">
                {CURRENT_STAFF.role}
                <span className="text-white/50"> · </span>
                <span className="text-white/70">{CURRENT_STAFF.pronouns}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content — cards grid */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* About */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            About
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed">{CURRENT_STAFF.bio}</p>
        </section>

        {/* Contact */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Contact
          </h3>
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-start gap-2.5">
              <Mail className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <dt className="sr-only">Email</dt>
                <dd>
                  <a
                    href={`mailto:${CURRENT_STAFF.email}`}
                    className="text-[#5B4FCF] hover:underline break-all"
                  >
                    {CURRENT_STAFF.email}
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Phone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <dt className="sr-only">Phone</dt>
                <dd>
                  <a
                    href={`tel:${CURRENT_STAFF.phone.replace(/\D/g, "")}`}
                    className="text-[#5B4FCF] hover:underline"
                  >
                    {CURRENT_STAFF.phone}
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <dt className="sr-only">Location</dt>
                <dd className="text-gray-700">
                  <p className="font-medium">{CURRENT_STAFF.location.center}</p>
                  <p className="text-xs text-gray-500">{CURRENT_STAFF.location.address}</p>
                </dd>
              </div>
            </div>
          </dl>
        </section>

        {/* Tenure */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Tenure
          </h3>
          <div className="flex items-center gap-2.5 text-sm text-gray-700">
            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <p>
              Joined{" "}
              <span className="font-medium">
                {format(new Date(CURRENT_STAFF.joinedAt), "MMMM yyyy")}
              </span>
              <span className="text-gray-400">
                {" "}
                · {tenureYears} year{tenureYears === 1 ? "" : "s"} with Sunflower
              </span>
            </p>
          </div>
        </section>

        {/* Credentials */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" /> Credentials
          </h3>
          <ul className="space-y-2 text-sm text-gray-700">
            {CURRENT_STAFF.credentials.map((c) => (
              <li key={c} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#5B4FCF] mt-1.5 flex-shrink-0" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Languages */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Languages
          </h3>
          <div className="flex flex-wrap gap-2">
            {CURRENT_STAFF.languages.map((lang) => (
              <span
                key={lang}
                className="inline-flex items-center px-3 py-1 rounded-full bg-violet-50 text-[#5B4FCF] text-xs font-medium ring-1 ring-inset ring-violet-200"
              >
                {lang}
              </span>
            ))}
          </div>
        </section>

        {/* Footer note — the affordance story is "read-only, no
            auth yet". Being upfront about it is a better demo
            experience than fake "Edit profile" buttons that go
            nowhere. */}
        <p className="text-[11px] text-gray-400 text-center pt-2">
          Profile data is read-only in this preview. A real deployment would wire editing through
          the session layer.
        </p>
      </div>
    </div>
  );
}
