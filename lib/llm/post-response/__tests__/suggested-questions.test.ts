// Positive-path regression tests for the questions the parent chat
// ships with as suggested prompts. The goal is to guarantee that
// the questions we explicitly invite parents to ask NEVER get held
// by an overeager classifier — either the preflight specific-child
// classifier or any of the post-response pipeline channels.
//
// Why this file exists:
//   Classifier changes can silently break the demo path. The
//   Veterans Day regression (entities channel held a perfectly
//   grounded answer because "Veterans Day" appeared in the question
//   but not in the source document) was what motivated creating
//   this suite. Each case here encodes "for this question, a
//   plausible grounded answer should pass the full pipeline".
//
// Shape of each case:
//   - question: the parent's suggested question, lifted verbatim
//     from data/aiResponses.ts so this test breaks loudly if a
//     suggested question ever stops passing
//   - draft: a hand-written plausible model answer that is grounded
//     in the seed handbook. Not an exact LLM output — the goal is
//     to encode the class of answer the classifier should accept.
//     Every numeric literal and proper name in `draft.answer` must
//     be findable either in the cited source bodies or in the
//     question text itself.
//   - cited: the entry ids the draft references
//
// These tests do not call the real LLM. They exercise only the
// deterministic post-response pipeline and the preflight classifier,
// so they run in CI without an API key.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SUGGESTED_QUESTIONS, FOLLOWUP_SUGGESTIONS } from "@/data/aiResponses";
import type { AnswerContract } from "../../contract";
import { classifySpecificChild } from "../../preflight";
import { runPostResponsePipeline } from "../pipeline";
import type { GroundingSource } from "../types";

// ---------------------------------------------------------------------------
// Load the real seed handbook from disk
// ---------------------------------------------------------------------------

// Using the real seed file (not hand-written fixtures) is deliberate:
// the point of this test suite is to catch mismatches between the
// demo's suggested questions, the seed content parents see, and the
// classifiers that gate the output. A hand-written fixture would let
// the seed and the tests drift apart silently.

const SeedFileSchema = z.object({
  document: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    version: z.string().min(1),
    source: z.string().min(1),
  }),
  entries: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
    }),
  ),
});

function loadSeedHandbook(): GroundingSource[] {
  const seedPath = path.join(process.cwd(), "data/seed-handbook.json");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is a hardcoded project-relative constant
  const raw = readFileSync(seedPath, "utf-8");
  const parsed = SeedFileSchema.parse(JSON.parse(raw));
  return parsed.entries.map((e) => ({ id: e.id, title: e.title, body: e.body }));
}

const ALL_SOURCES = loadSeedHandbook();

