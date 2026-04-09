// Sensitive-topic detection on the raw question text. This runs in
// addition to the model's own judgment — it's belt-and-braces. If a
// parent asks about anything medical, custody-related, or injury-
// related, we escalate unconditionally, even if the model thinks it
// has a high-confidence answer.
//
// The list is deliberately short and high-precision. False positives
// are tolerable (an extra escalation is a graceful outcome). False
// negatives — a sensitive topic that slips through — are the failure
// mode worth optimizing against.

const SENSITIVE_PATTERNS: ReadonlyArray<RegExp> = [
  // Illness / medical
  /\bfever\b/i,
  /\btemperature\b/i,
  /\bsick\b/i,
  /\bmedicine\b|\bmedication\b/i,
  /\ballerg/i,
  /\bvomit/i,
  /\bdiarrhea\b/i,

  // Injury
  /\binjur/i,
  /\bbleed/i,
  /\bbit\b|\bbiting\b/i,
  /\bhead\s*injury/i,
  /\bconcussion\b/i,

  // Custody / legal / safeguarding
  /\bcustody\b/i,
  /\bpickup.*not.*allowed/i,
  /\bunauthorized\b/i,
  /\babuse\b|\bbruise\b/i,

  // Emergency
  /\bemergency\b/i,
  /\b911\b/i,
  /\bambulance\b/i,
];

export function isSensitiveTopic(question: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(question));
}
