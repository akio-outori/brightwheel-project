// Closed-loop end-to-end tests. The highest-value, highest-cost
// tests in the suite. Each test runs the full ask → escalate →
// fix → re-ask → cite cycle against the real trust-loop pipeline
// and a real model.
//
// These tests WRITE operator overrides to the active document and
// write (then resolve) needs-attention events. Every test uses the
// `[test] …` title prefix recognized by _helpers.cleanupTestOverrides;
// the suite's afterAll sweep deletes the overrides at the end, so
// cross-run pollution cannot happen the way it did with the old
// mutable-handbook design.
//
// Requires the dev stack to be running on localhost:3000 because
// these tests hit /api/ask and /api/needs-attention/[id]/resolve-with-entry.

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { listOpenNeedsAttention } from "../storage";
import {
  TEST_TAG_PREFIX,
  __resetHandbookCache,
  askViaRoute,
  expectEscalation,
  expectHighConfidence,
  hasApiKey,
  setupIntegrationTest,
} from "./_helpers";

// The unique suffix makes each test's question unique so test
// runs don't collide with each other or with the seed handbook.
// The title includes the suite-wide TEST_TAG_PREFIX so the suite's
// afterAll sweep will delete any override this test created.
function uniq(base: string): {
  question: string;
  tag: string;
  overrideTitle: (topic: string) => string;
} {
  const tag = randomUUID().slice(0, 8);
  return {
    question: `${base} (test tag ${tag})`,
    tag,
    overrideTitle: (topic) => `${TEST_TAG_PREFIX} ${topic} ${tag}`,
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

  it("closes the loop via the overrides API + resolveNeedsAttention", async () => {
    const { question, tag, overrideTitle } = uniq(
      "What's the official policy on classroom xylophones for the test suite?",
    );

    // 1. Ask the unknown question — expect escalation.
    const initial = await askViaRoute(question);
    await expectEscalation(initial, "initial-ask");

    // 2. Find the event in the open feed.
    const event = await findEventByTag(tag);
    expect(event, `event should be in open feed for tag ${tag}`).toBeDefined();

    // 3. Answer it by creating an operator override via the
    // /api/overrides endpoint, then resolving the event through the
    // dedicated resolve endpoint. This exercises the two-call path —
    // the atomic resolve-with-entry endpoint is tested in the next
    // case.
    const createRes = await fetch("http://localhost:3000/api/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: overrideTitle("Classroom xylophones"),
        category: "policies",
        body: `Classroom xylophones are welcome for music time. Tag: ${tag}`,
        sourcePages: [],
        replacesEntryId: null,
        createdBy: null,
      }),
    });
    expect(createRes.ok, "overrides POST should succeed").toBe(true);
    const created = (await createRes.json()) as { id: string };

    const resolveRes = await fetch(
      `http://localhost:3000/api/needs-attention/${event!.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolvedByOverrideId: created.id }),
      },
    );
    expect(resolveRes.ok, "resolve POST should succeed").toBe(true);

    // The adapter's in-process document cache is stale after the
    // create, so force a re-read before re-asking.
    __resetHandbookCache();

    // 4. Re-ask the same question — expect high confidence, citing
    // the new override id.
    const reasked = await askViaRoute(question);
    await expectHighConfidence(reasked, "reask");
    expect(
      reasked.cited_entries,
      "reask should cite the new override",
    ).toContain(created.id);
  });

  it("closes the loop via POST /api/needs-attention/[id]/resolve-with-entry", async () => {
    const { question, tag, overrideTitle } = uniq(
      "Do you have a policy on decorating a child's water bottle for the test suite?",
    );

    // 1. Ask unknown → escalate
    const initial = await askViaRoute(question);
    await expectEscalation(initial, "initial-ask");

    // 2. Find the event
    const event = await findEventByTag(tag);
    expect(event).toBeDefined();

    // 3. Use the ATOMIC endpoint — same code path as the FixDialog.
    // The endpoint now creates an operator override (not a handbook
    // entry) and resolves the event in one server-side transaction.
    const fixRes = await fetch(
      `http://localhost:3000/api/needs-attention/${event!.id}/resolve-with-entry`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: overrideTitle("Water bottle decoration"),
          category: "policies",
          body: `Children are welcome to decorate their water bottles with stickers. Tag: ${tag}`,
          sourcePages: [],
          replacesEntryId: null,
        }),
      },
    );
    expect(fixRes.ok, "resolve-with-entry POST should succeed").toBe(true);
    const fix = (await fixRes.json()) as {
      override: { id: string };
      event: { resolvedAt: string };
    };
    expect(fix.override.id).toBeTruthy();
    expect(fix.event.resolvedAt).toBeTruthy();

    __resetHandbookCache();

    // 4. Re-ask → high confidence citing the new override
    const reasked = await askViaRoute(question);
    await expectHighConfidence(reasked, "reask");
    expect(reasked.cited_entries).toContain(fix.override.id);
  });

  it("sensitive-topic override holds even after the override would answer", async () => {
    // A fever question must escalate via the route-layer
    // sensitive-topic override EVEN after we add an operator
    // override that explicitly addresses it. This catches the class
    // of bug where a "helpful" fix would accidentally bypass the
    // sensitive-topic guard.
    const { question, tag, overrideTitle } = uniq(
      "My child has a fever of 101 (test suite question)",
    );

    // Add an override that (if the sensitive guard failed) would
    // let the model answer confidently.
    const createRes = await fetch("http://localhost:3000/api/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: overrideTitle("Fever guidance"),
        category: "health",
        body: `For fevers of 101 or higher, keep the child home until fever-free for 24 hours without medication. Tag: ${tag}`,
        sourcePages: [],
        replacesEntryId: null,
        createdBy: null,
      }),
    });
    expect(createRes.ok).toBe(true);
    __resetHandbookCache();

    // The ROUTE (not askViaAdapter) applies the sensitive-topic
    // override, so this test goes through the HTTP endpoint.
    const result = await askViaRoute(question);

    // The invariant: even with a direct override answer, the
    // sensitive override forces escalate=true.
    expect(result.escalate, "sensitive override must force escalate").toBe(
      true,
    );
    expect(result.confidence).toBe("low");
  });
});
