// @vitest-environment jsdom
//
// Smoke test for the staff profile page. Ensures the component
// mounts against the shared CURRENT_STAFF constant and renders
// each section of the profile: hero (name/role), bio, contact,
// tenure, credentials, languages. This is a guard against
// breaking the shared-data import path or the route wiring —
// not a full visual regression suite.

import { createElement } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import StaffProfile from "../StaffProfile";
import { CURRENT_STAFF } from "@/data/staffUser";

// JSX-free render so this file compiles without the React plugin
// needing to be reconfigured per test.
const renderProfile = () => render(createElement(StaffProfile));

describe("StaffProfile", () => {
  // @testing-library/react's auto-cleanup only runs when Vitest is
  // in globals mode; our config isn't, so clean up manually between
  // tests so the DOM doesn't accumulate copies of the same content.
  afterEach(() => cleanup());

  it("renders the current staff user's name and role", () => {
    renderProfile();
    // The name is in its own <h2>, easy to query.
    expect(screen.getByRole("heading", { name: CURRENT_STAFF.name })).toBeTruthy();
    // The role is interleaved with a pronouns span in the same
    // <p>, so assert against the document's combined text
    // content rather than trying to pick the exact node.
    expect(document.body.textContent).toContain(CURRENT_STAFF.role);
    expect(document.body.textContent).toContain(CURRENT_STAFF.pronouns);
  });

  it("renders contact info as clickable mailto and tel links", () => {
    renderProfile();
    const mail = screen.getByRole("link", { name: CURRENT_STAFF.email });
    expect(mail.getAttribute("href")).toBe(`mailto:${CURRENT_STAFF.email}`);
    const phoneDigits = CURRENT_STAFF.phone.replace(/\D/g, "");
    const tel = screen.getByRole("link", { name: CURRENT_STAFF.phone });
    expect(tel.getAttribute("href")).toBe(`tel:${phoneDigits}`);
  });

  it("renders every credential from the shared data", () => {
    renderProfile();
    for (const credential of CURRENT_STAFF.credentials) {
      expect(screen.getByText(credential)).toBeTruthy();
    }
  });

  it("renders every language as a pill", () => {
    renderProfile();
    for (const lang of CURRENT_STAFF.languages) {
      expect(screen.getByText(lang)).toBeTruthy();
    }
  });

  it("has a back-to-dashboard link", () => {
    renderProfile();
    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link.getAttribute("href")).toBe("/admin");
  });
});
