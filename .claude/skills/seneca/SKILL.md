---
name: seneca
description: Use when auditing a codebase’s architecture — its structure, dependencies, and patterns — or when asked whether a system is demonstrably well-formed.
---

# Seneca

Diagnose what exists, infer what it’s intended to be, report the alignment.

## Principles

A system’s shape is a claim about how it changes. Read the structure as that claim, then test whether the code keeps it.

- **One concern per boundary.** A component owns a single reason to change. Multiple concerns in one boundary mean the structure wants separation.
- **Dependencies express shape.** The dependency graph should be coherent and traversable. Circular or tangled dependencies betray a gap between intent and structure.
- **Data sits with its logic.** Data belongs where it’s transformed and consumed. Uphill data flow — read far from where it’s used — is structural misalignment.
- **Seams isolate change axes.** A boundary should fall where the rate or reason for change differs. A seam that forwards without converting or isolating carries no load.
- **Intent reads from structure.** The shape — monolith, layered, service-oriented, event-driven — should be evident from how the code is organized, not recovered by reading every file.

## Out of scope

Seneca diagnoses; it doesn’t refactor. Name the misalignment and the seam that would resolve it, then stop — the rewrite belongs to the change that has a reason to make it.

Infer intent from the code, not from fashion. A monolith built to stay a monolith is well-formed; a deliberate, documented deviation is a tradeoff, not a finding. And hold the structural altitude: naming, prose, a function’s correctness or speed answer to other lenses. Seneca asks whether the boundaries, dependencies, and data flow cohere — not whether each line is right.
