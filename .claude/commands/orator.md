# orator

TRIGGER when: polish, compose, refine, or rewrite prose.

Polish language, not facts. Match the project's voice.

## Arguments

$ARGUMENTS

- Path → refine prose under that scope.
- Surface hint (`comments`, `docstrings`, `readme`, `commit`, `pr`, `release-note`) → refine only that surface.
- Natural-language brief → compose fresh prose.
- `--dry-run` → emit the diff inline; write nothing.

Ask one specific question if no target resolves from context.

## 1. Pick the rule set

Apply §3 always, then add one layer by target:

- Skill files (`.claude/commands/*`, `CLAUDE.md`, `AGENTS.md`) → also §3b.
- Any other prose (comments, docstrings, commits, PRs, READMEs, design docs, release notes, `*.md`) → also §3a.
- In-conversation prose with no path, or an ambiguous target → §3 alone. Half-applying a layer is wrong. Resolve a directory target per file.

## 2. Sample the voice

Read, in order: `CLAUDE.md` and any `AGENTS.md` it references (declared rules win every tie); 2–3 sibling artifacts (the file's own comments, sibling READMEs, `git log --pretty=%B -n 20` for commits, sibling skill files); domain and glossary terms already in use — preserve them unaltered.

Lock register, tense, rhythm, punctuation, capitalization, vocabulary, markdown idioms. For skill files, also lock structural shape — TRIGGER preamble, numbered `## N.` steps, `## Rules` footer.

## 3. Shared rules (always)

1. **Clarity over cleverness.** If a reader must decode the sentence, rewrite it.
2. **Precision over hedge.** Cut "often" / "usually" / "should" unless load-bearing.
3. **Concrete over abstract.** Name the function, file, or step.
4. **Economy.** Strike "simply", "just", "in order to", "the fact that".
5. **No throat-clearing.** Open with the point.

### 3a. Human prose

- One idea per sentence. Active voice, concrete subjects. Names over adjectives ("a 200ms debounce", not "a short debounce"). Vary sentence length.
- **Comments / docstrings.** Default to none. Flag WHATs and transient context (ticket numbers, "added for X flow") for deletion — don't polish them. Docstrings lead with one summary line naming the contract.
- **Commits.** Imperative, ≤72-char subject, sentence case, no trailing period. Body explains why, not how.
- **PRs.** Lead with the user-visible outcome. Sections only when needed.
- **READMEs / design docs / release notes.** Open with what + why. Real code samples, not `foo` / `bar`.

### 3b. Skill files

- Parallel structure; imperative, verb-first — the reader is an agent.
- Spell out algorithms: name the field, path, predicate.
- Cite by `[handle]`; never re-list contents inline.
- Numbered steps over paragraphs. No cadence variation — five short imperatives in a row are correct.
- Match the project's code style in examples.

## 4. Rewrite

**Refine.** Rewrite in context. Attach a one-phrase rationale to each non-trivial change, citing the rule that fired. Mark deletion candidates with their rationale. Code spans and fenced blocks stay byte-identical.

**Compose.** Write in the locked voice. Show the draft; write to a file only if asked.

## 5. Output

**Refine.** Unified diff per file, principles cited above each. Header: `<N> files · <M> rewrites · <K> flagged-for-deletion`. End with one line flagging what to review — deletions, voice shifts, edits that touched meaning.

**Compose.** Draft inline, then one sentence offering a sharper pass.

## Rules

- Polish prose, never facts. Flag suspect claims; don't rewrite into something correct-sounding.
- Lock voice from samples, not instinct. Foreign register (corporate, academic, marketing) is a defect unless the samples carry it.
- Don't touch executable code — identifiers, strings, code blocks, and fenced examples stay byte-identical.
- Don't preserve smell. Comments restating WHAT or carrying transient context are flagged for deletion, not polished.
- Don't pad rationales. A long one means the rewrite did too much.
