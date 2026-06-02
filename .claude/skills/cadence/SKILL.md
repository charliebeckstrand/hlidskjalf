---
name: cadence
description: Match code to the conventions a codebase already follows — its structure, idioms, and naming conventions. Use when adding a file, module, or feature to an existing codebase, or whenever asked whether code fits, is consistent with, or matches the surrounding pattern, structure, or style.
---

## Principles

- **Parallel units, parallel structure.** Sibling files, modules, and directories share one shape — the same internal pieces, order, and boundaries.
- **One concern, one idiom.** A cross-cutting concern — error handling, async flow, validation, data access — resolves the same way everywhere; match that way.
- **Reuse the existing form.** When a structure already serves a concept, extend it rather than spawn a parallel one beside it.
- **Names follow the codebase’s lexical habits.** Match its casing, affixes, and verb choices, so a new name looks drawn from the same vocabulary.

## Out of scope

Not every deviation is drift. An existing break may solve a problem the pattern can’t — don’t normalize a deliberate exception into line, and don’t repeat a pattern that’s wrong just to stay uniform.
