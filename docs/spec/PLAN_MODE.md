# Plan Mode

## Purpose

`plan-mode` is a Pi extension that provides a safe planning workflow before source changes.

It lets the agent inspect the project, maintain markdown plan files, and then switch into execution mode with tracked plan steps.

## Commands and Shortcut

- `/plan`: toggle plan mode.
- `/todos`: show current plan progress.
- `Ctrl+Alt+P`: toggle plan mode.

Pi has no built-in plan mode; this package provides the workflow as an extension.

## Allowed Planning Work

While plan mode is active:

- Reading files and searching the project are allowed.
- Read-only bash commands are allowed through an allowlist.
- `edit` and `write` are allowed only for markdown files under:
  - `docs/plan/`
  - `docs/archive/`
- Conservative plan/archive housekeeping bash commands are allowed only when every affected path stays under `docs/plan/` or `docs/archive/`:
  - `mkdir -p docs/archive/plan`
  - `mv docs/plan/<task-slug> docs/archive/plan/<task-slug>`
  - `rm -r docs/plan/<task-slug>` or `rm docs/archive/plan/<task-slug>/README.md`
- Product/source/config changes outside those directories are blocked.

## Plan File Shape

Active work should use this shape:

```text
docs/plan/<task-slug>/README.md
```

Supporting files may live in the same task directory as UPPER_SNAKE_CASE markdown files, for example:

- `RESEARCH_NOTES.md`
- `VERIFICATION.md`

The plan should include:

- scope and current status
- target files and rationale
- implementation steps
- risks and edge cases when useful
- verification method
- final housekeeping step to archive the task directory

## Planning-Focused Compaction

At the start of planning, the agent may suggest `/compact <instructions>` when the session is long or noisy.

Suggested compaction should preserve information useful for the next plan:

- user decisions
- modified files
- active docs/spec and docs/arch context
- completed and active plan/archive status
- verification results
- unresolved next steps

Compaction should remain user-initiated because it is lossy.

## Plan Review Choice

When the agent finishes planning after creating or updating an active plan markdown file under `docs/plan/`, plan mode asks whether to execute, stay in plan mode, or refine the plan.

- Plan files under `docs/plan/` remain the durable review artifact.
- Plan mode no longer renders a saved-plan file preview in the TUI.
- The action prompt uses a short selector title and does not embed plan markdown.
- Plan mode does not show the action prompt for ordinary explanatory replies that did not touch an active plan file.
- Todo extraction and execution tracking remain available when a concrete `Plan:` section is present.

## Todo Extraction and Execution

Plan mode extracts numbered executable steps from a `Plan:` section. Generic planning template labels such as `Target files and rationale`, `Implementation steps`, and `Verification method` are ignored so they do not become execution todos.

When the user chooses to execute the plan:

- Full tool access is restored.
- Remaining steps are injected into execution context.
- The agent marks completed steps by including `[DONE:n]` in the same response that reports completion.
- Final implementation or verification responses must include `[DONE:n]` for every step completed in that turn.
- `/todos` displays completion progress.

When all tracked steps are complete, plan execution state is cleared without emitting an additional `[plan-complete]` preview/message.

## Archive Policy

After implementation and verification, completed task directories should move from:

```text
docs/plan/<task-slug>/
```

to:

```text
docs/archive/plan/<task-slug>/
```
