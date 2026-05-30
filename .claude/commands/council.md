# council

TRIGGER when: council, war-room, evaluate, or pressure-test a concrete proposal or decision; "should I X or Y", "which option", "what would you do", "I'm torn"; or plan mode is active for non-trivial work (3+ steps, multiple viable approaches, real tradeoffs). Skip yes/no questions, factual lookups, reversible low-stakes choices, and planning where the path is obvious.

Five evaluators examine one concrete proposal through different lenses, peer-review anonymously, then the chairman renders a verdict. No assigned stances. Chairman may side with a minority when its reasoning is stronger.

## Flow

### 1. Triage

| Signal | Action |
|---|---|
| Obvious answer, cheaply reversible, low blast-radius, or pure factual lookup | Skip; answer directly |
| Too vague to extract a proposal | Ask one clarifying question; re-triage |
| Moderate stakes, 1–2 real tradeoffs, or rubber-duck request | Route to `/debate`; say why |
| High stakes, non-obvious tradeoffs, low reversibility, or affects parties beyond the user | Continue to §2 |

### 2. Frame the proposal

Read for context: `CLAUDE.md`, files the user referenced, the most recent `council-transcript-*.md` in cwd if relevant. Cap at 5 reads.

Construct a **Proposal Under Review** with every part:

- **Proposal** — 1–3 sentences. Concrete, not topical.
- **Driver** — the specific friction, opportunity, or goal. *Why now, why this?* Ask if the user hasn't said and context doesn't imply.
- **Key assumption** — the central claim. If wrong, the proposal fails.
- **Success criterion** — what observably happens if this works.
- **User's current prior** — what the user leans toward, in their framing.
- **Constraints** — budget, timeline, reversibility, what's been tried, team/context. Surface explicitly.

If the user brought a vague question, draft the proposal yourself and confirm in one message before convening. The user can amend.

### 3. Convene evaluators (parallel)

Spawn all 5 evaluators in parallel. Each examines the same Proposal Under Review through one lens:

| Lens | Question |
|---|---|
| **Assumption** | Is the central assumption true? What would have to be the case for it to hold? What evidence supports or undermines it? |
| **Failure-mode** | Where does this break under real conditions? Most likely way it fails, worst way it fails? |
| **Cost** | What does this cost in time, attention, reversibility, opportunity, second-order obligations? Priced correctly? |
| **Counterfactual** | Nearest alternative path? Why is the proposal better than that, or is it? |
| **Second-order** | If this works, what becomes true downstream? Unlocked, foreclosed, forced? |

Each evaluator gets:

```
You are the [Lens Name] evaluator on a Council reviewing a concrete proposal.

Your lens: [lens description above]

You are not positionally pro or con. You are evaluating the proposal through your lens. If your lens reveals the proposal is sound, say so. If it reveals problems, say so. Engage the proposal as it actually is, not as a strawman.

PROPOSAL UNDER REVIEW:
---
[full Proposal Under Review block, including constraints]
---

Respond through your lens. Be direct and specific. Engage the constraints — do not float free of them. If your lens has little to add for this proposal, say so briefly rather than inventing concerns.

150-300 words. No preamble.
```

### 4. Peer review (parallel)

Anonymize the 5 responses as A–E. Record the A–E → Lens mapping before spawning reviewers; reuse it verbatim in §6's transcript. Spawn 5 reviewers in parallel:

```
Five evaluators reviewed this proposal through different lenses:

PROPOSAL UNDER REVIEW:
---
[full Proposal Under Review block]
---

**Response A:** [response]
**Response B:** [response]
**Response C:** [response]
**Response D:** [response]
**Response E:** [response]

Answer, referencing responses by letter:

1. Which response is most useful? Why?
2. Which response has the biggest blind spot or weakest reasoning? What is it missing?
3. Did any evaluator fail to engage the stated constraints? Which one and how?
4. What did all five miss?

<250 words. Be direct.
```

### 5. Chairman verdict

One agent gets the framed proposal, all 5 de-anonymized evaluator responses, and all 5 peer reviews:

