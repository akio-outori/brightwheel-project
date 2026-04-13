// @vitest-environment jsdom
//
// Client-side test for the ParentChat polling flow. Verifies the
// full round-trip that makes operator replies visible in the
// parent's chat:
//
//   1. Parent sends a question
//   2. /api/ask responds with escalate:true + needs_attention_event_id
//   3. Client stashes the id in state (and in localStorage)
//   4. Polling effect calls /api/parent-replies
//   5. When the operator's reply lands, a "Reply from staff" bubble
//      is appended to the chat
//
// This is the regression guard for "when in the staff view if I
// respond to the parent, it doesn't show up in the parent view."
// The test mocks window.fetch so the deterministic flow runs
// entirely inside jsdom — no dev server, no MinIO, no LLM.

import { createElement } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ParentChat } from "../ParentChat";

// Render ParentChat via createElement instead of JSX — the file
// compiles through tsc regardless of the vitest JSX transform state.
const renderParentChat = () => render(createElement(ParentChat));

// jsdom-missing-bits shims. jsdom doesn't implement
// Element.scrollIntoView, and Node 23's native localStorage only
// works with a --localstorage-file flag, so we wire up a simple
// in-memory replacement before each test.
function installBrowserShims(): void {
  if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {
      /* no-op — jsdom doesn't implement scroll */
    };
  }

  const store = new Map<string, string>();
  const localStorageShim: Storage = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: localStorageShim,
    configurable: true,
    writable: true,
  });
}

type FetchMock = ReturnType<typeof vi.fn> &
  ((input: RequestInfo, init?: RequestInit) => Promise<Response>);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

const ESCALATED_ANSWER = {
  answer:
    "Thanks for asking — I want to make sure you get the right answer. A staff member is taking a look at your question and will get back to you.",
  confidence: "low" as const,
  cited_entries: [],
  directly_addressed_by: [],
  escalate: true,
  escalation_reason: "held_for_review:model_self_escalated",
  needs_attention_event_id: EVENT_ID,
};

const HANDBOOK_RESPONSE = {
  document: { entries: [], overrides: [] },
};

describe("ParentChat polling → staff reply surfaced", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    installBrowserShims();
    fetchMock = vi.fn() as FetchMock;
    // Cast through unknown so we're not fighting the DOM fetch type.
    (global as unknown as { fetch: FetchMock }).fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the staff reply when polling returns a resolved event", async () => {
    // The immediate poll that fires when the effect sees a new
    // pendingEventIds returns the resolved event directly. We don't
    // test the interval pathway here — the polling effect's
    // immediate first call is the critical moment for demo UX and
    // is what we need to guard against regressing.
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/handbook")) {
        return jsonResponse(HANDBOOK_RESPONSE);
      }
      if (url.includes("/api/ask")) {
        return jsonResponse(ESCALATED_ANSWER);
      }
      if (url.includes("/api/parent-replies")) {
        return jsonResponse({
          replies: [
            {
              id: EVENT_ID,
              question: "Do you have a pet policy?",
              reply:
                "We don't have classroom pets today — happy to chat if you have a specific question.",
              resolvedAt: "2026-04-11T18:00:00.000Z",
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderParentChat();

    // Greeting is visible (disambiguated from the header brand
    // line and the "BrightDesk" subtitle).
    expect(screen.getByText(/What's on your mind/i)).toBeTruthy();

    // Fill in the textarea via the native React value setter so the
    // controlled-input onChange handler picks up the new value.
    const textarea = screen.getByPlaceholderText(/Ask a question/i) as HTMLTextAreaElement;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      nativeInputValueSetter.call(textarea, "Do you have a pet policy?");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Click send. The input container has a flex row with the
    // textarea on the left and the send button on the right.
    const sendButton = textarea
      .closest("div")!
      .parentElement!.querySelector('button[class*="bg-[#5B4FCF]"]') as HTMLButtonElement;
    await act(async () => {
      sendButton.click();
    });

    // The full round trip should produce a "Reply from staff"
    // bubble: /api/ask resolves with the event id, the polling
    // effect fires its immediate poll, and the poll response
    // carries the resolved reply.
    await waitFor(
      () => {
        expect(screen.getByText(/Reply from staff/i)).toBeTruthy();
      },
      { timeout: 3000 },
    );
    expect(screen.getByText(/classroom pets today/i)).toBeTruthy();
  });

  it("persists pending event ids across remount", () => {
    // Seed localStorage as if a previous session escalated something
    window.localStorage.setItem("brightdesk:pending-event-ids", JSON.stringify([EVENT_ID]));

    // First fetch is /api/handbook, second is the immediate poll
    // that fires once the effect sees the restored pendingEventIds.
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/handbook")) return jsonResponse(HANDBOOK_RESPONSE);
      if (url.includes("/api/parent-replies")) {
        // Assert the URL contains the restored event id
        expect(url).toContain(EVENT_ID);
        return jsonResponse({ replies: [] });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderParentChat();

    // At least the polling endpoint should be called on mount because
    // localStorage had a pending id.
    expect(
      fetchMock.mock.calls.some(
        ([url]) => typeof url === "string" && url.includes("/api/parent-replies"),
      ),
    ).toBe(true);
  });

  it("restores the prior chat history from localStorage on mount", () => {
    // Seed a three-message conversation as if the parent had been
    // chatting earlier. This is the bug the persistence fix solves:
    // without it, flipping to the staff view and back loses the
    // entire history.
    //
    // The question and the answer use phrases deliberately chosen
    // to not overlap with either SUGGESTED_QUESTIONS or
    // FOLLOWUP_SUGGESTIONS, so `getByText` can assert that they
    // render exactly once (i.e. only as a chat bubble, not as a
    // suggestion pill).
    const priorMessages = [
      { role: "assistant", text: "Hi — I'm the front desk.", type: "answer" },
      { role: "user", text: "Do you pick up from Maple Elementary?", initials: "P" },
      {
        role: "assistant",
        text: "We don't have a school pickup service at this time.",
        type: "answer",
      },
    ];
    window.localStorage.setItem("brightdesk:messages", JSON.stringify(priorMessages));

    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/handbook")) return jsonResponse(HANDBOOK_RESPONSE);
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderParentChat();

    // Both turns of the restored conversation should render as
    // chat bubbles. `getByText` fails if either is missing or if
    // the string appears more than once — catching the regression
    // where the suggestion panel flashes on top of a restored
    // history.
    expect(screen.getByText(/Do you pick up from Maple Elementary/)).toBeTruthy();
    expect(screen.getByText(/school pickup service at this time/)).toBeTruthy();
  });
});
