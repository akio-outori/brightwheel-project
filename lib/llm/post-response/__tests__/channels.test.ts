// Unit tests for every post-response channel. Each channel has a
// tight set of positive (pass) and negative (hold) fixtures so a
// regression in one channel's tuning doesn't silently bleed into
// the integration suite.
//
// These tests are pure logic — no MinIO, no Anthropic, no Next.js
// runtime. They run as part of `npm test`.

import { describe, expect, it } from "vitest";
import type { AnswerContract } from "../../contract";
import type { ChannelInput, GroundingSource } from "../types";
import { hallucinationChannel } from "../channels/hallucination";
import { selfEscalationChannel } from "../channels/self-escalation";
import { coverageChannel } from "../channels/coverage";
import { lexicalChannel } from "../channels/lexical";
import { numericChannel } from "../channels/numeric";
import { entitiesChannel, extractEntities } from "../channels/entities";
import { medicalShapeChannel } from "../channels/medical-shape";
import { contentTokenSet } from "../channels/lexical";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ILLNESS_POLICY: GroundingSource = {
  id: "illness-policy",
  title: "Illness Policy",
  body: "Keep your child at home if they have a fever of 100.4 or higher, vomiting, diarrhea, or any contagious disease. Children must be fever-free for 24 hours without medication before returning.",
};

const HOURS_ENTRY: GroundingSource = {
  id: "hours-of-operation",
  title: "Hours of Operation",
  body: "The program runs Monday through Friday from 7:00 am to 6:00 pm. Preschool classes meet 6.5 hours per day.",
};

const CONTACT_ENTRY: GroundingSource = {
  id: "contact",
  title: "Main Office Contact",
  body: "Sunflower Early Learning: 1420 Willow Creek Ln, Austin, TX 78704. Main phone: (512) 555-0142. Office hours Monday - Friday 7:00 am to 6:00 pm.",
};

const TWO_LAYER_SOURCES: GroundingSource[] = [ILLNESS_POLICY, HOURS_ENTRY, CONTACT_ENTRY];

function draft(partial: Partial<AnswerContract> = {}): AnswerContract {
  return {
    answer: "We open at 7am Monday through Friday.",
    confidence: "high",
    cited_entries: ["hours-of-operation"],
    directly_addressed_by: ["hours-of-operation"],
    escalate: false,
    escalation_reason: undefined,
    ...partial,
  };
}

function input(
  partial: Partial<AnswerContract> = {},
  allSources: GroundingSource[] = TWO_LAYER_SOURCES,
  question = "What time do you open?",
): ChannelInput {
  const d = draft(partial);
  const citedIdSet = new Set([...d.cited_entries, ...(d.directly_addressed_by ?? [])]);
  const cited = allSources.filter((s) => citedIdSet.has(s.id));
  return { question, draft: d, cited, allSources };
}

// ---------------------------------------------------------------------------
// hallucination
// ---------------------------------------------------------------------------

describe("hallucinationChannel", () => {
  it("passes when every cited id exists", () => {
    expect(hallucinationChannel(input()).verdict).toBe("pass");
  });

  it("holds when cited_entries contains an unknown id", () => {
    const v = hallucinationChannel(
      input({
        cited_entries: ["hours-of-operation", "made-up-entry"],
        directly_addressed_by: ["hours-of-operation"],
      }),
    );
    expect(v.verdict).toBe("hold");
    if (v.verdict === "hold") {
      expect(v.reason).toBe("hallucinated_citation");
      expect(v.detail).toContain("made-up-entry");
    }
  });

  it("holds when directly_addressed_by contains an unknown id", () => {
    const v = hallucinationChannel(
      input({
        cited_entries: ["hours-of-operation"],
        directly_addressed_by: ["ghost-override"],
      }),
    );
    expect(v.verdict).toBe("hold");
  });
});

// ---------------------------------------------------------------------------
// self-escalation
// ---------------------------------------------------------------------------

