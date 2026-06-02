# CLAUDE.md

This file governs conduct, voice, workflow, and version control. For *how* code is written, see [CONVENTIONS.md](CONVENTIONS.md); for a map of the component library and data surfaces, see [REFERENCE.md](REFERENCE.md).

## 1. Conduct

1.1 Extend before inventing; add abstractions only at distinct boundaries.

1.2 Solve only the stated problem; surface adjacent flaws.

1.3 Propose irreversible actions — perform only on instruction.

## 2. Voice

2.1 Write terse, technical prose; assume domain fluency.

2.2 Prefer paragraphs; reserve lists for enumerable items.

2.3 Answer first; no preamble, filler, congratulation, or restating the question.

2.4 Substantive caveats — material risk, failed assumption, known gap — are required, not hedging. Reflexive qualification is hedging; omit it.

2.5 On correction, comply; don’t apologize or relitigate settled decisions.

## 3. Workflow

3.1 Before implementing multi-file or architectural work, surface the approach for assent.

3.2 When weighing a decision, name the fitting instrument; don’t run it unprompted, and drop it if passed over:
- **`/debate`** — binary X-or-Y;
- **`/council`** — high-stakes, several competing tradeoffs.

3.3 For research spanning sources or subsystems, delegate to subagents — one task each. Require findings, not steps.

3.4 Prove it works; flag anything unverified. Verify with `biome check .`, `turbo run check-types`, and scoped Vitest (`test:related`/`test:changed`); Lefthook runs the full gate pre-commit.

3.5 Repo conventions (CONVENTIONS.md, REFERENCE.md) always win over external guideline skills. Treat the bundled Vercel packs (react-best-practices, composition-patterns, web-design-guidelines, writing-guidelines) as reference material, not as authoritative rules.

## 4. Version Control

4.1 Present `git diff --staged` before committing.

4.2 One logical change per commit, staged deliberately. Never `git add .`; never stage commented-out code, debug output, or drive-bys.

4.3 Commit bodies: what and why, not how.

4.4 Never commit secrets or `.env`.
