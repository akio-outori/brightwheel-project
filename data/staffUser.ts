// Mock logged-in staff user. The project has no auth layer yet —
// the operator console is a single-user demo — so this constant
// stands in for whatever a session store would return in a real
// deployment. Importing from here instead of redeclaring means
// the header dropdown and the /admin/profile page stay in sync,
// and the future auth layer has exactly one file to replace.
//
// All facts here are consistent with the Sunflower handbook's
// `staff` and `welcome` entries (Director Maya Okonkwo founded
// Sunflower in 2019 after fifteen years teaching public Pre-K).
// If the handbook ever changes that bio, this file needs to
// change too.

export interface StaffUser {
  readonly name: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: string;
  readonly pronouns: string;
  readonly email: string;
  readonly phone: string;
  readonly initials: string;
  readonly joinedAt: string; // YYYY-MM-DD
  readonly bio: string;
  readonly credentials: ReadonlyArray<string>;
  readonly languages: ReadonlyArray<string>;
  readonly location: {
    readonly center: string;
    readonly address: string;
  };
}

export const CURRENT_STAFF: StaffUser = {
  name: "Maya Okonkwo",
  firstName: "Maya",
  lastName: "Okonkwo",
  role: "Director & Founder",
  pronouns: "she/her",
  email: "maya@sunflower.care",
  phone: "(512) 555-0142",
  initials: "MO",
  joinedAt: "2019-08-01",
  bio: "Founded Sunflower Early Learning in 2019 after fifteen years teaching public Pre-K. Believes early learning should be playful, joyful, and rooted in real relationships — with teachers, with peers, and with the families who trust us with their kids.",
  credentials: [
    "M.Ed. in Early Childhood Education",
    "Texas Center-Based Director certification",
    "Child Development Associate (CDA)",
    "Pediatric First Aid + CPR (renewed annually)",
    "Trauma-Informed Care training (annual)",
  ],
  languages: ["English", "Yoruba"],
  location: {
    center: "Sunflower Early Learning",
    address: "1420 Willow Creek Ln, Austin, TX 78704",
  },
};
