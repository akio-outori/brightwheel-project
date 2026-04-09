// Closed-loop end-to-end tests. The highest-value, highest-cost
// tests in the suite. Each test runs the full ask → escalate →
// fix → re-ask → cite cycle against the real trust-loop pipeline
// and a real model.
//
// These tests WRITE to the handbook bucket and the events bucket.
// They use a uuid-prefixed question phrasing that won't collide
// with any seed entry, and they clean up by resolving the event
// they create. The handbook entry itself is left behind — we
// can't delete handbook entries without breaking the audit trail
// and the MinIO versioning story.
//
// Requires the dev stack to be running on localhost:3000 because
// Test 2 uses the HTTP route directly (to exercise the atomic
// resolve-with-entry endpoint), not askLLM in-process.

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  listOpenNeedsAttention,
  resolveNeedsAttention,
  type HandbookEntry,
} from "../storage";
import {
  __resetHandbookCache,
  askViaRoute,
  expectEscalation,
  expectHighConfidence,
  hasApiKey,
  setupIntegrationTest,
} from "./_helpers";

// The unique suffix makes each test's question unique so test
// runs don't collide with each other or with the seed handbook.
function uniq(base: string): { question: string; tag: string } {
  const tag = randomUUID().slice(0, 8);
  return {
    question: `${base} (test tag ${tag})`,
    tag,
  };
}

// Helper: find the most recent open event whose question text
// contains a given tag.
async function findEventByTag(tag: string) {
  const open = await listOpenNeedsAttention();
  return open.find((e) => e.question.includes(tag));
}

describe.skipIf(!hasApiKey())("closed-loop — full ask-fix-reask cycle", () => {
  setupIntegrationTest();

  it("closes the loop via askViaAdapter + resolveNeedsAttention", async () => {
    const { question, tag } = uniq(
      "What's the official policy on pet snails in the classroom?",
    );

    // 1. Ask the unknown question — expect escalation.
    const initial = await askViaRoute(question);
    await expectEscalation(initial, "initial-ask");

    // 2. Find the event in the open feed.
    const event = await findEventByTag(tag);
    expect(event, `event should be in open feed for tag ${tag}`).toBeDefined();

    // 3. Answer it by creating a handbook entry and resolving the
    // event. We go through the storage adapter directly (not the
    // HTTP endpoint) to test the bypass path — operators who edit
    // via a future CLI or a backfill script would hit this code.
    const entry: Partial<HandbookEntry> = {
      title: `Classroom pet snails ${tag}`,
      category: "policies",
      body: `Snails are welcome as classroom pets in Preschool and Pre-K rooms. Teachers must ensure the tank is cleaned weekly. Tag: ${tag}`,
      sourcePages: [],
    };

    const createRes = await fetch("http://localhost:3000/api/handbook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry),
    });
    expect(createRes.ok, "handbook POST should succeed").toBe(true);
    const created = (await createRes.json()) as { id: string };

    await resolveNeedsAttention(event!.id, created.id);

    // The adapter's in-process handbook cache in _helpers.ts is
    // stale after the create, so force a re-read before re-asking.
    __resetHandbookCache();

    // 4. Re-ask the same question — expect high confidence,
    // citing the new entry.
    const reasked = await askViaRoute(question);
    await expectHighConfidence(reasked, "reask");
    expect(
      reasked.cited_entries,
      "reask should cite the new entry",
    ).toContain(created.id);
  });

  it("closes the loop via POST /api/needs-attention/[id]/resolve-with-entry", async () => {
    const { question, tag } = uniq(
      "Do you have a policy on decorating a child's cubby?",
    );

    // 1. Ask unknown → escalate
    const initial = await askViaRoute(question);
    await expectEscalation(initial, "initial-ask");

    // 2. Find the event
    const event = await findEventByTag(tag);
    expect(event).toBeDefined();

    // 3. Use the ATOMIC endpoint — same code path as the FixDialog
    const fixRes = await fetch(
      `http://localhost:3000/api/needs-attention/${event!.id}/resolve-with-entry`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `Cubby decoration policy ${tag}`,
          category: "policies",
          body: `Children are welcome to decorate their cubbies with family photos, drawings, and small personal items. Please no food items or sharp objects. Tag: ${tag}`,
          sourcePages: [],
        }),
      },
    );
    expect(fixRes.ok, "resolve-with-entry POST should succeed").toBe(true);
    const fix = (await fixRes.json()) as {
      entry: { id: string };
      event: { resolvedAt: string };
    };
    expect(fix.entry.id).toBeTruthy();
    expect(fix.event.resolvedAt).toBeTruthy();

    __resetHandbookCache();

    // 4. Re-ask → high confidence citing the new entry
    const reasked = await askViaRoute(question);
    await expectHighConfidence(reasked, "reask");
    expect(reasked.cited_entries).toContain(fix.entry.id);
  });

  it("sensitive-topic override holds even after the handbook would answer", async () => {
    // A fever question will escalate via the route-layer
    // sensitive-topic override EVEN after we add a handbook entry
    // that explicitly addresses it. This catches the class of bug
    // where a "helpful" handbook fix would accidentally bypass
    // the sensitive-topic guard.
    const { question, tag } = uniq("My child has a fever of 101");

    // Add a handbook entry that (if the sensitive guard failed)
    // would let the model answer confidently.
    const feverEntryTitle = `Fever guidance ${tag}`;
    const createRes = await fetch("http://localhost:3000/api/handbook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: feverEntryTitle,
        category: "health",
        body: `For fevers of 101 or higher, keep the child home until fever-free for 24 hours without medication. Tag: ${tag}`,
        sourcePages: [],
      }),
    });
    expect(createRes.ok).toBe(true);
    __resetHandbookCache();

    // The ROUTE (not askViaAdapter) applies the sensitive-topic
    // override, so this test goes through the HTTP endpoint.
    const result = await askViaRoute(question);

    // The invariant: even with a direct handbook answer, the
    // sensitive override forces escalate=true.
    expect(result.escalate, "sensitive override must force escalate").toBe(
      true,
    );
    expect(result.confidence).toBe("low");
  });
});