```
You are Chairman of a Council. Your job is to render a verdict on the proposal, not to synthesize opinions.

PROPOSAL UNDER REVIEW:
---
[full Proposal Under Review block]
---

EVALUATOR RESPONSES:
**Assumption:** [response]
**Failure-mode:** [response]
**Cost:** [response]
**Counterfactual:** [response]
**Second-order:** [response]

PEER REVIEWS:
[all 5 reviews]

Render a verdict. Your verdict is one of:

- **Proceed** — the proposal is sound. Name any risks worth monitoring.
- **Revise** — the proposal has the right shape but needs specific changes. Name them.
- **Reject** — the proposal should not proceed. Name what should replace it.
- **Fork** — the deliberation surfaced two viable paths (A and B) that depend on a stable user attribute the council cannot observe from outside (risk tolerance, team composition, established workflow). Name both paths, name the deciding attribute, and give the user a concrete way to determine which path applies. Use sparingly. If the deciding factor is information the user could gather in a single lookup, prefer "Insufficient information" with a request for that information.
- **Insufficient information** — the proposal cannot be evaluated as stated. Name what's missing.

Rules:
- Side with a minority view when the minority's reasoning is stronger. Don't honor positions for their own sake.
- If evaluators converged, state convergence. Don't manufacture disagreement.
- If evaluators disagreed on something real, state the disagreement and which side is stronger.
- Don't produce a "both sides" verdict. Pick one — unless the deliberation genuinely surfaced a Fork.
- Engage the constraints. A verdict that floats free of the user's situation is not a verdict.

Output exactly this structure, omitting any section that does not apply. Headline, Cliff Notes, Verdict, and One Thing together must be readable in under a minute — keep them tight. Supporting sections can be longer.

## Headline
[One sentence capturing the entire deliberation. ≤25 words. Should land even without reading anything else.]

## Cliff Notes
3-5 labeled bullets condensing the report. Each ≤15 words.

- **Verdict:** [one phrase]
- **Why:** [one phrase naming the strongest convergence or deciding consideration]
- **Watch for:** [one phrase naming the biggest risk or blind spot]
- **Do first:** [one phrase naming the next action]
- **If condition X:** [optional — if the verdict has a reframe path, name it]

## Verdict
[Proceed / Revise / Reject / Fork / Insufficient information, then one paragraph stating the verdict and why. Direct, no hedging. ≤120 words (≤180 for Fork). If a reframe of the proposal would warrant a different verdict, name it in one sentence.]

## The One Thing to Do First
[One concrete next step. Not a list. ≤40 words. If a peer reviewer flagged this prescription as underspecified, acknowledge inline rather than burying the caveat in blind spots.]

---

## Where the Council Converged
[Points where multiple evaluators independently reached the same conclusion. Omit if no meaningful convergence.]

## Where the Council Disagreed
[Real disagreements worth surfacing. State both sides and which is stronger and why. Omit if none.]

## Blind Spots Peer Review Caught
[What only emerged in anonymous review. Omit if peer review surfaced nothing material.]

## Risks to Monitor
[Specific risks the user should track. Only if verdict is Proceed or Revise.]

## Falsifiable Predictions
[1-2 predictions the verdict implies, in the form "If you do X, by Y you will observe Z."]
```

### 6. Report + transcript

Save two files to cwd and deliver the HTML via `SendUserFile` (status `normal`, caption naming the topic). Capture one timestamp at the start of this step via `date +%Y%m%d-%H%M%S`; reuse for both filenames.

#### `council-transcript-[timestamp].md`

Plain Markdown. Sections in order: original question (verbatim); Proposal Under Review (full block, driver and constraints included); anonymization mapping table (Letter → Lens); each evaluator's full response under their lens name; each peer review under its number; chairman's full output (Headline, Cliff Notes, Verdict, One Thing, every supporting section that applied). No styling.

#### `council-report-[timestamp].html`

Self-contained — one file, inline `<style>`, no external assets, no scripts. Must render directly in a browser.

Required structure, in order:

