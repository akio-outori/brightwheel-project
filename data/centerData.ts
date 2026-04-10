export const CENTER = {
  name: "Sunshine Academy",
  tagline: "Where little minds grow bright",
  phone: "(505) 867-5309",
  email: "hello@sunshineacademy.com",
  address: "2810 Coors Blvd NW, Albuquerque, NM 87120",
};

export interface KnowledgeItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  icon: string;
  tags: string[];
}

export const KNOWLEDGE_BASE: KnowledgeItem[] = [
  {
    id: "hours",
    category: "Hours & Schedule",
    question: "What are your hours?",
    answer: "We are open Monday\u2013Friday, 7:00 AM \u2013 6:00 PM. We are closed on all federal holidays and two teacher planning days per year.",
    icon: "Clock",
    tags: ["hours", "schedule", "open", "close"],
  },
  {
    id: "holidays",
    category: "Hours & Schedule",
    question: "Are you open on Veterans Day / [holiday]?",
    answer: "We are closed on the following federal holidays: New Year\u2019s Day, MLK Jr. Day, Presidents\u2019 Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Veterans Day, Thanksgiving Day, and Christmas Day. We also close the Friday after Thanksgiving.",
    icon: "Calendar",
    tags: ["holidays", "closed", "veterans day", "christmas", "thanksgiving"],
  },
  {
    id: "tuition-infant",
    category: "Tuition & Fees",
    question: "What is the tuition for infants?",
    answer: "Infant tuition (6 weeks\u201312 months) is $1,850/month for full-time (5 days/week) or $1,100/month for part-time (3 days/week). A one-time enrollment fee of $150 applies. We accept ACH bank transfers and most major credit cards.",
    icon: "DollarSign",
    tags: ["tuition", "cost", "price", "infant", "baby", "fee"],
  },
  {
    id: "tuition-toddler",
    category: "Tuition & Fees",
    question: "What is the tuition for toddlers?",
    answer: "Toddler tuition (13\u201336 months) is $1,650/month full-time or $990/month part-time. Pre-K (3\u20135 years) is $1,450/month full-time or $870/month part-time.",
    icon: "DollarSign",
    tags: ["tuition", "toddler", "pre-k", "preschool", "cost"],
  },
  {
    id: "sick-policy",
    category: "Health & Safety",
    question: "My child has a fever \u2014 can they come in?",
    answer: "Children must be fever-free (below 100.4\u00b0F) for a full 24 hours without fever-reducing medication before returning. This policy also applies to vomiting and diarrhea. We\u2019ll always call you if your child develops a fever while in our care.",
    icon: "Heart",
    tags: ["sick", "fever", "illness", "health", "policy", "return"],
  },
  {
    id: "lunch",
    category: "Meals & Nutrition",
    question: "I forgot to pack lunch \u2014 can you provide one?",
    answer: "Yes! We offer catered lunches for $8/day. Just text or call us before 9:00 AM on the day you need it. Our lunch menu rotates weekly and is always posted on the parent app. Today\u2019s lunch is Pasta Primavera with steamed broccoli and fresh fruit.",
    icon: "UtensilsCrossed",
    tags: ["lunch", "food", "meal", "forgot", "catering", "menu"],
  },
  {
    id: "tours",
    category: "Enrollment",
    question: "How can I schedule a tour?",
    answer: "We\u2019d love to show you around! Tours are available Tuesday and Thursday at 10:00 AM and 3:00 PM. You can book directly through our website, reply here with your preferred time, or call us at (505) 867-5309. Tours typically last 30\u201345 minutes.",
    icon: "MapPin",
    tags: ["tour", "visit", "schedule", "enrollment", "apply"],
  },
  {
    id: "waitlist",
    category: "Enrollment",
    question: "Is there a waitlist?",
    answer: "We currently have openings for toddlers (18\u201336 months) and Pre-K (3\u20134 years). Infant spots (under 12 months) have a 2\u20133 month waitlist. To join the waitlist, complete our online application \u2014 there\u2019s no fee to apply.",
    icon: "Users",
    tags: ["waitlist", "availability", "openings", "enrollment", "spots"],
  },
  {
    id: "allergies",
    category: "Health & Safety",
    question: "My child has a food allergy. How do you handle it?",
    answer: "We take allergies very seriously. Every child\u2019s allergy plan is reviewed at enrollment and displayed in our kitchen. We are a peanut-free facility. For severe allergies, we require an EpiPen on file. Please speak with our director, Ms. Rivera, directly to review your child\u2019s specific needs.",
    icon: "Shield",
    tags: ["allergy", "allergies", "peanut", "food", "safety", "epipen"],
  },
];

export interface QuestionLogItem {
  id: number;
  question: string;
  askedAt: string;
  channel: string;
  resolved: boolean;
  confidence: number | null;
  matchedKnowledge: string | null;
  parentName: string;
  escalated?: boolean;
  escalationNote?: string;
  directProvider?: boolean;
}

export const QUESTION_LOG: QuestionLogItem[] = [
  {
    id: 1,
    question: "Are you open on Veterans Day?",
    askedAt: "2026-04-10T08:23:00Z",
    channel: "chat",
    resolved: true,
    confidence: 0.97,
    matchedKnowledge: "holidays",
    parentName: "Aisha M.",
  },
  {
    id: 2,
    question: "What's the tuition for a 2-year-old?",
    askedAt: "2026-04-10T09:11:00Z",
    channel: "chat",
    resolved: true,
    confidence: 0.92,
    matchedKnowledge: "tuition-toddler",
    parentName: "Marcus T.",
  },
  {
    id: 3,
    question: "My daughter has pink eye, should she stay home?",
    askedAt: "2026-04-10T09:45:00Z",
    channel: "chat",
    resolved: false,
    confidence: null,
    matchedKnowledge: null,
    parentName: "Priya L.",
    directProvider: true,
  },
  {
    id: 4,
    question: "Do you have any openings for infants?",
    askedAt: "2026-04-10T10:02:00Z",
    channel: "chat",
    resolved: true,
    confidence: 0.88,
    matchedKnowledge: "waitlist",
    parentName: "Derek K.",
  },
  {
    id: 5,
    question: "Can I bring my dog for show and tell?",
    askedAt: "2026-04-10T10:30:00Z",
    channel: "chat",
    resolved: false,
    confidence: 0.12,
    matchedKnowledge: null,
    parentName: "Sofia R.",
    escalated: true,
    escalationNote: "No matching policy found \u2014 needs staff response.",
  },
  {
    id: 6,
    question: "What time does the after-school program end?",
    askedAt: "2026-04-10T11:15:00Z",
    channel: "chat",
    resolved: false,
    confidence: 0.35,
    matchedKnowledge: "hours",
    parentName: "James W.",
    escalated: true,
    escalationNote: "After-school program not explicitly defined \u2014 may need its own policy entry.",
  },
  {
    id: 7,
    question: "I forgot to send lunch today, can you help?",
    askedAt: "2026-04-10T08:47:00Z",
    channel: "chat",
    resolved: true,
    confidence: 0.95,
    matchedKnowledge: "lunch",
    parentName: "Linda C.",
  },
];
