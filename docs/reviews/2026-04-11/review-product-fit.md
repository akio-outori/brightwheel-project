# review-product-fit — findings

**Branch:** `review/pass` off main HEAD `8be4a21`
**Date:** 2026-04-11

## Demo moments that work — do NOT break these

- **`ParentChat.tsx:14-18`** — The greeting hits the right register. "Hi — I'm Sunflower Early Learning's front desk" is warm without being saccharine, and the specific list ("hours, tuition, health policies, meals, enrollment") tells a parent immediately that this is the right place to ask. It reads like a person said it.

- **`ParentChat.tsx:69-76`** — The escalation fallback copy is human. "I want to make sure you get the right answer here. A staff member is taking a look at your question and will follow up. You can also call us at..." is exactly the right model: acknowledge, act, give the parent an exit.

- **`ChatMessage.tsx:127-130` (`type: "staff_reply"`)** — The green "Reply from staff" bubble is the demo's emotional peak. Color, icon, label, and the real-time delivery together create a moment no FAQ page can replicate. A reviewer who watches this happen live will lean forward. The amber/green two-tone system across the whole reply loop is coherent.

- **`ChatMessage.tsx:156-180`** — Citation pills as tappable affordances, not footnotes. The modal that shows the source text is an unusual trust signal. Most chatbots cite sources as legal cover. This one invites the parent to read it. "Verified policy" with a checkmark rather than "Source: [id]" is the right register.

- **`QuestionLogPanel.tsx:77-87`** — Hold-reason labels are operator-legible, not engineer-legible. "Cited a source that doesn't exist" and "About a specific child — needs a person" are the kind of copy that makes an operator trust the system.

- **`data/seed-handbook.json:76`** — The tuition-due entry is a standout. "If you're ever in a tight spot, please reach out to Director Maya directly — we've worked out short-term payment plans with families before and would rather do that than have you worry alone." This is opinionated, specific, and human.

- **`QuestionLogPanel.tsx:392-396`** — "Also add to handbook so future parents get this answer automatically" checkbox copy is strong. The micro-label below it ("Skip for one-off questions about a specific child") shows genuine understanding of the operator's judgment call. This is the trust-loop mechanic explained in one sentence at the moment it matters.

- **`config/prompts/parent-front-desk.md`** — The system prompt's voice section is intentional and pulls the model warm. "Warm, clear, brief. One to three short paragraphs. This is a front desk, not a FAQ page."

- **`docs/writeup.md:11-19`** — The product thesis is articulated before any technical content. "That third path is the product. Everything else is infrastructure to make it reliable." is a sentence a Brightwheel PM would quote back.

- **`staffUser.ts:43-44`** — Maya's bio is specific enough to be believable. Creates a real person behind the operator console.

## Anti-patterns — would embarrass in a demo

### P0 — Escalation sub-copy is ambiguous and slightly alarming

File: `components/chat/ChatMessage.tsx` line 139

"We'll follow up by phone, or you can ask again later and your answer may be ready." — the phrase "your answer may be ready" is weak and implies the parent needs to come back and check, and that the follow-up might not happen. A parent who just asked something sensitive reads "may be ready" as the system not being sure it will actually do anything.

**Suggested direction:** "Someone from our team will follow up with you. You can also reach us directly at [phone]." Full stop.

### P0 — `"override"` engineering vocabulary visible to operators

File: `components/operator/KnowledgePanel.tsx` lines 234–235

A badge reads "override" in amber next to entries the operator wrote. The director at Sunflower did not write an "override." She added something she knows. If this badge exists at all, it should read "your answer" or "staff-added" or "updated." "Override" is internal codebase vocabulary and means nothing to the human who typed the entry.

### P1 — Third stat card reads awkwardly

File: `components/operator/OperatorDashboard.tsx` line 139

The card layout: big number, label "By staff", sublabel "answered". Top-to-bottom it says "[count] / By staff / answered." Natural reading is "[count] answered by staff" but the layout doesn't support that parsing. Under scan pressure the meaning doesn't land.

