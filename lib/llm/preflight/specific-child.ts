// Specific-child classifier. Detects questions where the parent is
// describing an individual child's medical or safety situation, as
// distinct from asking a general informational question about
// program policy.
//
// Architecture: compiled regex patterns grouped by threat category,
// each with a documented purpose, running in short-circuit order.
// The first match wins.
//
// Design principle: the patterns fire on the QUESTION (pre-response),
// not on the model's draft. This saves the LLM call entirely for
// questions that are clearly about a specific child — the parent
// gets the stock "a staff member is reviewing this" response
// immediately, the operator gets the question in needs-attention,
// and the model never has a chance to generate a confident-but-wrong
// answer about a specific child's health.
//
// ┌──────────────────────────────────────────────────────────┐
// │ KEY DISTINCTION                                          │
// │                                                          │
// │ "My child has a fever" → HOLD (specific child)          │
// │ "What is the fever exclusion policy?" → PASS (general)  │
// │                                                          │
// │ The structural tell is the SUBJECT: first-person         │
// │ possessive ("my child"), proper name ("Tommy"),          │
// │ or third-person pronoun ("he/she") in health context.    │
// │ General policy questions use impersonal subjects         │
// │ ("children", "students", "the program", "what").         │
// └──────────────────────────────────────────────────────────┘

import type { PreflightVerdict } from "./types";

// -----------------------------------------------------------------------
// Health vocabulary — the condition/symptom/medical words that, when
// combined with a specific-child subject, signal a question about
// an individual child's situation.
// -----------------------------------------------------------------------

const HEALTH_WORDS =
  "(?:sick|fever|temperature|vomit(?:ing|ed)?|diarrhea|allerg(?:y|ic|ies)" +
  "|hurt|injur(?:y|ed|ies)|bleed(?:ing)?|bruise[ds]?|rash|cough(?:ing)?" +
  "|medic(?:ine|ation|al)|inhaler|epipen|epinephrine|tylenol|motrin|advil" +
  "|ibuprofen|acetaminophen|antibiotics?|prescription" +
  "|doctor|pediatrician|hospital|emergency\\s*room|urgent\\s*care|ambulance|911" +
  "|bit(?:ten|e|ing)?|head\\s*bump|concussion|fell|fall(?:en)?|cold" +
  "|stomach(?:ache)?|nauseous|lethargic|out\\s+of\\s+it" +
  "|not\\s+feeling\\s+well|isn't\\s+feeling\\s+well|feeling\\s+poorly" +
  "|under\\s+the\\s+weather|threw\\s+up|throwing\\s+up|thrown\\s+up" +
  "|symptom|contagious|infection|lice|pink\\s*eye|conjunctivitis" +
  "|strep|eczema|scraped?|scratch(?:ed)?|swollen|swelling" +
  "|hand-foot-and-mouth|chicken\\s*pox|norovirus|rsv|covid" +
  "|runny\\s+nose|sore\\s+throat|earache|ear\\s+infection|wheezing" +
  "|caught\\s+something|came\\s+down\\s+with" +
  "|got\\s+sick|picked\\s+up\\s+a\\s+bug|has\\s+a\\s+bug" +
  "|administer(?:ed|ing)?|inject(?:ed|ing|ion)?" +
  "|custody|restraining|unauthorized|not\\s+allowed" +
  "|abuse|neglect)";

const HEALTH_RE = new RegExp(`\\b${HEALTH_WORDS}\\b`, "i");

// -----------------------------------------------------------------------
// Pattern group 1: possessive + family noun
//
// "My child has a fever"
// "My son fell at home"
// "My daughter is allergic to peanuts"
// "Our baby needs his inhaler"
// -----------------------------------------------------------------------

const FAMILY_NOUNS = "(?:child|son|daughter|kid|baby|toddler|boy|girl|little\\s+one|kiddo|infant)";

const POSSESSIVE_CHILD_PATTERNS: ReadonlyArray<RegExp> = [
  // "my/our [family-noun] ..." with health words anywhere in question
  new RegExp(`\\b(?:my|our)\\s+${FAMILY_NOUNS}\\b`, "i"),
  // "my/our [name]'s" — possessive proper name: "my Tommy's fever"
  new RegExp(`\\b(?:[Mm]y|[Oo]ur)\\s+[A-Z][a-z]{2,}(?:'s)?\\b`),
  // "a child like mine" / "a kid like mine" — indirect possessive
  new RegExp(`\\b(?:child|kid|son|daughter)\\s+like\\s+mine\\b`, "i"),
];

