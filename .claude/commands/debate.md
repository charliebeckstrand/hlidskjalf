---
description: Two parties propose and interrogate a decision in turn, then a neutral synthesizer renders the call. Skip yes/no and one-answer questions.
argument-hint: [the question or proposal to debate]
---

## 1. Frame

Read for context (`CLAUDE.md` and referenced files, cap 3 reads). State a brief **Question**: the decision in 1–2 sentences, why now, and any fixed constraints. If it's too vague to frame, ask one clarifying question first.

## 2. Debate (sequential — each call sees every prior turn)

Run four subagent calls in order, each ≤300 words, no preamble:

1. **A proposes** — the strongest concrete case for the *best* path, not the safest. Name the action, the reasoning, the assumed conditions. One path, no hedging.
2. **B interrogates** — engage A's specific claims, quoting where useful: the weakest claim, the unpriced cost, the missing consideration. If A is sound, say so and name the one residual concern. No counter-proposal yet.
3. **B proposes** — having seen the exchange, endorse A's path, endorse it with revisions, or propose a different one. Pick one and defend it.
4. **A interrogates** — engage B's proposal: are the differences (or residual concerns) real and decisive, or change for its own sake? Interrogation only.

## 3. Synthesize

A separate agent — not A or B — gets the full exchange and writes what both would sign, inline (no file):

- **Recommendation** — the path in one paragraph (≤100 words). If they converged, state it; if not, pick the stronger and say why.
- **Disagreement** — the one real remaining split: both sides, which is stronger. Omit if they converged.
- **Do first** — the single next step.

Keep it short when the parties converged — don't pad. If the question turns out to be high-stakes mid-debate, escalate to `/council` instead of rendering a call.