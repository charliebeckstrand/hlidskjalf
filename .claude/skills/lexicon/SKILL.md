---
name: lexicon
description: Use when naming or renaming code — variables, functions, parameters, types, files — or when asked if a name is clear, accurate, or misleading.
---

# Lexicon

Name code so the reader can predict what it does without reading its body. When name and body disagree, fix whichever lies.

## Principles

A name is read far more than written; a wrong name is worse than a vague one: it makes the reader wrong too. Make it long enough to stand alone — no longer.

- **Name the role, not the type.** The declaration shows the type; let the name carry meaning. `users`, not `userArray`; `deadline`, not `dateValue`.
- **The name must not lie.** `getUser` that writes, `validate` that mutates, `users` that holds one — each promises what the body breaks. When no honest name fits in a word or two, the code does too much. Split it, don’t dress it.
- **Length tracks scope.** `i` is fine for a three-line counter; a widely-scoped symbol earns full words.
- **One word per concept, one concept per word.** Three names for the same operation leaves the reader guessing. Pick an idiomatic name and use it everywhere.
- **Booleans assert, in the affirmative.** `isExpired`, `hasAccess`, `shouldRetry` — phrasing a conditional can state, not `expired` or `flag`. `isEnabled`, never `isNotDisabled`.
- **Cut noise.** `Manager`, `Handler`, `data`, `info`, `Object` fill space and name nothing. If dropping the word loses no meaning, drop it: `Scheduler` over `SchedulerManager`.
- **Borrow the domain’s word.** If the business says invoice, use it — not `billingRecord` or `chargeDoc`.
- **Abbreviate only what’s standard.** `id`, `url`, `http` read at a glance; `reqHdr`, `calcTot` don’t. Keep enough letters to pronounce and grep the name.

## Out of scope

Some names aren’t yours to change: a public API, a serialized field, a DB column, a wire key, an inherited signature, a spec term. Callers and stored data depend on the exact string, so a wrong one is a breaking change.

When unsure, leave it. A weak name kept is visible and fixable; a rename across a boundary you don’t own breaks callers silently.
