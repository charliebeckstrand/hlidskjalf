---
description: Interrogate the reasoning behind a verdict or a decision, audit a prior council/debate, or vet a decision from scratch
argument-hint: [a transcript/topic to audit, or a decision to vet]
---

# Deliberate

Interrogate a verdict or a decision. Lawyer's posture: rigorous, evidence-based, willing to say the case is weaker than it looks, or stronger. Two modes, two registers:

- **Post-council.** Audit a prior `council`/`debate` transcript. Technical register; the user knows what evaluators, peer reviews, and verdicts are.
- **Standalone.** Vet a decision with no prior session. Plain-language register; speak as a careful lawyer speaks to a client, not in deliberation jargon.

## Pick the mode

Seed from `$ARGUMENTS` and recent context.

- References a session, a recent verdict, or points at a `council-transcript-*.md` / `debate-*.md`, choose **post-council**.
- A decision with no prior session, choose **standalone**.
- Ambiguous, ask once: "Audit a prior session, or vet a decision from scratch?"

If a standalone decision turns out high-stakes with several competing tradeoffs, recommend `/council` rather than rushing advice.

---

## Post-council mode

### 1. Load the transcript

Find the `council-transcript-*.md` or `debate-*.md` in cwd. If the user named a topic but no file, glob recent transcripts and confirm which. If none exists but the user references a session, ask them to identify it.

### 2. Audit against the failure modes

The seven modes are a checklist, not a quota. **Finding nothing is a valid result.** A clean council yields zero or one, not seven; padding dilutes the real findings. If a mode doesn't apply, say so briefly. If nothing material surfaces, the outcome is Accept.

1. **Unearned consensus.** Verdict claims convergence the evaluators don't support. Each convergence point should appear via 2–3 *independent reasoning paths*, not similar phrasing; the same reasoning repeated is one path.
1. **Blurred consensus.** Real disagreement averaged into a centrist verdict instead of adjudicated. Splitting the difference is the failure council was built to prevent.
1. **Dropped dissent.** A substantive evaluator or peer-review concern the chairman never engaged.
1. **Post-hoc driver.** The Driver back-filled to match a wanted conclusion (restated symptom, vague goal) rather than concrete friction.
1. **Verdict–content drift.** Verdict absorbs claims no evaluator made, or omits the strongest evaluator's central claim.
1. **Misaligned One Thing.** "Do first" is a generic step that doesn't follow from the reasoning; often the tell that the chairman defaulted to a template.
1. **Buried strongest point.** The point most likely to change the user's mind is acknowledged but de-emphasized.

### 3. Render the audit

Omit Findings and What It Got Right when empty; the rest always render (use "None" for empty summary bullets).

- **Headline.** One sentence: verdict earned, partially earned, or unearned.
- **Audit summary.** Four bullets: verdict under review; outcome (Earned / Partially earned / Unearned / Cannot determine); strongest concern (or None); strongest defense.
- **Findings.** Per mode where evidence was found: what the mode was, the specific transcript evidence, why it matters for reliability.
- **What the verdict got right.** Solid reasoning gets noted.
- **Recommendation.** One of: Accept (≤60 words); Accept with caveats (name them, ≤120); Re-run council with a revised Proposal Under Review (name the change, e.g. sharper driver, surfaced constraint, or different shape; ≤120); Re-run with a different angle (name what the lenses missed; ≤120).

### 4. Output

Save `deliberate-audit-[stamp].md` (the §3 content verbatim) and `deliberate-audit-[stamp].html`. See **Report**; the outcome tag colors Earned green / Partially earned amber / Unearned red / Cannot determine gray.

---

## Standalone mode

### 1. Understand the decision

In plain language, surface: what they're deciding; why now; what they're leaning toward and why; what's fixed (deadlines, budget); what they've already tried. Ask for anything missing the way an advisor would ("What's pushing you to decide now?").

### 2. Ask what a careful advisor would ask

Raise a point only when load-bearing for the decision; the goal is that the user has weighed the right things, not a verdict.

- **Is the stated problem the actual problem?** If they named a symptom, surface other causes.
- **What's the cost of being wrong?** Reversibility is usually underpriced.
- **What's the cheapest test?** Spike, pilot, partial rollout, or time-box before committing fully.
- **Who else does this affect?** Second-order effects on people not consulted.
- **What would change your mind?** If they can't name a condition, they may be rationalizing, not deciding.
- **Done the obvious cheaper thing first?** Process, tool, and structural fixes usually precede the expensive intervention.

### 3. Render advice

- **The short version.** One sentence: the strongest pause-point (≤25 words).
- **What I'd want you to think about before deciding.** 3–5 plain paragraphs, each leading with a point and why it matters; reads like an advisor talking, not a checklist.
- **What I'd do first.** One concrete suggestion, usually the cheapest test or most diagnostic question (≤50 words).
- **What I'm not going to tell you.** What you can't judge from outside: their team, risk tolerance, motivation. Honesty, not hedging.

### 4. Output

Save `deliberate-advice-[stamp].md` (the §3 content verbatim) and `deliberate-advice-[stamp].html`. See **Report**; "What I'd do first" uses a single attention accent, not a verdict color.

---

## Report

Run `date +%Y%m%d-%H%M%S` once per invocation; reuse for both filenames. The HTML is one self-contained file (inline `<style>`, no scripts, no external assets), rendering in order: header (topic and date, git branch in `<code>` if relevant); headline as large display text flush with the page; the summary / short-version panel; the input under review in a bordered panel (the verdict, or the user's decision framing); the heaviest-styled block (audit outcome + recommendation, or "what I'd do first") with its accent per mode; the mode's remaining sections (findings + what it got right, or the considerations); muted footer pointing back to `council` for a re-run or the full protocol.

Styling: dark palette by default with a `prefers-color-scheme: light` block; centered column, max-width ~880px; system font stack; headline ≥1.6× body; subtle panel backgrounds for `<code>` and bordered panels; the outcome or attention tag carries its accent color. No emoji, no images.

Deliver the HTML via `SendUserFile` (status `normal`, caption naming the topic).

## Principles

- The audit isn't adversarial. A verdict that holds up gets confirmed, not contested.
- Post-council cites specific transcript content for every finding; "it seemed weak" is not a finding.
- Standalone stays in the user's register. No Driver, Proposal Under Review, or Lens.
- Audit or advise; don't re-render the verdict. When a re-run is needed, recommend what specifically should change. Don't perform it inline.
