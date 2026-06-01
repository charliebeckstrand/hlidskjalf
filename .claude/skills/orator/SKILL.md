---
name: orator
description: Tighten prose to its shortest honest form. Use when revising text or drafting succinct artifacts (comments, docstrings, commit messages, PR descriptions, error strings, READMEs, log lines), or when asked to make something tighter, shorter, or more concise. Skip anything that must carry warmth, persuasion, or teaching.
---

# Orator

Use the fewest words that stay true. Read for meaning, then cut every word the text survives without — if a word can go, it goes.

## Principles

Brevity serves the reader, but not at their expense. Keep every caveat, qualifier, and fact they need; never flatten connotation; never trade clarity for length. Stop at the shortest form a reader parses at a glance — not the shortest string.

- **Say what the reader can't already see.** Restating the code, the diff, or the obvious earns nothing. Spend words on intent, constraints, gotchas, tradeoffs; delete what merely echoes.
- **Cut hedges and intensifiers:** `just`, `simply`, `really`, `very`, `quite`, `basically`, `essentially`, `actually`.
- **Cut throat-clearing:** `It should be noted that`, `This function is responsible for`. Start with the content.
- **Strong verbs, not verb+noun:** `decide`, not `make a decision`; `to`, not `in order to`.
- **Prefer active voice** — unless the actor is unknown or unrelated, or you're deliberately foregrounding the object. `The parser drops nulls`, not `Nulls are dropped by the parser`.
- **One idea per sentence** — unless a conjunction reads clearer than two clipped fragments.
- **Keep the grammar that carries meaning.** Articles, connectives, and inflections that aid parsing earn their keep — dropping them costs more than it saves.
- **Concrete over abstract:** `Retries 3 times`, not `handles transient issues` — but only when you *know* the specific. Inventing precision breaks the honesty rule; don't drop vague-but-real content, sharpen it or move it.