// -----------------------------------------------------------------------
// Pattern group 2: proper name + health/condition verb
//
// "Tommy has a fever"
// "Sarah is allergic to peanuts"
// "Jake fell on the playground"
//
// We require: capitalized word (not a known common/allowed word)
// followed within 40 chars by health vocabulary. This catches
// names we can't enumerate, at the cost of some false positives
// on sentence-initial common words — mitigated by the allowlist.
// -----------------------------------------------------------------------

const NAME_ALLOWLIST: ReadonlySet<string> = new Set([
  // Sentence starters
  "The",
  "This",
  "That",
  "These",
  "Those",
  "What",
  "When",
  "Where",
  "How",
  "Who",
  "Why",
  "Which",
  "Does",
  "Did",
  "Can",
  "Could",
  "Would",
  "Should",
  "Will",
  "Are",
  "Is",
  "Do",
  "Have",
  "Has",
  "Please",
  "Thanks",
  "Thank",
  "Yes",
  "No",
  "Also",
  "However",
  "But",
  "And",
  "Or",
  "If",
  "For",
  "Our",
  "Your",
  "Their",
  // Days / months
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  // Program-specific allowed words
  "Early",
  "Head",
  "Start",
  "Pre",
  "Preschool",
  // Center name and common proper nouns in the Sunflower handbook
  // content — these shouldn't be treated as a child's first name
  // when parents ask about the program.
  "Sunflower",
  "Willow",
  "Creek",
  "Austin",
  "Texas",
  "Maya",
  "Okonkwo",
  "Reggio",
  "Emilia",
  "Creative",
  "Curriculum",
]);

// Proper name extraction is case-SENSITIVE (must start with an actual
// uppercase letter, not "children" or "center") while health-word
// matching is case-insensitive. These can't be a single regex without
// the `i` flag leaking into the name capture, so we split: extract
// all capitalized words first, then check proximity to health words.
const PROPER_NAME_RE = /\b([A-Z][a-z]{2,})\b/g;

function findProperNameNearHealth(question: string): string | null {
  PROPER_NAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROPER_NAME_RE.exec(question)) !== null) {
    const name = m[1]!;
    if (NAME_ALLOWLIST.has(name)) continue;
    // Check if any health word appears within 120 chars after the name
    const after = question.slice(m.index, m.index + 120);
    if (HEALTH_RE.test(after)) return name;
  }
  return null;
}

// -----------------------------------------------------------------------
// Pattern group 3: third-person pronoun in health context
//
// "He has diarrhea, can he come in?"
// "She was bitten by another child"
// "Can you give him his medication?"
// "Should I bring her in?"
//
// Pronouns alone are too broad ("she enrolled last week"). We
// require health vocabulary in the same question.
// -----------------------------------------------------------------------

const PRONOUN_HEALTH_PATTERNS: ReadonlyArray<RegExp> = [
  // pronoun + condition verb (including contractions)
  new RegExp(
    `\\b(?:he|she|they)\\s+(?:is|are|has|have|was|were|got|had|needs?|fell|seems?|looks?|feels?|can't|won't|doesn't|don't|isn't|aren't|hasn't|haven't)\\b`,
    "i",
  ),
  // Contraction forms: he's/she's/they've/they're (= he is / she has / they have / they are)
  /\b(?:he's|she's|they've|they're)\b/i,
  // action requests with pronouns: "give him/her/them", "bring him/her/them",
  // "pick him/her/them up"
  new RegExp(`\\b(?:give|bring|take|keep)\\s+(?:him|her|them)\\b`, "i"),
  /\bpick\s+(?:him|her|them)\s+up\b/i,
  // "I need to pick him/her/them up" (health context required by caller)
  /\bneed\s+to\s+pick\s+(?:him|her|them)\s+up\b/i,
  // "should I bring him/her/them"
  new RegExp(`\\bshould\\s+I\\s+(?:bring|take|keep)\\s+(?:him|her|them)\\b`, "i"),
  // "can he/she/they (still)? (come|attend|return)"
  new RegExp(`\\bcan\\s+(?:he|she|they)\\s+(?:still\\s+)?(?:come|attend|return|go)\\b`, "i"),
];

// -----------------------------------------------------------------------
// Pattern group 4: direct action requests for a child
//
// "Can you give my son Tylenol at lunch?"
// "Should I bring my child in today?"
// "Can my daughter still attend?"
// "Can you double-check her pickup authorization?"
// -----------------------------------------------------------------------

