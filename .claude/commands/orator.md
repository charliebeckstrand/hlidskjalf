# orator

TRIGGER when: polish, compose, refine, or rewrite prose.

Polish language, not facts. Match the project's voice.

## Arguments

$ARGUMENTS

Recognized hints:

- Path → refine mode; polish prose under that scope.
- Surface hint (`comments`, `docstrings`, `readme`, `commit`, `pr`, `release-note`) → refine only that surface.
- Natural-language brief → compose mode; write fresh prose.
- `--dry-run` → emit the diff inline without writing.

Ask one specific clarifying question if no target resolves from context.

---

## 0. Manifest

Read `./manifest.json`. If missing, halt with a pointer to `/repo:manifest`.

Pull:

- `packages[*].path`, `packages[*].name`.
- `conventions.files`, `conventions.principles`, `conventions.vocabularyGlossary`.

---

## 1. Rule set

Pick by target path:

| Target | Rule set |
|---|---|
| File under `.claude/commands/`, or `CLAUDE.md` / `AGENTS.md` anywhere in the repo | §3 shared + §3b skill-file |
| Code comments, docstrings | §3 shared + §3a human-prose |
| Commits, PRs, READMEs, design docs, release notes, any other `*.md` | §3 shared + §3a human-prose |
| In-conversation prose with no path context | §3 shared only |

Ambiguous target: apply §3 alone — half-applying §3a or §3b is wrong. Directory target spanning kinds: resolve per file.

---

## 2. Sample the voice

Read, in order:

1. `CLAUDE.md` and any file in `conventions.files`. Declared rules win every tie.
2. 2–3 sibling artifacts — comments inside the file, READMEs for a README task, `git log --pretty=%B -n 20` for commits, skill files for skill-file work.
3. `conventions.vocabularyGlossary`. Preserve glossary terms unaltered.

Lock: register, tense, sentence rhythm, punctuation, capitalization, vocabulary, markdown idioms. Skill-file targets: also lock structural shape — TRIGGER preamble, numbered `## N.` steps, `## Arguments`, `## Rules` footer.

---

## 3. Shared rules (always apply)

1. **Clarity over cleverness.** If a reader must decode the sentence, rewrite it.
2. **Precision over hedge.** Drop "often" / "usually" / "should" unless the hedge is load-bearing.
3. **Concrete over abstract.** Name the function, file, or step — not "the operation".
4. **Economy.** Strike "simply", "just", "in order to", "the fact that", "it should be noted that".
5. **No throat-clearing.** Open with the point.

### 3a. Human-prose rules

1. **One idea per sentence.** Split when ideas aren't tightly linked.
2. **Active voice, concrete subjects.** "The parser rejects empty input" beats "Empty input is rejected by the parser".
3. **Names over adjectives.** "A 200ms debounce" beats "a short debounce".
4. **Cadence.** Vary sentence length.

Surface adjustments:

- **Code comments / docstrings.** Default to no comment. Flag WHATs and transient context (ticket numbers, "added for X flow") for deletion, don't polish them. One short line per comment. Docstrings lead with one summary line naming the contract.
- **Commits.** Imperative present, subject ≤72 chars, sentence case, no trailing period. Body wraps at ~72; explain why, not how.
- **PRs.** Lead with the user-visible outcome. Sections only when the body needs them.
- **READMEs / design docs / release notes.** Open with what + why. Real code samples, not `foo` / `bar`.

### 3b. Skill-file rules

1. **Parallel structure.** Five "When X, do Y" beat five differently-shaped sentences carrying the same rule.
2. **Imperative, verb-first.** The reader is an agent.
3. **Spell out algorithms.** Name the field, the path, the predicate — "read `scripts.check-types`; skip the package when null" beats "whichever the package declares".
4. **Cite by handle.** Reference `[handle]` defined elsewhere; never re-list contents inline.
5. **Tables and numbered steps over paragraphs.** Structure carries semantics directly.
6. **No cadence variation.** Five short imperatives in a row are correct, not choppy.
7. **Match the project's code style in examples.** Blank lines between top-level statements in function bodies (hooks, early returns, the main `return`).

---

## 4. Rewrite

**Refine.** Read each candidate's surrounding context. Rewrite. Attach a one-phrase rationale to each non-trivial change citing the rule that fired. Flag-for-deletion candidates get a delete marker with the rationale. Code spans and fenced blocks stay byte-identical.

**Compose.** Write in the locked voice. Show the draft; never write to a file unless the user asked.

---

## 5. Output

**Refine.** Unified diff per file. Header line: `<N> files · <M> rewrites · <K> flagged-for-deletion`. Above each file's diff, list the principles cited. End with one line flagging what to review — deletions, voice shifts, edits that touched meaning.

**Compose.** Emit the draft inline. End with one sentence offering a sharper version or asking which paragraph to push further.

---

## Rules

- **Polish prose, never facts.** Flag suspect claims; don't silently rewrite into something correct-sounding.
- **Lock voice from samples, not instinct.** Foreign register (corporate, academic, marketing) is a defect unless the samples carry it.
- **No adornment.** If a sentence reads "literary", rewrite it plainer.
- **Don't touch executable code.** Identifiers, strings, code blocks, and fenced examples stay byte-identical.
- **Don't preserve smell.** Comments that restate WHAT or carry transient context are flagged for deletion — polishing them entrenches the smell.
- **Don't pad rationales.** A long rationale means the rewrite did too much.
- **Rule set is path-determined.** On ambiguous targets, apply only §3.