**Suggested:** "Staff answered" as the label, "this session" or "total" as sublabel.

### P1 — User messages show initials "P" as a static default

File: `components/parent/ParentChat.tsx` line 267

Every parent's bubble shows "P." A PM watching the demo will notice: the operator side has Maya's name and initials everywhere, the parent side has a static "P." Makes the parent side feel unfinished.

**Suggested:** either a one-field first-name prompt at the start of the session, or drop the avatar entirely from user messages.

## Flat spots — functional but uninspired

### P1 — "Knowledge Base" is SaaS product vocabulary

Files:
- `components/operator/OperatorDashboard.tsx:28` (tab label)
- `components/operator/KnowledgePanel.tsx:176` (panel header)

An operator running a daycare doesn't organize her world around a "Knowledge Base." She reads it as software she has to learn. "Handbook" or "What we know" is the same data described how she'd describe it.

### P1 — "Create override" is the worst button label in the app

File: `components/operator/KnowledgePanel.tsx:391`

An override is a system concept. The director is answering a question or adding something she knows. Button should read "Add to handbook" or "Save answer" or "Teach the front desk."

### P1 — Bell dropdown empty state is cold

File: `components/operator/OperatorDashboard.tsx` lines 284–290

Three separate pieces of copy for the empty state ("All caught up" / "No parent questions waiting." / "Nothing to review.") none of which earn the emotional beat. An operator who clears the queue should feel competent and appreciated.

**Suggested:** "All caught up — parents are getting great answers today."

### P1 — KnowledgePanel error state exposes infrastructure

File: `components/operator/KnowledgePanel.tsx:117`

"Failed to load knowledge base. Make sure the backend is running." is directed at a developer. The operator doesn't know what "the backend" is.

**Suggested:** "We couldn't load your handbook right now — try refreshing, or call us if this keeps happening."

### P2 — Question feed empty states are functional but flat

File: `components/operator/QuestionLogPanel.tsx` lines 147–153

"No staff replies yet in this window." reads like a filter description, not a message to a person. "No parent questions yet — when parents ask something the front desk can't answer, it'll show up here" would be more useful on first visit.

### P2 — "Powered by BrightDesk AI" footer is wrong attribution

File: `components/parent/ParentChat.tsx:458`

From the parent's perspective they're talking to Sunflower's front desk. "Powered by BrightDesk AI" positions it as third-party infrastructure. A parent with a worried question doesn't want to think about what company's AI she's talking to.

**Suggested:** "Sunflower Early Learning · AI Front Desk"

### P2 — "Try asking..." in SuggestedQuestions

File: `components/chat/SuggestedQuestions.tsx:14`

A second redundant invitation after the greeting's "What can I help you with?" Reads like instructional text for a search engine.

### P2 — System prompt voice instructions appear at line 305

File: `config/prompts/parent-front-desk.md`

The prompt spends the first 300 lines on JSON schema, escalation logic, and grounding rules, then gives the model its personality at the end. Moving the Tone section to the top — immediately after the role statement — gives personality first-read emphasis.

### P2 — README first line is project description, not thesis

File: `README.md:1`

"A prototype AI front desk for a fictional family-owned preschool..." is correct but doesn't make a reader want to keep reading. The writeup's opening — "Parents ask daycare programs the same questions hundreds of times a year. Staff answer them between diaper changes." — is the right first sentence for the README too.

## Open questions for the main thread

1. **Voice-before-format ordering in the system prompt**: intentional (because it performs better at tail position) or unexamined structure that can safely be reordered?
2. **"BrightDesk AI" vs. center attribution**: intentional platform branding or incidental copy?
3. **Parent "P" initials**: would a one-field "What's your name?" prompt at session start hurt the "just ask" framing too much to be worth the warmth?
4. **Post-save affirmation on reply form**: after send, is there a plan for a micro-affirmation ("Your reply is on its way to the parent") or is the amber→resolved state change sufficient?