const ACTION_REQUEST_PATTERNS: ReadonlyArray<RegExp> = [
  // "can you [verb] my [family-noun]"
  new RegExp(`\\bcan\\s+you\\s+\\w+\\s+(?:my|his|her)\\s+${FAMILY_NOUNS}\\b`, "i"),
  // "can my [family-noun] (still)? [attend/come/return]"
  new RegExp(
    `\\bcan\\s+(?:my|our)\\s+${FAMILY_NOUNS}\\s+(?:still\\s+)?(?:come|attend|return|go)\\b`,
    "i",
  ),
  // "should I bring/take my [family-noun]"
  new RegExp(`\\bshould\\s+I\\s+(?:bring|take|keep)\\s+(?:my|our)\\s+${FAMILY_NOUNS}\\b`, "i"),
  // "double-check (his|her|my child's) (pickup|authorization)"
  new RegExp(
    `\\b(?:check|double-check|verify)\\s+(?:his|her|(?:my|our)\\s+${FAMILY_NOUNS}(?:'s)?)\\s+(?:pickup|authorization|custody)\\b`,
    "i",
  ),
];

// -----------------------------------------------------------------------
// Negative patterns — general policy questions that should NOT hold
// even if they contain health vocabulary.
//
// "What is the sick-child exclusion policy?"
// "How does the program handle food allergies?"
// "What immunizations are required?"
// -----------------------------------------------------------------------

const POLICY_QUESTION_PATTERNS: ReadonlyArray<RegExp> = [
  // "what is/are the [topic] policy/procedure/requirement"
  /\bwhat\s+(?:is|are)\s+(?:the|your)\b/i,
  // "how does the program/center/school handle/manage"
  /\bhow\s+(?:does|do)\s+(?:the|your)\s+(?:program|center|school)\b/i,
  // Explicit policy words paired with a question structure
  /\b(?:policy|policies|procedure|requirement|guideline|rule|regulation)\s*\?/i,
  // "what happens when/if children..."
  /\bwhat\s+happens?\s+(?:when|if)\s+(?:children|kids|a\s+child|students)\b/i,
  // "do you (handle|offer|require|provide|accept)" — general info
  /\bdo\s+you\s+(?:handle|offer|require|provide|accept|have|allow)\b/i,
  // "what [noun] do I/you need" — enrollment/info questions
  /\bwhat\s+\w+\s+(?:do|does|are)\s+(?:I|we|you)\s+(?:need|require)\b/i,
  // "when should I..." — asking for general guidance on a topic
  /\bwhen\s+should\s+I\b/i,
  // "when do I need to..." — general procedural question
  /\bwhen\s+(?:do|should|can|would)\s+(?:I|we)\b/i,
  // "at what [noun]..." — threshold/policy questions
  /\bat\s+what\s+\w+\s+(?:should|do|does|can|would)\b/i,
  // "how long does/should/must my child..." — duration policy
  /\bhow\s+long\s+(?:does|should|must|do)\b/i,
  // "when can my child return/come back/go back"
  /\bwhen\s+can\s+(?:my|our)\s+(?:child|son|daughter|kid)\s+(?:return|come\s+back|go\s+back|attend)\b/i,
  // "how many hours/days" — quantitative policy
  /\bhow\s+many\s+(?:hours|days|weeks)\b/i,
  // Note: "is it OK to..." was considered as a policy pattern but
  // rejected. When it co-occurs with "my child" + a health word
  // ("Is it OK to send my child with a runny nose?"), the parent is
  // always describing their specific child's situation, not asking
  // about general policy. The other policy patterns (what/how/when
  // + abstract phrasing) are sufficient to catch real policy queries.
];

function isPolicyQuestion(question: string): boolean {
  return POLICY_QUESTION_PATTERNS.some((p) => p.test(question));
}

// -----------------------------------------------------------------------
// Classifier entry point
// -----------------------------------------------------------------------

