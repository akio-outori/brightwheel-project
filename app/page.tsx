// Parent landing + chat surface. Server component — fetches the
// handbook index once on first load so citation pills can resolve
// entry ids to titles without an extra client-side round trip.
//
// The chat itself is a client component (ParentChat) because it
// owns conversation history and the pending state.

import { ParentChat } from "@/components/parent/ParentChat";
import { listHandbookEntries } from "@/lib/storage";

// The handbook is fetched from MinIO on every request. Disable static
// generation — we don't want the index frozen into the build artifact,
// and MinIO isn't reachable during `next build` anyway.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const handbookEntries = await listHandbookEntries();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Albuquerque DCFD Family Front Desk
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Ask a question about the program. Answers are grounded in the
          official family handbook. When I&rsquo;m not sure, I pass the
          question to a staff member.
        </p>
      </header>

      <ParentChat handbookEntries={handbookEntries} />
    </main>
  );
}
