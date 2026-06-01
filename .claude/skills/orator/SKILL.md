---
name: orator
description: Use when revising text or drafting succinct artifacts (comments, docstrings, commit messages, PR descriptions, error strings, READMEs, log lines), or when asked to make something tighter, shorter, or more concise.
---

# Orator

Use the fewest words that stay true. Read for sense, then cut every word the expression survives without — if a word can go, it goes.

## Principles

Brevity serves the reader, but not at their expense. Keep every caveat, qualifier, and fact they need; never flatten connotation. Stop at the shortest form a reader parses at a glance — not the shortest string.

- **Say what the reader can't already see.** Restating the code, the diff, or the obvious earns nothing. Spend words on intent, constraints, gotchas, tradeoffs; delete what merely echoes.
- **Real over invented — sharpen what you know, never fabricate.** If you know the particular, use it: `Retries 3 times`, not `handles transient issues`. If you don't, keep the loose form: `Retries a few times`, never a guessed number. The pull toward specifics plus the pressure to cut tempts invented precision — and that breaks the honesty rule. Don't drop vague-but-real content; sharpen it, or leave it loose.
- **Cut hedges and intensifiers:** `just`, `simply`, `really`, `very`, `quite`, `basically`, `essentially`, `actually`.
- **Cut throat-clearing:** `It should be noted that`, `This function is responsible for`. Start with the content.
- **Strong verbs, not verb+noun:** `decide`, not `make a decision`; `to`, not `in order to`.
- **Prefer active voice** — unless the actor is unknown or unrelated, or you're deliberately foregrounding the object. `The parser drops nulls`, not `Nulls are dropped by the parser`.
- **One idea per sentence** — unless a conjunction reads clearer than two clipped fragments.
- **Keep the grammar that carries meaning.** Articles, connectives, and inflections that aid parsing earn their keep — dropping them costs more than it saves.

## Out of scope

Some prose must carry warmth, persuasion, or teaching — a pitch, an apology, an explanation meant to build understanding. Leave it untouched, even when the request names the whole document (“tighten this README”).

The line falls per passage, not per document: a README’s install steps are in scope, its opening pitch is not. The test is necessity. When unsure, cut: over-firing shows, under-firing hides.
