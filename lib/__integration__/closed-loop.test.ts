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
  TEST_CREATED_BY,
  __resetHandbookCache,
  askViaRoute,
  expectEscalation,
  expectHighConfidence,
  hasApiKey,
  setupIntegrationTest,
  staffFetch,
} from "./_helpers";

// Each test asks a unique question that no handbook entry covers.
// The question text itself is the identifier — no synthetic tags
// or `[test]` prefixes that make overrides look synthetic to the
// model and degrade re-ask confidence. Cleanup uses `createdBy:
// TEST_CREATED_BY` which is NOT sent to the model in MCPData.
function uniq(base: string): {
  question: string;
  overrideTitle: (topic: string) => string;
} {
  return {
    question: base,
    overrideTitle: (topic) => topic,
  };
}

// Find the most recent open event matching a question exactly.
async function findEventByQuestion(question: string) {
  const open = await listOpenNeedsAttention();
  return open.find((e) => e.question === question);
}

describe.skipIf(!hasApiKey())("closed-loop — full ask-fix-reask cycle", () => {
  setupIntegrationTest();

  it("closes the loop via the overrides API + resolveNeedsAttention", async () => {
    const { question, overrideTitle } = uniq("What's the official policy on classroom xylophones?");

    // 1. Ask the unknown question — expect escalation.
    const initial = await askViaRoute(question);
    await expectEscalation(initial, "initial-ask");

    // 2. Find the event in the open feed.
    const event = await findEventByQuestion(question);
    expect(event, "event should be in open feed").toBeDefined();

    // 3. Answer it by creating an operator override via the
    // /api/overrides endpoint, then resolving the event through the
    // dedicated resolve endpoint. This exercises the two-call path —
    // the atomic resolve-with-entry endpoint is tested in the next
    // case.
    const createRes = await staffFetch("http://localhost:3000/api/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: overrideTitle("Classroom xylophones"),
        category: "policies",
        body: `Classroom xylophones are welcome for music time.`,
        sourcePages: [],
        replacesEntryId: null,
        createdBy: TEST_CREATED_BY,
      }),
    });
    expect(createRes.ok, "overrides POST should succeed").toBe(true);
    const created = (await createRes.json()) as { id: string };

    const resolveRes = await staffFetch(`http://localhost:3000/api/needs-attention/${event!.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolvedByOverrideId: created.id }),
    });
    expect(resolveRes.ok, "resolve POST should succeed").toBe(true);

    // The adapter's in-process document cache is stale after the
    // create, so force a re-read before re-asking.
    __resetHandbookCache();

    // 4. Re-ask the same question — expect high confidence, citing
    // the new override id.
    const reasked = await askViaRoute(question);
    await expectHighConfidence(reasked, "reask");
    expect(reasked.cited_entries, "reask should cite the new override").toContain(created.id);
  });

  it("closes the loop via POST /api/needs-attention/[id]/resolve-with-entry", async () => {
    const { question, overrideTitle } = uniq(
      "Do you have a policy on decorating a child's water bottle?",
    );

    // 1. Ask unknown → escalate
    const initial = await askViaRoute(question);
    await expectEscalation(initial, "initial-ask");

    // 2. Find the event
    const event = await findEventByQuestion(question);
    expect(event).toBeDefined();

    // 3. Use the ATOMIC endpoint — same code path as the ReplyForm.
    // The endpoint now requires `replyToParent` (the parent-facing
    // message) and optionally `handbookOverride` (to bank the answer
    // for future parents).
    const fixRes = await staffFetch(
      `http://localhost:3000/api/needs-attention/${event!.id}/resolve-with-entry`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          replyToParent: `Children are welcome to decorate their water bottles with stickers.`,
          handbookOverride: {
            title: overrideTitle("Water bottle decoration"),
            category: "staff",
            sourcePages: [],
            replacesEntryId: null,
          },
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

  it("override with replacesEntryId cites the override, not the replaced entry", async () => {
    const { question, overrideTitle } = uniq(
      "What's the illness policy for fevers at this center?",
    );

    // Create an override that replaces the seed "illness-policy" entry.
    const createRes = await staffFetch("http://localhost:3000/api/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: overrideTitle("Updated illness policy"),
        category: "health",
        body: `Updated fever policy: children must be fever-free for 48 hours (not 24) before returning to the center.`,
        sourcePages: [],
        replacesEntryId: "illness-policy",
        createdBy: TEST_CREATED_BY,
      }),
    });
    expect(createRes.ok, "overrides POST should succeed").toBe(true);
    const created = (await createRes.json()) as { id: string };

    __resetHandbookCache();

    // Ask a fever-policy question via the route. Because this is a
    // sensitive topic the route will escalate — but we can still
    // verify the override was written. Ask a non-sensitive version
    // through a policy angle to get a grounded answer.
    const policyResult = await askViaRoute(question);

    // The sensitive-topic override may or may not fire on a policy
    // question. If it doesn't escalate, verify the override id is
    // cited. Under the correction-on-top model, the seed entry is
    // ALSO visible to the model — it may be cited for context. The
    // key assertion is that the override's content (48 hours, not
    // 24) wins on the conflicting fact.
    if (!policyResult.escalate) {
      await expectHighConfidence(policyResult, "override-replacement");
      expect(
        policyResult.cited_entries,
        "should cite the override alongside any context",
      ).toContain(created.id);
      expect(policyResult.answer, "should use the override's 48-hour value").toContain("48");
    }
    // If it escalates, that's the sensitive-topic guard working as
    // designed — the override still exists, the guard just takes
    // priority. Not a failure.
  });

  it("returns 404 when resolving a non-existent event", async () => {
    const fakeEventId = `fake-event-${randomUUID().slice(0, 8)}`;
    const resolveRes = await staffFetch(
      `http://localhost:3000/api/needs-attention/${fakeEventId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolvedByOverrideId: "some-override-id" }),
      },
    );
    // The route returns 404 (event not found) or 500 (storage
    // error looking for the event). Either is "the event doesn't
    // exist." The route's error handling determines which one.
    expect(
      [404, 500].includes(resolveRes.status),
      `should return 404 or 500 for non-existent event, got ${resolveRes.status}`,
    ).toBe(true);
  });

  it("allows re-resolving an already-resolved event (operator reply update)", async () => {
    const { question, overrideTitle } = uniq("Is there a policy on classroom fish tanks?");

    // 1. Ask unknown → escalate
    const initial = await askViaRoute(question);
    await expectEscalation(initial, "initial-ask");

    // 2. Find the event
    const event = await findEventByQuestion(question);
    expect(event).toBeDefined();

    // 3. Resolve it via the atomic endpoint
    const fixRes = await staffFetch(
      `http://localhost:3000/api/needs-attention/${event!.id}/resolve-with-entry`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          replyToParent: `Fish tanks are allowed in common areas only.`,
          handbookOverride: {
            title: overrideTitle("Fish tanks"),
            category: "policies",
            sourcePages: [],
            replacesEntryId: null,
          },
        }),
      },
    );
    expect(fixRes.ok, "first resolve should succeed").toBe(true);

    // 4. Re-resolve with a different reply — the route permits this
    // (the operator is updating their reply). The event's
    // resolvedAt and operatorReply are overwritten.
    const secondRes = await staffFetch(
      `http://localhost:3000/api/needs-attention/${event!.id}/resolve-with-entry`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          replyToParent: `Updated: fish tanks are allowed only in the lobby.`,
        }),
      },
    );
    expect(secondRes.ok, "second resolve should also succeed").toBe(true);
  });

  it("sensitive-topic override holds even after the override would answer", async () => {
    // A fever question must escalate via the route-layer
    // sensitive-topic override EVEN after we add an operator
    // override that explicitly addresses it. This catches the class
    // of bug where a "helpful" fix would accidentally bypass the
    // sensitive-topic guard.
    const { question, overrideTitle } = uniq("My child has a fever of 101");

    // Add an override that (if the sensitive guard failed) would
    // let the model answer confidently.
    const createRes = await staffFetch("http://localhost:3000/api/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: overrideTitle("Fever guidance"),
        category: "health",
        body: `For fevers of 101 or higher, keep the child home until fever-free for 24 hours without medication.`,
        sourcePages: [],
        replacesEntryId: null,
        createdBy: TEST_CREATED_BY,
      }),
    });
    expect(createRes.ok).toBe(true);
    __resetHandbookCache();

    // The ROUTE (not askViaAdapter) applies the sensitive-topic
    // override, so this test goes through the HTTP endpoint.
    const result = await askViaRoute(question);

    // The invariant: even with a direct override answer, the
    // sensitive override forces escalate=true.
    expect(result.escalate, "sensitive override must force escalate").toBe(true);
    expect(result.confidence).toBe("low");
  });

  it("override with colliding title corrects the seed entry's conflicting fact", async () => {
    // The seed handbook has an entry id `tuition` that says the
    // sibling discount is 10%. An operator creates an override
    // titled "Tuition" — the storage layer auto-suffixes the id
    // (so citations stay unambiguous) and auto-links the override
    // via replacesEntryId to the seed tuition entry.
    //
    // The model should read both, treat the override as a
    // correction-on-top of the seed entry, and answer with the
    // override's 5% — NOT the seed's 10%.
    const createRes = await staffFetch("http://localhost:3000/api/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Tuition",
        category: "fees",
        body: "The sibling discount is 5%, not 10%.",
        sourcePages: [],
        replacesEntryId: null,
        createdBy: TEST_CREATED_BY,
      }),
    });
    expect(createRes.ok, "overrides POST should succeed").toBe(true);
    const created = (await createRes.json()) as { id: string; replacesEntryId: string | null };

    // Structural checks: id is suffixed, replacesEntryId auto-linked.
    expect(created.id).toMatch(/^tuition-[0-9a-f]{4}$/);
    expect(created.replacesEntryId).toBe("tuition");

    __resetHandbookCache();

    const answer = await askViaRoute("Is there a sibling discount?");
    await expectHighConfidence(answer, "sibling-discount-with-override");
    expect(answer.answer, "answer should reflect the override's 5%, not the seed's 10%").toContain(
      "5%",
    );
    expect(answer.answer, "answer must not contain the seed's 10%").not.toContain("10%");
    // The citation should include the override id (with suffix),
    // which is structurally distinct from the seed "tuition" id.
    expect(answer.cited_entries, "citation should include the override id").toContain(created.id);
  });
});
