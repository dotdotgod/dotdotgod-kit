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

## Planning Context Shaping

After Plan Mode is enabled and the user sends the first planning request, Plan Mode shapes context in two directions before substantive planning continues:

- If project memory is missing or stale, it requests a full curated project memory load.
- If context is too large or noisy, it requests planning-focused compaction.

The full curated load uses the same default project memory surface as `/dd:load`: baseline memory files, docs indexes, specs, architecture, tests, and active plans. It does not mean reading every repository file or every archive body. Archive bodies remain excluded by default and should be read only through targeted lookup when relevant.

If compaction and load are both needed, Plan Mode requests compaction first, then requests the curated project memory load after compaction completes. Loading additional memory into an already-large context would make the context problem worse, but compaction alone cannot recover project docs that were never loaded.

## Planning-Focused Compaction

Plan mode automatically requests planning-focused compaction when context is large enough to hurt plan quality. It does not compact immediately when `/plan` is toggled on; it checks after the first user planning request and after later planning turns while Plan Mode remains active.

The extension passes planning-specific `customInstructions` to `ctx.compact()` so compaction preserves information useful for the next plan. Instructions start with the compaction reason, then include a `Current work focus:` section derived from available local state:

- latest user planning request
- active plan path or touched docs/plan and docs/archive files
- todo count and completed state when present
- pending load-after-compaction state
- persistent user/project constraints such as pnpm usage, archive policy, and Plan Mode source mutation restrictions

The durable preservation rules then ask compaction to keep:

- user decisions and constraints
- active plan task slug, path, and status
- touched docs/plan and docs/archive files
- active docs/spec, docs/test, and docs/arch context
- implementation decisions
- verification results and command outcomes
- unresolved risks, questions, and next steps
- completed `[DONE:n]` markers when present

Compaction omits low-value discussion, repeated tool output, stale alternatives, generic chatter, and unrelated archive detail.

Plan Mode compaction uses moderately proactive token criteria:

- context usage at or above 60% when percentage is available
- context tokens within 32,000 tokens of the context window when window size is available
- 100,000 context tokens as a fallback when only token count is available

The extension debounces repeated compactions, skips compaction during execution mode, and continues without blocking if compaction fails. The debounce is intentionally short enough to allow useful re-compaction during long planning sessions while still avoiding repeated immediate compactions.

## Debug Measurement

When the Pi adapter is started with `--dd-context-debug`, Plan Mode records local JSONL measurement events for Plan Mode entry, initial context-shaping checks, planning turn end, compaction request, compaction completion/error, and execution start.

Events include context usage when available, git state, compaction reason, current-work focus, entry counts, and todo counts where relevant. Debug output defaults under `docs/archive/report/context-metrics/` unless `--dd-context-debug-output` is provided.

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

When all tracked steps are complete, plan execution state is cleared without emitting an additional `[plan-complete]` preview/message. Plan completion does not automatically run project indexing by default; future cache-refresh hooks should be opt-in and should run only after all tracked steps have corresponding `[DONE:n]` markers.

## Archive Policy

After implementation and verification, completed task directories should move from:

```text
docs/plan/<task-slug>/
```

to:

```text
docs/archive/plan/<task-slug>/
```