export function classifySpecificChild(question: string): PreflightVerdict {
  // Fast exit: if the question matches a policy pattern and does NOT
  // contain a specific-child subject, it's a general question.
  // The policy check runs first so "What is the sick-child exclusion
  // policy?" never triggers the health-word patterns below.
  const hasHealthWord = HEALTH_RE.test(question);

  // Group 1a: possessive + family noun + health vocabulary
  for (const pat of POSSESSIVE_CHILD_PATTERNS) {
    if (pat.test(question) && hasHealthWord) {
      if (isPolicyQuestion(question)) continue;
      return {
        verdict: "hold",
        reason: "specific_child_question",
        detail: `possessive + family noun with health context`,
      };
    }
  }

  // Group 1b: possessive + family noun + attendance-decision verb
  // + health context. "Is it OK to send my child with a runny nose?"
  // holds because "runny nose" provides health context. "Should I
  // bring my child in today?" passes because there's no health
  // context — it's a schedule question. The health requirement
  // prevents false positives on "Can my daughter attend the summer
  // session?" while catching "Can my son still come if he has a cold?"
  if (hasHealthWord && !isPolicyQuestion(question)) {
    const attendanceDecision = new RegExp(
      `\\b(?:send|bring|take|keep)\\s+(?:my|our)\\s+${FAMILY_NOUNS}\\b`,
      "i",
    );
    const childAttendance = new RegExp(
      `\\b(?:my|our)\\s+${FAMILY_NOUNS}\\s+(?:still\\s+)?(?:come|attend|return|go|stay)\\b`,
      "i",
    );
    if (attendanceDecision.test(question) || childAttendance.test(question)) {
      return {
        verdict: "hold",
        reason: "specific_child_question",
        detail: `possessive + family noun with attendance-decision verb`,
      };
    }
  }

  // Group 2: proper name + health/condition
  if (hasHealthWord && !isPolicyQuestion(question)) {
    const name = findProperNameNearHealth(question);
    if (name) {
      return {
        verdict: "hold",
        reason: "specific_child_question",
        detail: `proper name "${name}" near health vocabulary`,
      };
    }
  }

  // Group 3a: euphemisms that ARE the health signal — no health
  // word required because the phrasing itself conveys illness.
  // "He hasn't been himself" = "he's sick" in parent-speak.
  if (/\bhasn't\s+been\s+(?:himself|herself)\b/i.test(question)) {
    return {
      verdict: "hold",
      reason: "specific_child_question",
      detail: `pronoun euphemism for illness`,
    };
  }

  // Group 3b: third-person pronoun in health context
  if (hasHealthWord && !isPolicyQuestion(question)) {
    for (const pat of PRONOUN_HEALTH_PATTERNS) {
      if (pat.test(question)) {
        return {
          verdict: "hold",
          reason: "specific_child_question",
          detail: `pronoun in health context`,
        };
      }
    }
  }

  // Group 4: direct action requests for a child. Health-context
  // actions (give, bring, take, keep + family noun) require health
  // vocabulary AND must not be general policy questions. Without
  // health context, "can my daughter attend the summer session?" is
  // an enrollment question. With health + policy ("when should I
  // keep my child home if they're sick?"), group 1 already handled
  // and passed it; group 4 should not re-catch.
  for (const pat of ACTION_REQUEST_PATTERNS) {
    if (pat.test(question) && hasHealthWord && !isPolicyQuestion(question)) {
      return {
        verdict: "hold",
        reason: "specific_child_question",
        detail: `action request for a specific child (health context)`,
      };
    }
  }
  // Custody/authorization actions hold unconditionally.
  if (ACTION_REQUEST_PATTERNS[3]!.test(question)) {
    return {
      verdict: "hold",
      reason: "specific_child_question",
      detail: `custody/authorization action request`,
    };
  }

  // Group 5: active-emergency statements. These are declarative
  // statements (not questions) about emergencies in progress.
  // "The ambulance is on its way to the center" doesn't contain a
  // possessive, a family noun, or a question mark — but it MUST
  // escalate because it describes an active emergency. The
  // emergency vocabulary alone is the signal; no health-word or
  // subject check is needed.
  //
  // Gated on !isPolicyQuestion so that general questions like
  // "What are your emergency procedures?" and "How do you handle
  // 911 situations?" pass through to the model.
  /* eslint-disable security/detect-unsafe-regex -- input is parent question capped at 2000 chars */
  const EMERGENCY_STATEMENT_RE =
    /\b(?:ambulance|paramedics?|fire\s*truck|fire\s*department|police|called\s+911|calling\s+911|on\s+(?:the|its)\s+way|rushed\s+to|emergency\s+room|taken\s+to\s+(?:the\s+)?hospital|collapsed|unconscious|not\s+breathing|choking|seizure|anaphylaxis|anaphylactic)\b/i;
  /* eslint-enable security/detect-unsafe-regex */
  if (EMERGENCY_STATEMENT_RE.test(question) && !isPolicyQuestion(question)) {
    return {
      verdict: "hold",
      reason: "specific_child_question",
      detail: "active emergency statement",
    };
  }

  return { verdict: "pass" };
}

// hasDirectHealthClaim was previously used here to distinguish
// policy questions from condition reports. Removed after the policy
// patterns were expanded to be sufficient on their own — if a
// question matches a policy pattern, it passes regardless of
// whether the phrasing also looks like a condition report.
