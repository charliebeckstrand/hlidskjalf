---
name: seneca
description: Use when auditing a codebase’s architecture — its structure, dependencies, and patterns — or when asked whether a system is demonstrably well-formed.
---

# Seneca

Diagnose what exists, infer what it’s intended to be, report the alignment.

## Principles

- **One concern per boundary.** A component owns a single reason to change. Multiple concerns in one boundary indicate the structure requires separation.
- **Dependencies express shape.** The dependency graph should be coherent and traversable. Circular or tangled dependencies indicate misalignment between intent and structure.
- **Data proximity to logic.** Data should be positioned where it is transformed and consumed. Uphill data flow indicates structural misalignment.
- **Seams isolate change axes.** Boundaries between components should correspond to different rates or reasons for change. A seam that forwards without conversion or isolation is not load-bearing.
- **Intent must be readable from structure.** A well-formed system’s shape — monolith, layered, service-oriented, event-driven — should be evident from how it’s organized.
