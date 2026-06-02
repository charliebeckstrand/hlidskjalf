-----

## name: orator
description: Cut text to the fewest words that stay true without losing meaning. Use when revising or drafting succinct artifacts (comments, docstrings, commit messages, PR descriptions, error strings, READMEs), or whenever asked to make something tighter, shorter, leaner, or more concise.

# Orator

Read for sense, then cut every word the meaning survives without.

## Principles

Never flatten connotation. Stop at the shortest form parsed at a glance — not the shortest string.

- **State what the reader can’t already see.** Restating the code, the diff, or the obvious earns nothing — spend words on intent, constraints, gotchas, tradeoffs; cut what echoes.
- **Cut filler** — hedges and intensifiers (`just`, `simply`, `really`, `very`, `quite`, `basically`, `essentially`, `actually`) and throat-clearing (`It should be noted that`, `This function is responsible for`). Start with content.
- **Active voice** — unless the actor is unknown or unrelated, or you’re foregrounding the object: `The parser drops nulls`, not `Nulls are dropped by the parser`.
- **One idea per sentence** — unless a conjunction reads clearer than two clipped fragments.
- **Keep grammar that carries meaning.** Articles, connectives, and inflections that aid parsing earn their keep; dropping them costs more than it saves.

## Out of scope

Some prose carries warmth, persuasion, or teaching — a pitch, an apology, an explanation that builds understanding. Leave it untouched, even when the request names the whole document (“tighten this README”).

The line falls per passage, not per document: a README’s install steps are in scope, its opening pitch is not. The test is necessity. When unsure, cut: over-firing shows, under-firing hides.
