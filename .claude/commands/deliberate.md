# deliberate

TRIGGER when: a council or debate produced a verdict that feels suspiciously clean (too-fast consensus) or suspiciously blurred (consensus claimed but reasoning doesn't support it); or the user wants careful scrutiny of any decision standalone (no prior council). Skip yes/no questions, settled matters, and routine choices.

Interrogate a verdict — or a decision — for the reasoning that produced it, not just the conclusion. Two modes: **post-council** and **standalone**. Lawyer's posture: rigorous, evidence-based, willing to say the case is weaker than it looks — or stronger. Standalone speaks to the client in plain language; post-council speaks to other lawyers in the deliberation's technical vocabulary.

## Mode selection

| Context | Mode |
|---|---|
| Invoked on a prior council/debate transcript; user names a session or references a recent verdict | **Post-council** — audit the transcript directly |
| Invoked on a decision with no prior council/debate; user wants scrutiny without full ceremony | **Standalone** — frame and audit in plain language |

If ambiguous, ask once: "Are you asking me to audit a prior council session, or vet a decision from scratch?"

---

## Post-council mode

Audit an existing transcript for reasoning quality. Technical register — the user knows what evaluators, peer reviews, and verdicts are.

### 1. Locate and load the transcript

Find the council transcript (`council-transcript-*.md`) or debate output (`debate-*.md`) in cwd. If the user named a topic but not a file, glob recent transcripts and confirm which one to audit. If no transcript exists but the user references a recent session, ask the user to identify it.

### 2. Audit the deliberation

Audit the transcript against the failure modes below. For each, gather transcript evidence and form a judgment.

**No finding is a valid result for any individual mode, and for the audit as a whole.** The seven modes are a checklist, not a quota. A well-run council produces zero or one findings, not seven. Padding dilutes the strong findings and trains the user to discount the audit. If a mode doesn't apply, say so in one phrase and move on. If nothing material surfaces, the verdict is "Accept" and the audit is short.

1. **Unearned consensus.** Did the verdict claim convergence the evaluator content doesn't support? Each claimed convergence point should appear in 2–3 evaluator responses via *independent reasoning paths* — not similar phrasing. Multiple evaluators reaching the same conclusion via the same reasoning is one path, not many.
2. **Blurred or smoothed consensus.** Did real disagreements get averaged into a centrist verdict instead of adjudicated? Find evaluator responses that took materially different positions; check whether the verdict picked one or split the difference. Splitting the difference is the failure mode `council` was rewritten to prevent.
3. **Dropped dissent.** Did a peer reviewer or evaluator raise a substantive concern the chairman didn't engage? Trace concerns in evaluator or peer-review content absent from the verdict, blind-spots, or risks sections.
4. **Post-hoc driver.** Was the Driver field substantive, or back-filled to match a conclusion the user already wanted? Weak: restated symptom, vague goal, "I've been thinking about this." Strong: specific friction, opportunity, or constraint with concrete shape.
5. **Verdict-content drift.** Does the verdict follow from the evaluator content? The verdict may have absorbed claims no evaluator made, or omitted claims central to the strongest evaluator response.
6. **Misaligned One Thing.** Does "The One Thing to Do First" follow from the verdict and the strongest evaluator content, or is it a generic next step that doesn't engage the reasoning? A misaligned One Thing is often the tell that the chairman defaulted to a template.
7. **Buried strongest point.** Sometimes the strongest evaluator point — the one most likely to change the user's mind — is acknowledged but de-emphasized. Identify the single strongest point from evaluators and peer reviews; check whether the verdict surfaces it proportionally.

### 3. Render an audit

Output exactly this structure. Omit Findings and What the Verdict Got Right when empty; the other sections always render — use "None" for empty Audit Summary bullets.

```
## Headline
[One sentence stating whether the verdict was earned, partially earned, or unearned. Direct.]

## Audit Summary
- **Verdict under review:** [Proceed / Revise / Reject / Insufficient information] — [one phrase of what was recommended]
- **Audit outcome:** [Earned / Partially earned / Unearned / Cannot determine]
- **Strongest concern:** [one phrase naming the biggest issue with the deliberation, or "None" if clean]
- **Strongest defense:** [one phrase naming why the verdict held up, or what specifically was solid]

## Findings
[Per failure mode where evidence was found, one labeled subsection with:
- What the failure mode was
- The specific evidence in the transcript (quote or reference)
- Why it matters for the verdict's reliability]

## What the Verdict Got Right
[Acknowledge what the deliberation did well. Audit is not adversarial — solid reasoning gets noted.]

## Recommendation
One of:
- **Accept the verdict** — audit found no material issues. ≤60 words.
- **Accept with caveats** — verdict stands but specific findings should be considered alongside it. Name them. ≤120 words.
- **Re-run council with a revised Proposal Under Review** — verdict is unsafe to act on; propose specifically what should change (sharper driver, surfaced constraint, different proposal shape). ≤120 words.
- **Re-run council with a different angle** — the proposal was framed but the evaluator lenses missed something. Name what. ≤120 words.
```

### 4. Output

Save two files to cwd and deliver the HTML via `SendUserFile` (status `normal`, caption naming the topic). Capture one timestamp via `date +%Y%m%d-%H%M%S` at the start of this step and reuse for both filenames.

#### `deliberate-audit-[timestamp].md`

Plain Markdown. The audit content from §3, verbatim. No styling.

#### `deliberate-audit-[timestamp].html`

Self-contained — one file, inline `<style>`, no external assets, no scripts. Must render correctly when opened directly in a browser.

Required structure, in order:

1. **Header** — `<h1>` "Council Audit" (or the audited deliberation's topic if known), meta line beneath with date and, if relevant, git branch in `<code>`.
2. **Headline** — large display text, the audit's headline. Flush with the page.
3. **Audit Summary** — compact bordered panel directly under the headline. The four labeled bullets (Verdict under review, Audit outcome, Strongest concern, Strongest defense) as a clean labeled list. Skimmable in ~10 seconds.
4. **Verdict Under Review** — bordered panel containing the original verdict (type and what was recommended). Parallel to council's Proposal Under Review.
5. **Audit Outcome** — the heaviest-styled block. An outcome tag (Earned / Partially earned / Unearned / Cannot determine) styled per outcome, then the recommendation paragraph, then a final highlighted sub-panel naming the concrete next action.
6. **Findings** — `<h3>` per finding; body containing the failure-mode name, transcript evidence (in a `<blockquote>` or quote-styled element), and why it matters. Omit entirely if no failures found.
7. **What the Verdict Got Right** — `<ul>` of points the deliberation handled well. Omit if §3 produced nothing to acknowledge.
8. **Footer** — muted, centered: "Deliberate audit — seven failure modes checked. Re-run `council` with a revised Proposal Under Review if the recommendation calls for it."

Sections 6 and 7 are omitted entirely if §3 produced no content for them.

Required styling:

- Inline `<style>` only. CSS custom properties for theme colors. `@media (prefers-color-scheme: light)` block providing a light-mode palette; default palette is dark.
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Centered content column, `max-width: 880px`, padding `48px 28px 80px`.
- Headline: ≥1.6× body, generous line-height, flush with the page.
- Audit Summary: compact bordered panel with subtle background, slightly tighter line-height.
- Outcome tag: distinct background per outcome (Earned = green-tinted, Partially earned = amber-tinted, Unearned = red-tinted, Cannot determine = muted gray). Audit Outcome block uses a border accent in the matching color.
- Code spans (`<code>`) get a subtle panel background and rounded corners.
- No emoji. No images. No external fonts.

After writing both files, deliver the HTML via `SendUserFile`.

---

## Standalone mode

Vet a decision from scratch with no prior council. Plain-language register — the user isn't steeped in deliberation vocabulary. Speak as a careful lawyer speaks to a client: clear, no jargon, ask what's needed without performing rigor.

### 1. Understand the decision

Ask the user to describe the decision in their own words if they haven't. Then surface, in plain language:

- **What you're deciding** — the choice as the user sees it.
- **Why now** — what's prompting this.
- **What you're leaning toward** — and why, if they've said.
- **What's fixed** — constraints, deadlines, things that can't change.
- **What you've already tried or considered** — if anything.

If the framing is missing a part, ask for it. Don't call it a "Driver" or a "Constraint" — ask in plain language: "What's pushing you to make this choice now?" or "Is there a deadline or budget that limits the options?"

### 2. Ask the questions a careful advisor would ask

Walk the decision with the user, raising considerations they likely haven't surfaced. The goal isn't a verdict — it's making sure the user has considered the right things before deciding.

For each, judge from what the user has shared. Raise the point only when load-bearing for this decision:

- **Is the stated problem the actual problem?** Symptoms get diagnosed as causes more often than they should. If the user named a symptom, surface what else could be causing it.
- **What's the cost of being wrong?** Not "what does this cost" — what does it cost if this turns out to be the wrong call? Reversibility matters more than the user typically prices.
- **What's the cheapest test?** Before committing fully, is there a smaller version that produces information? Spike, pilot, partial rollout, time-boxed trial.
- **Who else does this affect?** Decisions made by one person often have second-order effects on people who weren't consulted.
- **What would change your mind?** If the user can't name a condition under which they'd choose differently, they may not be deciding — they may be rationalizing.
- **Have you done the obvious cheaper thing first?** Process, tool, and structural changes are often the third or fourth intervention. Earlier ones are usually cheaper.

### 3. Render advice

Plain language. No jargon. Structured but conversational.

```
## The Short Version
[One sentence on what the user should consider before deciding, or the strongest pause-point. ≤25 words.]

## Here's What I'd Want You to Think About Before Deciding
[3-5 plain-language paragraphs raising the considerations that matter most for this decision. Each starts with a clear point and explains why it matters. Avoid lists; reads like an advisor talking, not a checklist.]

## What I'd Do First
[One concrete suggestion — usually the cheapest test or the most diagnostic question. ≤50 words.]

## What I'm Not Going to Tell You
[Brief paragraph naming what you can't judge from outside their situation — their team, their tolerance for risk, their personal motivation. Honesty, not hedging.]
```

### 4. Output

Save two files to cwd and deliver the HTML via `SendUserFile` (status `normal`, caption naming the decision). Capture one timestamp via `date +%Y%m%d-%H%M%S` at the start of this step and reuse for both filenames.

#### `deliberate-advice-[timestamp].md`

Plain Markdown. The advice content from §3, verbatim. No styling.

#### `deliberate-advice-[timestamp].html`

Self-contained — one file, inline `<style>`, no external assets, no scripts.

Required structure, in order:

1. **Header** — `<h1>` naming the decision in plain terms, meta line beneath with date and, if relevant, git branch in `<code>`.
2. **The Short Version** — large display text, one sentence, the strongest pause-point. Flush with the page.
3. **The Decision** — bordered panel containing the user's framing from §1.
4. **Here's What I'd Want You to Think About Before Deciding** — main prose panel containing the 3–5 paragraphs of considerations. Body-style text, generous line-height, reads as an advisor talking.
5. **What I'd Do First** — heaviest-styled block. One concrete suggestion. Visually prominent.
6. **What I'm Not Going to Tell You** — muted closing panel acknowledging the limits of outside advice.
7. **Footer** — muted, centered: "Standalone deliberation — careful advice, no verdict. Run `council` if the decision warrants the full protocol."

Required styling:

- Inline `<style>` only. CSS custom properties for theme colors. `@media (prefers-color-scheme: light)` block; default palette dark.
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Centered content column, `max-width: 880px`, padding `48px 28px 80px`.
- The Short Version: ≥1.6× body, generous line-height, flush with the page.
- The Decision: bordered panel with subtle background.
- What I'd Do First: heaviest-styled block, border accent in a single attention color (not tied to a verdict type — standalone renders advice, not a verdict).
- What I'm Not Going to Tell You: muted text color, subtle border or background.
- Code spans (`<code>`) get a subtle panel background and rounded corners.
- No emoji. No images. No external fonts.

After writing both files, deliver the HTML via `SendUserFile`.

---

## Rules

- The audit isn't adversarial. A verdict that holds up under scrutiny gets confirmed, not contested.
- Post-council: every finding cites specific transcript content — quote or paraphrase with attribution. "It seemed like the verdict was weak" is not a finding.
- Standalone: don't adopt council vocabulary (Driver, Proposal Under Review, Lens). Speak in the user's register.
- Don't re-render the verdict. Audit or advise; don't replace the council's job. When a re-run is needed, recommend it — don't perform it inline.
- When post-council finds the verdict unsafe, the recommendation names *what specifically* should change in a re-run, not just "re-run."
- When a standalone question warrants a council, say so and recommend `/council` instead of rushing advice on a high-stakes decision.
