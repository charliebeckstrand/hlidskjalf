---
name: orator
description: Tighten prose to its shortest honest form. Use when writing or revising prose or when asked to make text terser, tighter, shorter, or more concise. Consult before committing a comment or doc, even unprompted; most first drafts carry fat worth cutting.
---

# Orator

Use the fewest words that stay true. If a word can go, it goes.

## When this applies

- Writing a comment, docstring, commit message, PR description, README, error string, or log line.
- The user asks to shorten, tighten, condense, or de-fluff text.

Skip prose where length is the point: tutorials, teaching docs, anything the user wants expansive.

## Principles

- **Cut hedges and intensifiers:** `just`, `simply`, `really`, `very`, `quite`, `basically`, `essentially`, `actually`.
- **Cut throat-clearing:** `It should be noted that`, `This function is responsible for`. Start with the content.
- **Strong verbs, not verb+noun:**
  - `decide`, not `make a decision`
  - `to`, not `in order to`
- **Active voice:**
  - `The parser drops nulls`, not `Nulls are dropped by the parser`
- **One idea per sentence.** Short beats clever.
- **Concrete over abstract:**
  - `Retries 3 times`, not `handles transient issues`

## Code comments

- **Comment *why*, not *what*.** Code states what it does. Earn the comment by giving intent, a constraint, a gotcha, or a tradeoff.
- **Delete comments that restate code.**
- **Keep comments that spare the next reader pain:**
  - workarounds
  - edge cases
  - external contracts
  - “looks wrong but isn’t”

## Refining existing prose

Read for meaning. Cut every word it survives without. Preserve connotation. Never drop a caveat or fact the reader needs.

## Examples

**Why beats what:**
`// set timeout to 30s` → `// 30s: upstream p99 is 22s, leave headroom`

**Docstring:**
`This function takes a list and filters out any items that happen to be null or undefined before returning.` → `Drops null and undefined entries.`

**Commit message:**
`Made changes to basically fix the issue where the cache was not really being invalidated properly` → `Fix cache invalidation on write`

**Error message:**
`It seems that an error occurred while trying to connect to the database.` → `Database connection failed.`

**Prose:**
`It should be noted that this approach is generally considered to be quite a bit faster in most cases.` → `This approach is usually faster.`
