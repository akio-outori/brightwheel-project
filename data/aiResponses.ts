export const SUGGESTED_QUESTIONS = [
  "What do kids eat for lunch?",
  "What's your sick-child policy?",
  "How does drop-off work?",
  "What are your hours?",
  "How do I enroll my child?",
  "What are the late pickup fees?",
];

/** Safe follow-up suggestions shown after an escalated response.
 *  Only questions the system can answer confidently — no specific-
 *  child health questions that would escalate again. */
export const FOLLOWUP_SUGGESTIONS = [
  "What are your hours?",
  "How much is tuition?",
  "Do you provide meals?",
];
