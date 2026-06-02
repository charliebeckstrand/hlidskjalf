---
name: cadence
description: Match code to the conventions a codebase already follows. Use when adding a file, module, or feature to an existing codebase, or when asked if code fits the surrounding style.
---

## Principles

- **Parallel units, parallel structure.** Sibling files, modules, and directories share the same layout and boundaries.
- **One concern, one idiom.** Pick one approach for each cross-cutting concern (error handling, async flow, validation, data access) and apply it consistently.
- **Reuse the existing form.** When a structure already serves a concept, extend it rather than spawning a parallel one.
- **Names follow the codebase’s lexical habits.** Match its casing, affixes, and verb choices.

## Out of scope

Not every deviation is drift. The break may solve a problem the pattern can’t. Don’t flatten a deliberate exception, and don’t repeat a broken pattern just to stay uniform.
