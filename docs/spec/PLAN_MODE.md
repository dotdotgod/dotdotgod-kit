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
- The default active tool list is conservative; see `PLAN_MODE_TOOL_SETTINGS.md` for optional extra installed tools.
- Read-only bash commands are allowed through an allowlist.
- `edit` and `write` are allowed only for markdown files under:
  - `docs/plan/`
  - `docs/archive/`
- Conservative plan/archive housekeeping bash commands are allowed only when every affected path stays under `docs/plan/` or `docs/archive/`:
  - `mkdir -p docs/archive/plan`
  - `mv docs/plan/<task-slug> docs/archive/plan/<task-slug>`
  - `rm -r docs/plan/<task-slug>` or `rm docs/archive/plan/<task-slug>/README.md`
- Product/source/config changes outside those directories are blocked.
- Bounded dotdotgod context/status commands are auto-allowed when invoked directly as `dotdotgod ...` or through the local source CLI path `node packages/cli/bin/dotdotgod.mjs ...`: `status`, `load-snapshot`, `resolve`, `expand`, `graph impact`, `graph communities`, read-only `config`, and `index`.
- Agent-requested dotdotgod CLI bash commands that are not otherwise allowlisted, including `init`, `config init`, unknown commands, shell chaining, redirects, pipes, command substitution, and package-runner wrappers, require explicit one-command user approval or remain blocked before they run in Plan Mode.

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

After Plan Mode is enabled, the first user planning request triggers one context-shaping pass:

- Queue a curated project-memory load if memory is missing or stale.
- Request planning-focused compaction if context is too large or noisy.
- If both are needed, compact first, then flush the queued load from `agent_end`.

The curated load uses the `/dd:load` default surface: baseline memory files, docs indexes, specs, architecture, tests, and active plans. It excludes full repository scans and archive bodies unless targeted.

When the dotdotgod CLI is available, Plan Mode validates, refreshes a bounded load snapshot, and runs advisory `dotdotgod graph impact --compact --json` checks for a small bounded set of likely target files inferred from the latest planning request and active plan content. Impact results include group counts plus top related specs, tests, docs, commands, nearby files, `impactScore`, and reason snippets when the CLI supports impact ranking. The agent uses this summary to strengthen target files, risks, and verification steps before execution. User- or agent-requested bounded context/status commands use the same allowlist described above. If the CLI is unavailable or impact lookup fails, this enhancement is skipped and planning continues from README indexes and traceability docs.

## Planning-Focused Compaction

Plan Mode requests compaction only when context is likely to hurt plan quality. It checks once after the first planning request. Later turns record metrics but do not rerun load/compaction decisions.

The extension passes planning-specific `customInstructions` to `ctx.compact()`. Instructions start with the reason, then a `Current work focus:` section from local state:

- latest user planning request
- current active plan README path when known
- pending queued project-memory load state
- touched docs/plan and docs/archive files
- todo count and completed state when present
- pending load-after-compaction state
- persistent user/project constraints such as pnpm usage, archive policy, and Plan Mode source mutation restrictions

Compaction should keep:

- latest user request
- user decisions and constraints
- active plan task slug, README path, and status
- current target files
- touched docs/plan and docs/archive files
- relevant docs/spec, docs/test, and docs/arch context
- dotdotgod CLI validation, index, and graph impact summary when available
- implementation decisions
- verification commands, results, and command outcomes
- unresolved risks, questions, and next steps
- completed `[DONE:n]` markers when present

Compaction demotes old completed plans unless relevant, repeated project-load summaries, unrelated publish history, recoverable Plan Mode boilerplate, repeated tool output, stale alternatives, generic chatter, and unrelated archive detail.

Plan Mode compaction uses moderately proactive token criteria:

- context usage at or above 60% when percentage is available
- context tokens within 32,000 tokens of the context window when window size is available
- 100,000 context tokens as a fallback when only token count is available

The extension skips compaction during execution mode and continues if compaction fails. Users can start a fresh context-shaping pass by toggling Plan Mode off and on.

## Debug Measurement

With `--dd-context-debug`, Plan Mode records local JSONL events for entry, first-request context shaping, planning turn end, compaction request/result, and execution start.

Events include context usage when available, git state, compaction reason, current-work focus, queued/flushed load state, CLI context availability, entry counts, and todo counts. Debug output defaults under `docs/archive/report/context-metrics/` unless `--dd-context-debug-output` is provided.

## Plan Review Choice

Plan Mode uses tiered hidden runtime instructions. The first active planning turn after Plan Mode is enabled receives the full safety and workflow prompt. Later planning turns receive a compact reminder that preserves non-negotiable restrictions while avoiding repeated boilerplate in the context.

When the agent finishes planning after creating or updating an active plan markdown file under `docs/plan/`, plan mode asks whether to execute, stay in plan mode, or refine the plan.

If the user explicitly asks to execute a named active plan, such as `execute docs/plan/<task-slug>/README.md` or `<task-slug> 진행해줘`, Plan Mode resolves that plan and enters execution even if the plan file was not modified in the current turn.

- Plan files under `docs/plan/` remain the durable review artifact.
- Plan Mode stores the current active plan README path in session state when active plan markdown is created or updated, so execution prompts, resume, and compaction summaries can refer to the exact plan after context changes.
- Plan mode no longer renders a saved-plan file preview in the TUI.
- The action prompt uses a short selector title and does not embed plan markdown.
- Plan mode does not show the action prompt for ordinary explanatory replies that did not touch an active plan file.
- Todo extraction and execution tracking remain available when a concrete `Plan:` section is present.

## Todo Extraction and Execution

Plan mode extracts numbered executable steps from a `Plan:` section. Generic planning template labels such as `Target files and rationale`, `Implementation steps`, and `Verification method` are ignored so they do not become execution todos.

When the user chooses to execute the plan or explicitly asks to execute a resolved active plan:

- Full tool access is restored.
- The execute follow-up or execution context names the current active plan path when known.
- Remaining steps are loaded from the selected plan README when needed and injected into execution context with the active plan path when known.
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

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": [
    "packages/pi/extensions/plan-mode/index.ts",
    "packages/pi/extensions/plan-mode/utils.ts"
  ],
  "verifiedBy": [
    "packages/pi/test/plan-mode-utils.test.ts",
    "docs/test/README.md"
  ],
  "relatedDocs": [
    "docs/arch/EXTENSION_ARCHITECTURE.md",
    "docs/arch/CODE_CONVENTIONS.md",
    "docs/spec/PLAN_MODE_TOOL_SETTINGS.md",
    "docs/spec/IMPACT_RANKING_CONFIG.md"
  ],
  "verificationCommands": [
    "pnpm --filter @dotdotgod/pi test",
    "pnpm --filter @dotdotgod/pi run typecheck"
  ]
}
```