describe("selfEscalationChannel", () => {
  it("passes when escalate=false", () => {
    expect(selfEscalationChannel(input()).verdict).toBe("pass");
  });

  it("holds when the model self-escalates", () => {
    const v = selfEscalationChannel(
      input({ escalate: true, escalation_reason: "uncertain about policy" }),
    );
    expect(v.verdict).toBe("hold");
    if (v.verdict === "hold") {
      expect(v.reason).toBe("model_self_escalated");
      expect(v.detail).toBe("uncertain about policy");
    }
  });
});

// ---------------------------------------------------------------------------
// coverage
// ---------------------------------------------------------------------------

describe("coverageChannel", () => {
  it("passes when directly_addressed_by is non-empty", () => {
    expect(coverageChannel(input()).verdict).toBe("pass");
  });

  it("passes when directly_addressed_by is undefined", () => {
    const v = coverageChannel(input({ directly_addressed_by: undefined }));
    expect(v.verdict).toBe("pass");
  });

  it("passes when directly_addressed_by is empty but cited_entries is non-empty", () => {
    // Honest hedge from the model: "I have general context but no
    // entry directly answers the specific question." If the model
    // cited something, we trust the grounding and let the answer
    // through — the hallucination channel already guarantees cited
    // ids are real.
    const v = coverageChannel(
      input({
        directly_addressed_by: [],
        cited_entries: ["hours-of-operation"],
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("holds when BOTH cited_entries and directly_addressed_by are empty", () => {
    const v = coverageChannel(input({ cited_entries: [], directly_addressed_by: [] }));
    expect(v.verdict).toBe("hold");
    if (v.verdict === "hold") {
      expect(v.reason).toBe("no_direct_coverage");
    }
  });
});

// ---------------------------------------------------------------------------
// lexical
// ---------------------------------------------------------------------------

describe("contentTokenSet (lexical tokenizer)", () => {
  it("lowercases, strips punctuation, filters stopwords, light-stems", () => {
    const tokens = contentTokenSet("The program runs Monday through Friday from 7am to 6pm!");
    expect(tokens.has("program")).toBe(true);
    // "runs" stems to "run"
    expect(tokens.has("run")).toBe(true);
    expect(tokens.has("monday")).toBe(true);
    expect(tokens.has("friday")).toBe(true);
    expect(tokens.has("the")).toBe(false); // stopword
    expect(tokens.has("from")).toBe(false);
  });

  it("drops tokens shorter than 3 characters", () => {
    const tokens = contentTokenSet("We go by bus to a lot");
    expect(tokens.has("bus")).toBe(true);
    expect(tokens.has("lot")).toBe(true);
    expect(tokens.has("go")).toBe(false);
    expect(tokens.has("we")).toBe(false);
  });
});

describe("lexicalChannel", () => {
  it("passes when the draft paraphrases a cited source", () => {
    const v = lexicalChannel(
      input({
        answer:
          "We are open Monday through Friday from 7am until 6pm. Preschool classes run for 6.5 hours each day.",
        cited_entries: ["hours-of-operation"],
        directly_addressed_by: ["hours-of-operation"],
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("auto-passes very short drafts", () => {
    const v = lexicalChannel(
      input({
        answer: "Yes, absolutely.",
        cited_entries: ["hours-of-operation"],
        directly_addressed_by: ["hours-of-operation"],
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("holds when the draft is long but cites nothing", () => {
    const v = lexicalChannel(
      input({
        answer:
          "We offer an extensive summer camp program from June through August with daily field trips and art workshops.",
        cited_entries: [],
        directly_addressed_by: [],
      }),
    );
    expect(v.verdict).toBe("hold");
    if (v.verdict === "hold") expect(v.reason).toBe("lexical_unsupported");
  });

  it("holds when the draft invents vocabulary not in the cited source", () => {
    const v = lexicalChannel(
      input({
        answer:
          "We offer yoga classes, meditation workshops, organic gardening programs, and weekly dance performances for preschool students throughout the academic year.",
        cited_entries: ["hours-of-operation"],
        directly_addressed_by: ["hours-of-operation"],
      }),
    );
    expect(v.verdict).toBe("hold");
  });
});

// ---------------------------------------------------------------------------
// numeric
// ---------------------------------------------------------------------------

describe("numericChannel", () => {
  it("passes when every numeric literal appears in a cited source", () => {
    const v = numericChannel(
      input({
        answer:
          "You can reach the main office at (512) 555-0142. Children must be fever-free for 24 hours before returning.",
        cited_entries: ["contact", "illness-policy"],
        directly_addressed_by: ["contact"],
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("holds when the draft contains a phone number absent from sources", () => {
    const v = numericChannel(
      input({
        answer: "You can reach the main office at 512-123-4567 during business hours.",
        cited_entries: ["contact"],
        directly_addressed_by: ["contact"],
      }),
    );
    expect(v.verdict).toBe("hold");
    if (v.verdict === "hold") {
      expect(v.reason).toBe("fabricated_numeric");
      expect(v.detail).toContain("512-123-4567");
    }
  });

  it("holds when the draft invents a temperature threshold", () => {
    const v = numericChannel(
      input({
        answer: "Keep children home if they have a fever of 102.5 or higher.",
        cited_entries: ["illness-policy"],
        directly_addressed_by: ["illness-policy"],
      }),
    );
    expect(v.verdict).toBe("hold");
  });

  it("passes when the draft uses a number that matches the source", () => {
    const v = numericChannel(
      input({
        answer: "The fever threshold is 100.4 or higher.",
        cited_entries: ["illness-policy"],
        directly_addressed_by: ["illness-policy"],
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("holds when numeric literals exist but no sources are cited", () => {
    const v = numericChannel(
      input({
        answer: "The late fee is $25 and our phone is 555-0100.",
        cited_entries: [],
        directly_addressed_by: [],
      }),
    );
    expect(v.verdict).toBe("hold");
  });

  it("passes when the draft has no numeric literals", () => {
    const v = numericChannel(
      input({
        answer: "The program runs on school days and welcomes new families.",
        cited_entries: ["hours-of-operation"],
        directly_addressed_by: ["hours-of-operation"],
      }),
    );
    expect(v.verdict).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// entities
// ---------------------------------------------------------------------------

describe("extractEntities", () => {
  it("finds multi-word capitalized phrases", () => {
    const found = extractEntities("Contact Director Maya at the Sunflower Main Office.");
    expect(found).toContain("Director Maya");
    expect(found).toContain("Sunflower Main Office");
  });

  it("skips sentence-initial common words", () => {
    const found = extractEntities("The program is great. Please apply soon.");
    expect(found).not.toContain("The");
    expect(found).not.toContain("Please");
  });

  it("keeps single capitalized words at least 4 chars that aren't sentence-initial", () => {
    const found = extractEntities("We work with our partner Brightwheel for daily updates.");
    expect(found).toContain("Brightwheel");
  });

  // C8: standalone 4-letter proper name in a non-sentence-initial position
  it("extracts a standalone 4-letter proper name mid-sentence", () => {
    const found = extractEntities("Please contact Maya for enrollment questions.");
    expect(found).toContain("Maya");
  });
});

describe("entitiesChannel", () => {
  it("passes when named entities appear in cited sources", () => {
    const v = entitiesChannel(
      input({
        answer:
          "Sunflower Early Learning is located in Austin. You can reach them at the main number.",
        cited_entries: ["contact"],
        directly_addressed_by: ["contact"],
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("holds when the draft names a person not in any source", () => {
    const v = entitiesChannel(
      input({
        answer: "Please contact Director Sarah Gonzalez for scheduling questions.",
        cited_entries: ["contact"],
        directly_addressed_by: ["contact"],
      }),
    );
    expect(v.verdict).toBe("hold");
    if (v.verdict === "hold") expect(v.reason).toBe("fabricated_entity");
  });

  it("passes when the draft has no named entities", () => {
    const v = entitiesChannel(
      input({
        answer: "We open early and close in the evening.",
        cited_entries: ["hours-of-operation"],
        directly_addressed_by: ["hours-of-operation"],
      }),
    );
    expect(v.verdict).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// medical-shape
// ---------------------------------------------------------------------------

describe("medicalShapeChannel", () => {
  it("passes when the draft paraphrases policy text", () => {
    const v = medicalShapeChannel(
      input({
        answer:
          "Per the illness policy, children who have a fever of 100.4 or higher or who have vomited in the last 24 hours should stay home until symptoms resolve.",
        cited_entries: ["illness-policy"],
        directly_addressed_by: ["illness-policy"],
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("holds when the draft directs the parent to give a medication", () => {
    const v = medicalShapeChannel(
      input({
        answer: "Give your child Tylenol every 4 hours until the fever breaks.",
      }),
    );
    expect(v.verdict).toBe("hold");
    if (v.verdict === "hold") expect(v.reason).toBe("medical_instruction");
  });

  it("holds when the draft directs the parent to keep a specific child home for N hours", () => {
    const v = medicalShapeChannel(
      input({
        answer: "Keep your child home for 24 hours after the last episode of vomiting.",
      }),
    );
    expect(v.verdict).toBe("hold");
  });

  it("holds when the draft directs the parent to the ER", () => {
    const v = medicalShapeChannel(
      input({
        answer:
          "You should take your child to the emergency room right away if you see that kind of rash.",
      }),
    );
    expect(v.verdict).toBe("hold");
  });

  it("passes on a policy paraphrase that mentions calling 911 (staff subject)", () => {
    const v = medicalShapeChannel(
      input({
        answer:
          "If a child is injured, our staff administer first aid, call 911 if needed, and contact you.",
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  // C3: scoped call-911 — parent-directed should HOLD
  it("holds when the draft tells the parent to call 911", () => {
    const v = medicalShapeChannel(
      input({
        answer: "Call 911 if your child stops breathing.",
      }),
    );
    expect(v.verdict).toBe("hold");
    if (v.verdict === "hold") expect(v.reason).toBe("medical_instruction");
  });

  it("holds when the draft says 'you should call 911'", () => {
    const v = medicalShapeChannel(
      input({
        answer: "If you notice swelling around the throat, you should call 911 immediately.",
      }),
    );
    expect(v.verdict).toBe("hold");
    if (v.verdict === "hold") expect(v.reason).toBe("medical_instruction");
  });

  // C3: scoped call-911 — third-person subjects should PASS
  it("passes when 'staff will call 911'", () => {
    const v = medicalShapeChannel(
      input({
        answer: "Staff will call 911 in an emergency.",
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("passes when 'we call 911'", () => {
    const v = medicalShapeChannel(
      input({
        answer: "In case of a medical emergency, we call 911 and notify parents immediately.",
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("passes when 'teachers will call 911'", () => {
    const v = medicalShapeChannel(
      input({
        answer: "Teachers will call 911 if a child has a seizure.",
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("passes when 'the center will call 911'", () => {
    const v = medicalShapeChannel(
      input({
        answer: "The center will call 911 for any life-threatening situation.",
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("holds when the draft contains dosage numeric literals", () => {
    const v = medicalShapeChannel(
      input({
        answer: "A typical pediatric dose is 5 ml every 6 hours.",
      }),
    );
    expect(v.verdict).toBe("hold");
  });

  it("passes on a general informational policy answer about medication", () => {
    const v = medicalShapeChannel(
      input({
        answer:
          "Our medication administration policy requires a written authorization from a parent and, for prescription medicines, a signed form from the child's pediatrician. Staff do not administer over-the-counter medicines without this paperwork.",
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  it("passes on an informational sick-child exclusion answer", () => {
    const v = medicalShapeChannel(
      input({
        answer:
          "The sick-child exclusion policy says children should be kept at home for fever, vomiting, diarrhea, or contagious illness. Staff will call a parent to pick up any child showing these symptoms at the center.",
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  // REGRESSION: C1 — staff-as-subject paraphrases should PASS
  it("passes when staff is the subject of 'give him'", () => {
    const v = medicalShapeChannel(
      input({
        answer: "Staff will give him his EpiPen from the classroom if he has an allergic reaction.",
      }),
    );
    expect(v.verdict).toBe("pass");
  });

  // REGRESSION: C2 — administer/inject vocabulary should HOLD
  it("holds when the draft tells the parent to administer medication", () => {
    const v = medicalShapeChannel(
      input({
        answer:
          "You should administer the EpiPen to him immediately if he shows signs of anaphylaxis.",
      }),
    );
    expect(v.verdict).toBe("hold");
    if (v.verdict === "hold") expect(v.reason).toBe("medical_instruction");
  });
});