1. **Header** — `<h1>` with the topic, meta line beneath with date and (if relevant) git branch in `<code>`.
2. **Headline** — large display text, the chairman's headline. Flush with the page, minimal chrome.
3. **Cliff Notes** — compact bordered panel directly under the headline. Renders the chairman's Cliff Notes as a clean labeled list. Skimmable in ~10 seconds, copy-pasteable.
4. **Proposal Under Review** — bordered panel containing the full proposal block.
5. **Verdict** — the most prominent block on the page. A verdict tag (Proceed / Revise / Reject / Fork / Insufficient information) styled per verdict type, then the chairman's verdict paragraph, then a final highlighted sub-panel for "The one thing to do first." For Fork verdicts, replace the verdict paragraph with two side-by-side sub-panels (one per path) with the deciding factor displayed between them.
6. **Council shape** — a compact visualization of how the five evaluators landed:
    - **High convergence** (≥4 evaluators converged): a single tag-style panel naming the convergence. No bars. The convergence *is* the shape.
    - **Proceed** / **Reject** without high convergence: horizontal bars per evaluator showing favorability (0% strongly against → 100% strongly for). Single neutral gradient; don't pre-color dissenters.
    - **Revise**: compact two-column table — one row per evaluator, columns "Reading" (one phrase) and "Lever" (the specific thing they'd change).
    - **Fork**: two-column table — one row per evaluator, columns "Leans toward" (path A, path B, or undecided) and "Why."
    - **Insufficient information**: omit entirely.

   Beneath whichever variant rendered, one sentence describing the shape of the deliberation.
7. **Where the Council Converged** — `<ul>` of convergence points. Omit if the verdict had no convergence section.
8. **Where the Council Disagreed** — `<h3>` per disagreement, two paragraphs (both sides), plus a muted-color sentence on which side is stronger and why. Omit if no disagreement section.
9. **Blind Spots Peer Review Caught** — `<ul>`. Omit if no blind-spots section.
10. **Risks to Monitor** — `<ul>`. Omit if no risks section.
11. **Falsifiable Predictions** — `<ul>` in the form "If X, by Y, Z."
12. **Evaluator Responses** — five `<details>` panels, collapsed. Each `<summary>` shows a `<span class="tag">` with the lens name (uppercase, letter-spaced) and a one-line gist. Body is the evaluator's response, lightly formatted.
13. **Peer Reviews** — one `<details>` panel, collapsed, containing all five reviews under `<h3>Reviewer N</h3>` headers.
14. **Footer** — muted, centered: "Council session — 5 evaluators, 5 anonymous peer reviews, 1 chairman verdict. Run `deliberate` on this transcript if the verdict needs interrogation."

Omit sections 7–10 when the chairman's verdict did not include them. The report reflects the actual shape of the deliberation, not a fixed template.

Required styling:

- Inline `<style>` only. CSS custom properties for theme colors. `@media (prefers-color-scheme: light)` block providing a light-mode palette; default palette is dark.
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Centered content column, `max-width: 880px`, padding `48px 28px 80px`.
- Headline: ≥1.6× body size, generous line-height, sits flush with the page.
- Cliff Notes: compact bordered panel with subtle background, slightly tighter line-height.
- Verdict tag: distinct background per verdict type (Proceed = green-tinted, Revise = amber-tinted, Reject = red-tinted, Fork = blue-tinted, Insufficient = muted gray). Verdict block uses a border accent in the matching color and is the heaviest-styled block on the page. For Fork, the verdict block contains two clearly-separated sub-panels (one per path) with the deciding factor highlighted between them.
- `<details>` panels: bordered, rounded, custom `+`/`−` indicator on the right of the summary (suppress the default marker via `summary::-webkit-details-marker { display: none }` and `list-style: none`). Body separated from summary by a top border.
- Code spans (`<code>`) get a subtle panel background and rounded corners.
- No emoji. No images. No external fonts.

After writing both files, deliver the HTML via `SendUserFile`.

## Rules

- Spawn evaluators and reviewers in parallel.
- Anonymize before peer review. Reviewers must not know which lens produced which response.
- The chairman renders a verdict; override the majority when the minority's reasoning is stronger.
- Don't manufacture disagreement. If the council converged, the verdict reflects that.
- Don't manufacture consensus. Surface and adjudicate real disagreements; don't average them.
- Triage out questions the protocol doesn't fit. Route to `/debate` when scrutiny is warranted but ceremony isn't.
- If the question can't be reduced to a concrete proposal, don't convene. Ask for what's missing.
