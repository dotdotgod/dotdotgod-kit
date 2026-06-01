# Development Principles

## Purpose

This document defines the development philosophy for dotdotgod. It frames code work as software construction: a disciplined activity that includes problem understanding, detailed design, coding, debugging, testing, integration, review, refactoring, and quality improvement.

These principles are inspired by the balanced, trade-off-oriented view of construction represented by *Code Complete 2*. They are not a mandate to copy any book mechanically. Use them to make implementation choices explicit, reviewable, and proportionate to risk.

## Construction Before Code Shape

Good development is not only producing code that looks clean. A change is not complete until the construction work around it is also sound:

- the problem, constraints, and expected behavior are understood;
- the relevant existing code and docs have been read;
- design choices have been compared against trade-offs;
- normal, boundary, and failure paths have been considered;
- tests, docs, and validation commands match the changed surface;
- integration risk and downstream impact have been checked.

Code style supports construction quality, but it does not replace requirements, design, tests, review, or integration checks.

## Requirements and Constraints First

Before implementing a meaningful change, identify the current contract and the risk of changing it.

Ask:

- What user-visible behavior, CLI contract, package boundary, or documentation role is affected?
- What constraints are fixed by existing specs, tests, package APIs, or adapter behavior?
- What failure modes, invalid inputs, partial states, or compatibility paths matter?
- What future changes are plausible enough to influence the design now?
- What evidence would show that the change is correct?

Starting from these questions prevents polished implementations of the wrong behavior.

## Design as Trade-Off Management

Do not treat design as a search for one universally clean shape. Design choices balance competing forces:

- simplicity versus extensibility;
- local explicitness versus shared abstraction;
- readability versus indirection;
- correctness versus delivery cost;
- performance versus clarity;
- compatibility versus cleanup;
- test isolation versus realistic integration coverage.

Prefer the option that reduces total project risk for the current change. When the trade-off is not obvious, record the rationale in the relevant architecture doc, plan, or code review note.

## Complexity Management

The main job of implementation is to keep complexity small enough for humans and coding agents to reason about.

Prefer code where:

- data flow and control flow are traceable without jumping through many layers;
- names expose intent without hiding important behavior;
- modules have focused responsibilities;
- abstractions reduce cognitive load rather than merely reducing repeated text;
- local code stays local until a stable reuse pattern appears;
- files are small enough to review in one focused pass;
- clever code, hidden side effects, and dense branching are avoided.

A small function is not automatically simple, and a larger function is not automatically wrong. Use extraction when it creates a better reasoning boundary, a safer test seam, or a clearer responsibility.

## Defect Prevention

Prefer preventing defects over detecting them late. Build code so invalid states are hard to create and failures are visible.

Use the appropriate mix of:

- input validation at trust boundaries;
- explicit error handling instead of silent fallback;
- assertions for internal invariants when they clarify impossible states;
- narrow variable scope and reliable initialization;
- exhaustive handling for finite state or command sets;
- type modeling that avoids ambiguous nullable or optional values;
- focused tests for boundary conditions and regression risks.

Defensive programming should make behavior safer and easier to diagnose. It should not bury errors, normalize invalid states, or make callers guess what happened.

## Data-Centered Thinking

Understand the data before arranging the code around it.

For important data, clarify:

- meaning and allowed values;
- ownership and mutation rules;
- lifetime and persistence boundary;
- initialization and default behavior;
- nullable, optional, or absent states;
- serialization and compatibility concerns;
- whether the chosen data structure makes common operations and failure cases clear.

Good data modeling often removes branches, reduces defensive checks, and makes integration behavior easier to verify.

## Debuggability and Diagnosability

Readable code is not enough. Good code is diagnosable when it breaks.

Design changes so that:

- error messages point toward the failing input, boundary, or invariant;
- logs and command output are useful without exposing unnecessary noise;
- state transitions can be inspected or reproduced;
- tests fail near the cause rather than far downstream;
- integration boundaries preserve enough context for troubleshooting;
- failures are not swallowed by broad catch blocks or misleading defaults.

A change that is hard to debug carries hidden maintenance cost even if the happy path is short.

## Checklists Over Cleverness

Assume humans make mistakes. Do not rely on memory, cleverness, or personal taste as the only quality system.

Use lightweight checklists before and after changes:

- Did I read the relevant docs and existing code?
- Did I identify the affected contract and impact surface?
- Did I consider boundary and failure paths?
- Did I choose the simplest design that satisfies the known constraints?
- Did I avoid abstractions that are not yet stable?
- Did I update nearby docs and README indexes when needed?
- Did I run focused checks and the required validation command?
- Did I leave enough evidence for the next maintainer to resume or review?

The checklist can be short for low-risk edits and more explicit for broad changes.

## Integration and Change Management

A correct local edit can still be a poor system change. Manage integration deliberately.

For source, config, or documentation changes:

- inspect related specs, tests, architecture notes, and package boundaries;
- use `dotdotgod graph impact` when changed files may affect related docs, tests, or files;
- update the nearest README index when documentation files are added, moved, split, or archived;
- keep behavior specs focused on current behavior and architecture docs focused on rationale and constraints;
- run `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index` after docs changes when the CLI is available;
- escalate to broader verification only when the changed surface justifies it.

Integration quality is part of construction quality.

## Practical Sufficiency

Quality is not infinite polish. Match effort to risk, cost, schedule, and maintainability.

Use more rigor when changes affect public contracts, cross-agent behavior, generated resources, package boundaries, persistent data, or broad workflows. Use lighter process for narrow copy edits or local-only plans, while still preserving docs structure and validation habits.

A change is sufficiently good when it is correct for the current contract, understandable to future maintainers, proportionately verified, and not over-designed for imagined reuse.

## Clean Code-Style Rules Are Not the Standard

This project does not use context-free Clean Code rules as the authority for quality. Rules such as "functions must always be tiny," "comments are failures," or "every duplication needs an abstraction" can produce fragmented code, hidden control flow, brittle tests, or premature interfaces when applied mechanically.

Prefer these replacements:

- use small functions when they improve reasoning boundaries;
- write comments and docs when they explain intent, constraints, trade-offs, or non-obvious behavior;
- remove duplication only when the shared behavior is stable enough to deserve one abstraction;
- test behavior and risks rather than freezing incidental implementation details;
- optimize only with evidence of a real bottleneck or quality problem.

The goal is not code that matches an aesthetic. The goal is software that is understandable, correct, diagnosable, maintainable, and integrated safely.
