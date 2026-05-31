---
description: Two parties propose and interrogate a question over two rounds, then jointly synthesize a recommendation
argument-hint: [the question or X-or-Y to debate]
---

# Debate

Two parties take turns proposing a path and interrogating each other's proposal — sequential, not parallel, so each turn answers the actual prior turn. Neither is locked to a stance; both may endorse the same path. After two rounds a separate synthesizer writes a joint recommendation.

## 1. Pre-flight

You were invoked deliberately, so proceed by default. Handle first, in one line:

- **`$ARGUMENTS` is too vague to frame** → ask one clarifying question, then proceed.
- **Trivial or one obvious answer** → say so and offer a direct answer instead, but run the debate if the user still wants it.
- **High-stakes with several competing tradeoffs** → suggest `/council` instead.

## 2. Frame the question

Seed from `$ARGUMENTS` and the recent conversation. Read for context (cap 3 reads), then state a **Question Frame**:

- **Question**: 1–2 sentences; the decision or proposal
- **Driver**: why now; ask only if context can't supply it
- **Constraints**: what's fixed — budget, timeline, context
- **Current prior**: what the user leans toward, if stated

## 3. The debate (sequential)

Four turns. Spawn each after the prior completes, and give it everything before it. Every turn gets the **Question Frame**. Roles alternate; 200–250 words, no preamble.

| Turn | Agent · Role     | Brief |
| ---- | ---------------- | ----- |
| 1    | A · proposer     | Strongest concrete case for the *best* path, not the safest. Name the action, the reasoning, the assumed conditions. One path, no hedging, no option lists. Defend the user's prior if it's right; propose better if it isn't. |
| 2    | B · interrogator | Interrogate A's specific claims, not a strawman — weakest claim, unsupported assumption, missing consideration, unpriced cost. Reference A's words. If sound, say so and name the one residual concern. Propose no alternative this round. |
| 3    | B · proposer     | Having seen A's case and your own interrogation, propose the best path: endorse A as-is, endorse with specific revisions, or propose a different path. |
| 4    | A · interrogator | Interrogate B's proposal. If B endorsed yours, are the residual concerns real and decisive? If B diverged, is the new path actually better or just different? Engage B's words, not a strawman; don't relitigate your own case; propose no alternative. |

## 4. Synthesis

Spawn a separate synthesizer — not A, not B; independence is key — with all four turns. It writes what both parties would sign if forced to agree on a document:

- **Headline**: one sentence resolving the debate (≤25 words).
- **Recommendation**: one paragraph (≤100 words): the path. If they converged, state it; if not, pick the stronger and say why. No hedging.
- **Where the parties agreed**: points both accepted or left uncontested; omit if little agreement.
- **Where the parties disagreed**: real remaining disagreement — both positions, which is stronger and why; omit if they converged.
- **What to do first**: one concrete next step (≤40 words).
- **What would change the recommendation**: 1–2 conditions that would flip it.

If the debate reveals the question is genuinely high-stakes, the synthesizer escalates to `/council` instead of rendering a final recommendation.

## 5. Output

Run `date +%Y%m%d-%H%M%S` once for the stamp. Save **`debate-[stamp].md`** to cwd — plain markdown, in order: 

1. the question verbatim
2. the **Question Frame**
3. the four turns under their labels
4. the synthesis
  
Deliver via `SendUserFile`.

## Principles

- **Sequential, not parallel:** each turn must see the prior. The interrogator engages specific claims, not parallel analysis.
- **The synthesizer is a third agent**.
- **Neither party is positionally pro or con:** both may endorse the same path.
- **The interrogator proposes no alternative**.
- **When the parties converge** with no residual disagreement, keep the synthesis short — don't pad.
