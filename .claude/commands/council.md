---
description: Convene a small council to pressure-test a decision and render a verdict
argument-hint: [the decision or proposal to review]
---

Several evaluators examine a proposal through different lenses; a chairman weighs them and rules — not by majority, but on the strongest reasoning. Evaluators run in parallel via subagents.

## 1. Frame

Seed from `$ARGUMENTS` and the recent conversation (read for context, cap 5 reads). State a short **Proposal**: the decision in 1–2 concrete sentences, why now, and the one assumption that sinks it if false.

If `$ARGUMENTS` is too vague to state as a proposal, ask one clarifying question first. If the call is trivial or reversible, say so and offer to just answer instead.

## 2. Convene (parallel)

Spawn four evaluators at once, each with the full proposal and one lens. Each gives a verdict-relevant take in ≤150 words; if its lens adds nothing, it says so rather than inventing concerns.

- **Assumption** — is the load-bearing assumption true? what has to hold?
- **Failure-mode** — where does this break under real conditions?
- **Cost** — true cost in time, attention, reversibility, opportunity.
- **Counterfactual** — the nearest alternative; is the proposal actually better?

## 3. Verdict

Give one agent the proposal and all four takes. It renders a verdict, not an average, and may side with a lone strong argument. Deliver inline, no files:

- **Call** — Proceed / Revise / Reject / Fork / Insufficient info, in one sentence.
- **Why** — one short paragraph (≤100 words); name the real disagreement if one mattered.
- **Do first** — the single next step.

Boundaries: **Revise** keeps the core and adjusts it; **Reject** discards it and names the replacement; **Fork** when two paths hinge on something only the user knows (name both and the deciding factor); **Insufficient info** when it can't be judged as stated (name what's missing).