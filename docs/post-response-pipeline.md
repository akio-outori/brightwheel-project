# Post-Response Pipeline

## Purpose

The post-response pipeline runs **after the LLM produces a draft
answer** and **before the parent sees it**. Six deterministic
channels inspect the draft in short-circuit order. If any channel
holds, the parent sees a stock "a staff member is reviewing this"
response. The model's original draft is preserved in the
needs-attention feed for the operator.

## Architecture

Stacked deterministic channels that each compute evidence for
whether an LLM output is grounded in provided source material,
running in short-circuit order (first hold wins).

Location: `lib/llm/post-response/`

```
draft (AnswerContract)
  │
  ├─ hallucination channel → cited IDs must exist
  ├─ self-escalation channel → model said escalate=true
  ├─ coverage channel → both citation lists empty
  ├─ medical-shape channel → directive patterns in answer
  ├─ numeric channel → every number must trace to a source
  └─ entity channel → every proper name must trace to a source
  │
  ├─ ALL PASS → return draft to parent
  └─ ANY HOLD → return stock response, log draft for operator
```

## Channel details

### 1. Hallucination (`channels/hallucination.ts`)

Every ID in `cited_entries` and `directly_addressed_by` must exist
in the union of entries + overrides. A fabricated ID means the
model is citing a source that isn't real — the most dangerous
failure mode for a grounded front desk.

### 2. Self-escalation (`channels/self-escalation.ts`)

If the model set `escalate: true`, the pipeline respects it and
routes to the operator. The model has already said "a human should
see this." Trust-loop philosophy: an escalating model is not an
authority on what the parent should see; that decision belongs to
the operator.

### 3. Coverage (`channels/coverage.ts`)

Holds when **both** `cited_entries` and `directly_addressed_by`
are empty arrays. This is the "the model has nothing grounded to
say" signal. If the model cited any source (even with empty
`directly_addressed_by`), the answer passes — the hallucination
channel already verified the cited IDs are real.

Design note: an earlier version held on empty
`directly_addressed_by` alone, but this over-fired on legitimate
hedged answers like "Our hours vary by center, but most open
between 7 and 8 am" where the model cites a source but can't
claim it directly answers the specific question.

### 4. Medical-shape (`channels/medical-shape.ts`)

Detects the model directing the parent to take a specific action
on their child's body or health. Fires on the model's **output
shape**, not on the parent's **input topic**:

- `give (your child|him|her) [medication]`
- `keep (your child|him|her) home for N hours/until...`
- `take (your child|him|her) to (the ER|hospital|doctor)`
- Dosage literals (`N mg`, `N ml`)
- Scheduled dosing near medication words

Does NOT fire on policy paraphrases like "Per licensing
regulations, keep children at home if they have..." — the subject
is "children" (third person, general) not "your child" (directed
at the parent).

The bare `call 911` pattern was evaluated and removed — it
over-fires on policy text like "staff will call 911 if needed."
The self-escalation channel catches real emergency cases.

### 5. Numeric (`channels/numeric.ts`)

Every numeric literal in the draft (phone numbers, dollar amounts,
temperatures, percentages, bare integers) must appear verbatim in
the full document corpus. Checked against **all sources** (entries
+ overrides), not just cited sources.

Canonicalization strips `$`, `°F`, dashes, and commas so
"505-767-6500" and "5057676500" both match.

### 6. Entity (`channels/entities.ts`)

Capitalized multi-word phrases and long single capitalized words
must trace to the document. Handles hyphens (Pre-K), all-caps
acronyms (DCFD, NAEYC), and sentence/bullet-initial words. Falls
back to token-level matching when the exact phrase doesn't appear
verbatim but all component words do.

Checked against all sources, not just cited — a model that cites
`food-allergies` and mentions "Head Teacher" (present in many
entries) is grounded.

## The disabled lexical channel

`channels/lexical.ts` implements a token-recall grounding check.
It tokenizes the draft answer and the cited source bodies,
computes the fraction of answer tokens that appear in any cited
source, and holds when recall drops below a threshold.

**It is intentionally disabled.** Empirical testing showed
legitimate paraphrased answers clustering in the 0.28–0.53 recall
range — overlapping with partial hallucinations. At any threshold
that catches real fabrication, the channel also holds legitimate
grounded answers where the model naturally uses words like "open",
"between", "find" that aren't literally in the source body. The
code and unit tests remain on disk for reactivation with a
stronger metric (stemmed BM25 or answer-against-question union).

## Stock response

When any channel holds, `stock-response.ts` builds the
`AnswerContract` the parent sees:

```json
{
  "answer": "Thanks for asking — I want to make sure you get the right answer. A staff member is taking a look...",
  "confidence": "low",
  "escalate": true,
  "escalation_reason": "held_for_review:{channel_reason}"
}
```

The `held_for_review:` prefix lets the operator UI render a
specific badge for each hold type. The model's original draft is
written to needs-attention with the same prefix so the operator
knows why the pipeline flagged it.

## Hold reasons

| Reason | Meaning |
|--------|---------|
| `hallucinated_citation` | Model cited an ID that doesn't exist |
| `model_self_escalated` | Model set `escalate: true` |
| `no_direct_coverage` | Both citation lists empty |
| `medical_instruction` | Model directed parent to take medical action |
| `fabricated_numeric` | Number in answer not in any source |
| `fabricated_entity` | Named entity in answer not in any source |
| `specific_child_question` | Preflight caught a specific-child question |

## Key files

- `lib/llm/post-response/pipeline.ts` — orchestrator
- `lib/llm/post-response/channels/*.ts` — one file per channel
- `lib/llm/post-response/stock-response.ts` — stock response builder
- `lib/llm/post-response/types.ts` — `Channel`, `ChannelVerdict`, `PipelineResult`
- `app/api/ask/route.ts` — where the pipeline is called (after the LLM)
