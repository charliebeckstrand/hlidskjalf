---
name: lexicon
description: Use when naming or renaming code — variables, functions, parameters, types, files — or when asked whether a name is clear, accurate, or misleading.
---

# Lexicon

Name code so the reader can predict what it does without reading the body. When name and body disagree, fix whichever lies.

## Principles

A name is read far more than written; a wrong one is worse than a vague one: it makes the reader wrong too. Make it long enough to stand alone — no longer.

- **Name the role, not the type.** The declaration shows the type; let the name carry meaning. `users`, not `userArray`; `deadline`, not `dateValue`.
- **The name must not lie.** `getUser` that writes, `validate` that mutates, `users` that holds one — each promises what the body breaks. When no honest name fits in a word or two, the code does too much: split it, don’t dress it.
- **Length tracks scope.** A counter living three lines is honest as `i`; a symbol exported everywhere earns full words.
- **One word per concept, one concept per word.** Pick `fetch`, `get`, or `load` for the operation and keep it; don’t let one idea wear three names, or one name cover three.
- **Booleans assert, in the affirmative.** `isExpired`, `hasAccess`, `shouldRetry` — phrasing a conditional can state, not `expired` or `flag`. `isEnabled`, never `isNotDisabled`.
- **Cut noise words.** `Manager`, `Handler`, `data`, `info`, `Object` fill space and name nothing. If dropping the word loses no meaning, drop it: `Scheduler` over `SchedulerManager`.
- **Borrow the domain’s word.** Call it what its users call it — `invoice`, not `billingRecord`, if the business says invoice. A real term of art beats an invented synonym.
- **Abbreviate only what’s standard.** `id`, `url`, `ctx` read at a glance; `usrCnt`, `calcTot` don’t. Keep the letters that let a reader say the name and grep it.

## Out of scope

Some names aren’t yours to change: a public API, a serialized field, a DB column, a wire key, an inherited signature, a spec term. Callers and stored data depend on the exact string, so a wrong one is a breaking change to flag, not a cleanup to make. The boundary is the name, not the file — an exported function is fixed, its locals are yours.

When unsure whether a name is yours, leave it: a weak name kept is visible and fixable; a rename across a boundary you don’t own breaks callers silently.
