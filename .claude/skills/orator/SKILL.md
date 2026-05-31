-----

## name: orator
description: Tighten prose to its shortest honest form. Use when revising text or drafting succinct artifacts (comments, docstrings, commit messages, PR descriptions, error strings, READMEs, log lines), or when asked to make something tighter, shorter, or more concise. Skip anything that must carry warmth, persuasion, or teaching.

# Orator

Use the fewest words that stay true. If a word can go, it goes.

## Principles

Brevity serves the reader, but not at their expense. Never drop a caveat, qualifier, or fact they need, and never flatten connotation.

- **Cut hedges and intensifiers:** `just`, `simply`, `really`, `very`, `quite`, `basically`, `essentially`, `actually`.
- **Cut throat-clearing:** `It should be noted that`, `This function is responsible for`. Start with the content.
- **Strong verbs, not verb+noun:**
  - `decide`, not `make a decision`
  - `to`, not `in order to`
- **Prefer active voice** — unless the actor is unknown or unrelated (`The file was corrupted on upload`), or you’re deliberately foregrounding the object.
  - `The parser drops nulls`, not `Nulls are dropped by the parser`
- **One idea per sentence** — unless a connective genuinely reads clearer than two clipped fragments. Short _usually_ beats clever; staccato doesn’t.
- **Concrete over abstract:**
  - `Retries 3 times`, not `handles transient issues`. But only when you *know* the specific. Don’t write `3` unless it’s 3. Inventing precision to sound concrete breaks the honesty rule.

## Code comments

- **Comment *why*, not *what*.** Earn the comment by giving intent, a constraint, a gotcha, or a tradeoff.
- **Delete comments that restate code.**
- **Keep comments that spare future readers:**
  - workarounds
  - edge cases
  - external contracts
  - “looks wrong but isn’t”

## Refining existing prose

Read for meaning. Cut every word it survives without. Preserve connotation, keep the caveats and facts, add nothing the source didn’t earn.

## Examples

**Why beats what:**
`// set timeout to 30s` → `// 30s: upstream p99 is 22s, leave headroom`

**Docstring:**
`This function takes a list and filters out any items that happen to be null or undefined before returning.` → `Drops null and undefined entries.`

**Commit message:**
`Made changes to basically fix the issue where the cache was not really being invalidated properly` → `Fix cache invalidation`
(Not `Fix cache invalidation on write` — the source never said *on write*. Add that only if it’s true.)

**Error message:**
`It seems that an error occurred while trying to connect to the database.` → `Database connection failed.`

**Prose (keep the caveat):**
`It should be noted that this approach is generally considered to be quite a bit faster in most cases.` → `This approach is usually faster.`
(`usually` stays — drop it and the claim turns false.)
