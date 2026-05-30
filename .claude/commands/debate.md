# debate

TRIGGER when: a question deserves scrutiny but doesn't warrant `/council`; the user wants to be rubber-ducked by more than one party; moderate stakes with one or two real tradeoffs; council triage routed here. Skip yes/no questions, factual lookups, and decisions with one obvious answer.

Two parties propose and interrogate in turn — neither locked into a stance, both may endorse the same path. The interrogator engages the proposer's specific claims, not parallel analysis. After two rounds, both write one joint synthesis. Markdown output only.

## Flow

### 1. Frame the question

Read for context: `CLAUDE.md` and files the user referenced. Cap at 3 reads.

Construct a brief **Question Frame**:

- **Question** — 1–2 sentences stating the decision or proposal.
- **Driver** — why now. Ask if the user hasn't said and context doesn't imply.
- **Constraints** — what's fixed (budget, timeline, reversibility, context). Surface explicitly.
- **User's current prior** — what the user leans toward, if stated.

If the question is too vague to frame, ask one clarifying question, then proceed.

### 2. Round 1 — Party A proposes

Spawn Party A as the proposer:

```
You are Party A in a two-party debate. Your role this round: PROPOSER.

QUESTION FRAME:
---
[question, driver, constraints, user's prior]
---

Make the strongest concrete case for the best path forward. Not the safest path — the best one. Be specific: name the action, the reasoning, the assumed conditions. Do not hedge. Do not list options. Pick one and defend it.

If the user's stated prior is the right path, defend it. If it isn't, propose what is.

200-350 words. No preamble.
```

### 3. Round 1 — Party B interrogates

Pass Party A's proposal to Party B as interrogator (in sequence — B must see A's actual response, not produce parallel analysis):

```
You are Party B in a two-party debate. Your role this round: INTERROGATOR.

QUESTION FRAME:
---
[question, driver, constraints, user's prior]
---

PARTY A'S PROPOSAL:
---
[Party A's response]
---

Interrogate Party A's specific proposal. Your job is not to oppose — it is to find the weakest claim, the unsupported assumption, the missing consideration, the unpriced cost. Reference Party A's specific words. Quote where useful.

If Party A's proposal is sound, say so briefly and identify the one residual concern worth tracking. If it's flawed, name the flaw precisely and what would have to be true for the proposal to work.

Do not propose an alternative this round. That is round 2's job.

200-350 words. No preamble.
```

### 4. Round 2 — Party B proposes

Now Party B proposes, having seen Party A's case and their own interrogation:

```
You are Party B in a two-party debate. Your role this round: PROPOSER.

QUESTION FRAME:
---
[question, driver, constraints, user's prior]
---

PARTY A'S ORIGINAL PROPOSAL:
---
[Party A's response]
---

YOUR INTERROGATION OF PARTY A:
---
[Party B's round 1 interrogation]
---

Now propose the best path forward. You may:
- Endorse Party A's proposal as-is (if your interrogation didn't surface a flaw worth changing direction over)
- Endorse Party A's proposal with specific revisions
- Propose a different path entirely

Be specific. Pick one. Defend it. Do not hedge.

200-350 words. No preamble.
```

### 5. Round 2 — Party A interrogates

Pass Party B's proposal to Party A as interrogator:

```
You are Party A in a two-party debate. Your role this round: INTERROGATOR.

QUESTION FRAME:
---
[question, driver, constraints, user's prior]
---

YOUR ORIGINAL PROPOSAL:
---
[Party A's round 1 response]
---

PARTY B'S INTERROGATION OF YOUR PROPOSAL:
---
[Party B's round 1 interrogation]
---

PARTY B'S PROPOSAL:
---
[Party B's round 2 proposal]
---

Interrogate Party B's specific proposal. Same rules as before: find the weakest claim, the unsupported assumption, the missing consideration. Reference Party B's specific words.

If Party B endorsed your original proposal: focus on the residual concerns Party B raised. Are they real? Are they decisive?

If Party B proposed something different: interrogate the specific differences. Is the new path actually better, or is it different for difference's sake?

Do not relitigate your original case. Engage what Party B proposed. Do not propose an alternative — interrogation only.

200-350 words. No preamble.
```

### 6. Joint synthesis

Pass everything to one synthesizer agent:

```
You are the synthesizer for a two-party debate. You have full visibility into both parties' work.

QUESTION FRAME:
---
[question, driver, constraints, user's prior]
---

PARTY A'S PROPOSAL: [response]
PARTY B'S INTERROGATION OF A: [response]
PARTY B'S PROPOSAL: [response]
PARTY A'S INTERROGATION OF B: [response]

Write what both parties would sign if forced to agree on one document.

Output exactly this structure:

## Headline
[One sentence capturing the debate's resolution. ≤25 words.]

## Recommendation
[One paragraph stating the recommended path. ≤100 words. If the parties converged, state the converged path. If not, pick the stronger path and explain why. Direct, no hedging.]

## Where the Parties Agreed
[Bullets. Points both parties accepted, either explicitly or by failing to contest. Omit if there was little agreement.]

## Where the Parties Disagreed
[Real remaining disagreement. State both positions and which is stronger and why. Omit if the parties converged.]

## What to Do First
[One concrete next step. ≤40 words.]

## What Would Change the Recommendation
[1-2 conditions under which the recommendation would flip. Makes the recommendation falsifiable.]
```

### 7. Output

Save one Markdown file to cwd. Capture the filename timestamp via `date +%Y%m%d-%H%M%S` at the start of this step. No HTML; no separate transcript.

#### `debate-[timestamp].md`

Plain Markdown. Sections in order:

1. Original question (verbatim)
2. Question Frame (full block)
3. Round 1: Party A's proposal
4. Round 1: Party B's interrogation
5. Round 2: Party B's proposal
6. Round 2: Party A's interrogation
7. Joint synthesis (Headline, Recommendation, Agreement, Disagreement, What to Do First, What Would Change It)

Deliver the file via `SendUserFile` (status `normal`, caption naming the topic).

## Rules

- The four party calls are sequential. Each must see the prior turn.
- The synthesizer is a separate agent — not Party A, not Party B. Independence matters.
- Neither party is positionally pro or con. Both may endorse the same path.
- The interrogator doesn't propose an alternative in their round.
- When the parties converge with no residual disagreement, keep the synthesis short. Don't pad.
- When the question turns out to be high-stakes mid-debate, the synthesizer escalates to `/council` instead of rendering a final recommendation.
