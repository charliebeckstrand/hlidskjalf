---
description: Convene a five-lens review board to pressure-test a decision and render one verdict
argument-hint: [the decision or proposal to review]
---

# Council

Five evaluators examine one proposal through different lenses, peer-review each other blind, then a chairman renders one verdict. No assigned stances — each evaluator follows where its lens leads, and the chairman may side with a minority when its reasoning is stronger.

Runs evaluators and reviewers in parallel via subagents; needs a filesystem and `SendUserFile`.

## 1. Pre-flight

You were invoked deliberately, so convene by default. Handle two exceptions in one line first:

- **`$ARGUMENTS` is too vague to state as a proposal** → ask one clarifying question, then convene.
- **The call is genuinely trivial or freely reversible** → say so and offer to just answer instead, but proceed with the full council if the user still wants it.

## 2. Frame the proposal

Seed from `$ARGUMENTS` and the recent conversation. Read for context (cap 5 reads): `CLAUDE.md`, files the user named, the latest `council-transcript-*.md` in cwd if relevant. Then state a **Proposal Under Review**:

- **Proposal** — 1–3 concrete sentences (a decision, not a topic).
- **Driver** — the specific friction or goal; why now, why this.
- **Key assumption** — the load-bearing claim; if it's false, the proposal fails.
- **Success criterion** — what's observably true if it works.
- **Current prior** — what the user leans toward, in their words.
- **Constraints** — budget, timeline, reversibility, what's been tried, team.

If the user came in vague, draft this yourself and confirm in one message before convening. Ask for the driver or constraints only if context can't supply them.

## 3. Convene (parallel)

Spawn all five at once. Give each the full Proposal Under Review and one lens below. Tell each: you are not pro or con — evaluate through your lens, engage the constraints as written rather than a strawman, and if your lens adds little here, say so briefly instead of inventing concerns. 150–300 words, no preamble.

| Lens               | Question                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **Assumption**     | Is the key assumption true? What would have to hold? What evidence cuts each way?                  |
| **Failure-mode**   | Where does this break under real conditions — most likely failure, worst failure?                 |
| **Cost**           | True cost in time, attention, reversibility, opportunity, second-order obligations — priced right? |
| **Counterfactual** | The nearest alternative path. Is the proposal actually better than it?                             |
| **Second-order**   | If it works, what becomes true downstream — unlocked, foreclosed, forced?                          |

## 4. Peer review (blind, parallel)

Label the five responses A–E and record the letter→lens map (reuse it verbatim in the transcript). Spawn five reviewers; give each the proposal and all five *anonymized* responses — they must not know which lens wrote what. Each answers, by letter: most useful response and why; biggest blind spot or weakest reasoning; any evaluator that ignored the stated constraints; what all five missed. Under 250 words.

## 5. Chairman verdict

Give one agent the proposal, all five de-anonymized responses, and all five reviews. It renders a verdict — it does not average opinions. Side with a minority when its reasoning is stronger; state convergence where it's real; manufacture neither agreement nor disagreement. Pick exactly one:

- **Proceed** — sound; name risks worth monitoring.
- **Revise** — right shape, needs specific named changes.
- **Reject** — shouldn't proceed; name what replaces it.
- **Fork** — two viable paths hinge on a stable user attribute the council can't observe (risk tolerance, team, existing workflow). Name both paths, the deciding attribute, and how the user can tell which applies. Use sparingly — if a single lookup would decide it, use Insufficient information instead.
- **Insufficient information** — can't be evaluated as stated; name what's missing.

Output the sections below, omitting any that don't apply. Keep Headline, Cliff Notes, Verdict, and One Thing readable in under a minute:

- **Headline** — one sentence (≤25 words) that lands on its own.
- **Cliff Notes** — 3–5 labeled bullets (≤15 words each): Verdict, Why, Watch for, Do first, and an optional If-condition reframe.
- **Verdict** — the call plus one tight paragraph (≤120 words; ≤180 for Fork). If a reframe would flip it, say so in one sentence.
- **The one thing to do first** — a single concrete next step (≤40 words).
- **Where the council converged / disagreed** — only where real; for disagreements, give both sides and which is stronger.
- **Blind spots peer review caught** — only if review surfaced something the evaluators didn't.
- **Risks to monitor** — Proceed/Revise only.
- **Falsifiable predictions** — 1–2, as "If you do X, by Y you'll observe Z."

## 6. Deliver

Run `date +%Y%m%d-%H%M%S` once; use that stamp for both filenames in cwd.

**`council-transcript-[stamp].md`** — plain markdown, in order: the question verbatim; the full Proposal Under Review; the letter→lens table; each evaluator's full response under its lens name; each peer review; the chairman's full output.

**`council-report-[stamp].html`** — one self-contained file (inline `<style>`, no scripts, no external assets), in this order:

1. Header — topic and date, git branch in `<code>` if relevant.
1. Headline — large display text, flush with the page.
1. Cliff Notes — compact bordered panel, skimmable in ~10 seconds.
1. Proposal Under Review — bordered panel.
1. Verdict — the heaviest-styled block: a tag colored by type (Proceed green, Revise amber, Reject red, Fork blue, Insufficient gray), the verdict paragraph, then a highlighted "one thing to do first" beneath. Fork instead shows two side-by-side path panels with the deciding factor between them.
1. Council shape — a compact view of how the five landed: ≥4 converged → one tag panel naming the convergence; Proceed/Reject → favorability bars on a single neutral gradient; Revise → table of reading + lever per evaluator; Fork → table of lean + why; Insufficient → omit. One sentence beneath describing the shape.
1. Then any of converged / disagreed / blind spots / risks that applied, as lists.
1. Falsifiable predictions — list.
1. Five collapsed `<details>` for evaluator responses (summary = lens tag + one-line gist); one collapsed `<details>` holding all peer reviews; muted footer.

Styling: dark palette by default with a `prefers-color-scheme: light` block; centered column, max-width ~880px; system font stack; subtle panel backgrounds for `<code>` and `<details>`; suppress default `<details>` markers in favor of a `+`/`−` indicator. No emoji, no images.

Deliver the HTML via `SendUserFile` (status `normal`, caption naming the topic).

## Principles

- Anonymize before peer review — the blind step is what makes it honest.
- The chairman decides; the majority doesn't automatically win.
- Report the real shape of the deliberation, not a fixed template — omit sections that didn't fire.
- If the question can't be reduced to a concrete proposal, don't convene; ask for what's missing.
