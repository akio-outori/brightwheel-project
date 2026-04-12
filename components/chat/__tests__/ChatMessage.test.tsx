// @vitest-environment jsdom
//
// Regression tests for the ChatMessage metadata cluster (T1).
// Verifies that "Verified policy" only shows when cited entries exist.

import { createElement } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ChatMessage, { type ChatMessageData } from "../ChatMessage";

const renderMsg = (msg: ChatMessageData) => render(createElement(ChatMessage, { message: msg }));

describe("ChatMessage metadata cluster", () => {
  afterEach(() => cleanup());
  it("shows 'Verified policy' when citedEntries are present", () => {
    renderMsg({
      role: "assistant",
      text: "We open at 7am.",
      type: "answer",
      citedEntries: [{ id: "hours", title: "Hours of Operation", body: "7am to 6pm" }],
    });
    expect(screen.getByText("Verified policy")).toBeTruthy();
  });

  it("does not show 'Verified policy' when citedEntries is empty", () => {
    renderMsg({
      role: "assistant",
      text: "We open at 7am.",
      type: "answer",
      citedEntries: [],
    });
    expect(screen.queryByText("Verified policy")).toBeNull();
  });

  it("does not show 'Verified policy' when citedEntries is undefined", () => {
    renderMsg({
      role: "assistant",
      text: "We open at 7am.",
      type: "answer",
    });
    expect(screen.queryByText("Verified policy")).toBeNull();
  });
});