function draft(partial: Partial<AnswerContract>): AnswerContract {
  return {
    answer: "placeholder",
    confidence: "high",
    cited_entries: [],
    directly_addressed_by: [],
    escalate: false,
    escalation_reason: undefined,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Suggested-question fixtures
// ---------------------------------------------------------------------------

// Each entry maps a question the user is invited to ask to a
// plausible grounded answer. The fixture proves that IF the model
// produces a reasonable answer for this question, the pipeline
// doesn't hold it. It does NOT prove the model will actually
// produce that answer — that's what the integration suite covers
// when run with a real API key.

interface SuggestedCase {
  readonly question: string;
  readonly answer: string;
  readonly cited: ReadonlyArray<string>;
}

const SUGGESTED_CASES: ReadonlyArray<SuggestedCase> = [
  // ---- from SUGGESTED_QUESTIONS ----
  {
    question: "Are you open on Veterans Day?",
    // Closure list is exhaustive — Veterans Day isn't on it, so
    // absence is the answer. "Veterans Day" appears in the question,
    // not the source, which is why this case specifically exercises
    // the "question text is part of the grounding corpus" fix in
    // the entities channel.
    answer:
      "Yes, we're open on Veterans Day. Sunflower is closed on New Year's Day, Martin Luther King Jr. Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving (Thursday and Friday), and one week between Christmas and New Year's, plus four staff development days — Veterans Day isn't on that list.",
    cited: ["closures"],
  },
  {
    question: "What immunizations does my child need?",
    answer:
      "Texas requires an up-to-date immunization record on file for every child enrolled at Sunflower. You can bring a copy signed by your pediatrician at enrollment. Families who decline immunization for medical or conscientious reasons can provide a current Texas DSHS affidavit of exemption instead.",
    cited: ["immunizations"],
  },
  {
    question: "Do you provide meals?",
    answer:
      "Yes, Sunflower serves breakfast, lunch, and afternoon snack every day, prepared in-house by our kitchen team. Menus run on a 4-week rotation and are posted in the family app each Sunday. All meals are nut-free.",
    cited: ["meals"],
  },
  {
    question: "What are the late pickup fees?",
    answer:
      "Sunflower closes at 6:00 pm. If you arrive after 6:00 pm, a late pickup fee of $1 per minute is added to your next monthly bill. We understand emergencies happen — please call us at (512) 555-0142 as soon as you know you'll be late.",
    cited: ["late-fees"],
  },
  {
    question: "How do I enroll my child?",
    answer:
      "Enrolling at Sunflower is a four-step process. First, schedule a tour by calling (512) 555-0142. Second, if we have a spot in your child's age group, we'll send an enrollment packet. Third, you'll meet with Director Maya for a 30-minute family intake. Fourth, you'll pay the registration fee and schedule a phased start.",
    cited: ["enrollment-process"],
  },
  {
    question: "What's the phone number for the main office?",
    answer:
      "Sunflower's main office phone number is (512) 555-0142. Our office is staffed Monday through Friday from 7:00 am to 6:00 pm.",
    cited: ["contact"],
  },

  // ---- from FOLLOWUP_SUGGESTIONS ----
  {
    question: "What are your hours?",
    answer:
      "Sunflower is open Monday through Friday from 7:00 am to 6:00 pm. We ask families to aim for drop-off by 9:30 am so children can settle into the morning routine with their friends. We're closed on weekends.",
    cited: ["hours"],
  },
  {
    question: "How much is tuition?",
    answer:
      "Tuition at Sunflower is billed monthly. Infant: $1,680 per month. Toddler: $1,560 per month. Twos: $1,470 per month. Preschool: $1,380 per month. Families with more than one child enrolled receive a 10% sibling discount on the younger child's monthly tuition.",
    cited: ["tuition"],
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("suggested questions — positive-path regression", () => {
  // Sanity-check that every suggested/followup question from the
  // UI is covered by at least one fixture. If a new suggested
  // question is added without a matching fixture, this test fails
  // and the developer is nudged to write one.
  it("covers every suggested and followup question from the UI", () => {
    const uiQuestions = new Set<string>([...SUGGESTED_QUESTIONS, ...FOLLOWUP_SUGGESTIONS]);
    const covered = new Set(SUGGESTED_CASES.map((c) => c.question));
    const uncovered = [...uiQuestions].filter((q) => !covered.has(q));
    expect(
      uncovered,
      "every question in SUGGESTED_QUESTIONS / FOLLOWUP_SUGGESTIONS needs a fixture in this file",
    ).toEqual([]);
  });

  describe("preflight classifier — none of these should be held", () => {
    for (const c of SUGGESTED_CASES) {
      it(`passes preflight: ${c.question}`, () => {
        const result = classifySpecificChild(c.question);
        expect(result.verdict, `preflight unexpectedly held: ${JSON.stringify(result)}`).toBe(
          "pass",
        );
      });
    }
  });

  describe("post-response pipeline — plausible grounded answers should pass", () => {
    for (const c of SUGGESTED_CASES) {
      it(`passes pipeline: ${c.question}`, () => {
        const result = runPostResponsePipeline({
          question: c.question,
          draft: draft({
            answer: c.answer,
            cited_entries: [...c.cited],
            directly_addressed_by: [...c.cited],
          }),
          allSources: ALL_SOURCES,
        });
        expect(result.verdict, `pipeline unexpectedly held: ${JSON.stringify(result)}`).toBe(
          "pass",
        );
      });
    }
  });

  it("every cited entry id in the fixtures exists in the real seed", () => {
    const seedIds = new Set(ALL_SOURCES.map((s) => s.id));
    const unknown: Array<{ question: string; id: string }> = [];
    for (const c of SUGGESTED_CASES) {
      for (const id of c.cited) {
        if (!seedIds.has(id)) unknown.push({ question: c.question, id });
      }
    }
    expect(unknown, "fixture cites an entry id that isn't in the seed handbook").toEqual([]);
  });
});
