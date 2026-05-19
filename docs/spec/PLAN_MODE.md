# Plan Mode

## Purpose

`plan-mode` is a Pi extension that provides a safe planning workflow before source changes.

It lets the agent inspect the project, maintain markdown plan files, and then switch into execution mode with tracked plan steps.

## Commands and Shortcut

- `/plan`: toggle plan mode.
- `/todos`: show current plan progress.
- `/impact-check`: run `dotdotgod graph impact --yml` for pending source/config edits, or for current git changed/untracked files when no pending files are recorded.
- `dotdotgod_graph_impact`: LLM-callable Pi tool that returns structured YML impact summaries and clears matching pending reminders.
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
- Conservative plan/archive housekeeping bash commands are allowed only when every affected path stays under `docs/plan/` or `docs/archive/`, such as archive directory creation, moving a plan into `docs/archive/plan/`, or removing a task file/directory.
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

- Queue a curated project-memory load if baseline project docs are missing, recent memory load is absent, or context has narrowed to one documentation area while the request needs cross-area planning.
- Request planning-focused compaction if context is too large or noisy.
- If both are needed, compact first, then flush the queued load from `agent_end`.

The curated load uses the `/dd:load` default surface: baseline files, docs indexes, specs, architecture, tests, and active plans. It is needed when context lacks baseline markers (`AGENTS.md`, root/docs README indexes, and spec/arch/test/plan indexes), when only one docs area remains for implementation/runtime/test work, or when compaction dropped project-memory routing markers. It excludes full repository scans and archive bodies unless targeted.

When the dotdotgod CLI is available, Plan Mode validates, refreshes a bounded load snapshot, and runs advisory `graph impact --json` checks for likely target files. The agent uses grouped related specs, tests, docs, commands, files, scores, and reasons to strengthen targets, risks, and verification. Runtime impact tools return `graph impact --yml` summaries so agents read structured groups without parsing prose. If the CLI is unavailable, planning continues from README indexes and traceability docs.

During execution and normal mode, successful source/config `edit` and `write` tool results create pending impact checks. Pi injects a hidden reminder, shows an impact status/widget, and requires `/impact-check`, `dotdotgod_graph_impact`, or successful manual `dotdotgod graph impact ... --changed <path>` before commit-like actions. Pending checks ignore plan/archive markdown, cache, vendor, build, and coverage paths. Broad verification may ask for confirmation; commit/push/publish commands are blocked until pending paths are checked.

## Planning-Focused Compaction

Plan Mode requests compaction only when context is likely to hurt plan quality. It checks once after the first planning request. Later turns record metrics but do not rerun load/compaction decisions.

The extension passes planning-specific `customInstructions` to `ctx.compact()`. Instructions include the reason and `Current work focus:`: latest request, active plan path, queued load state, touched memory files, todo progress, pending impact checks, and project constraints.

Compaction should keep latest request, decisions, active plan status, targets, relevant spec/test/arch context, dotdotgod validation/index/impact summaries, implementation decisions, verification outcomes, risks, next steps, and completed `[DONE:n]` markers.

Compaction demotes old completed plans unless relevant, repeated project-load summaries, unrelated publish history, recoverable Plan Mode boilerplate, repeated tool output, stale alternatives, generic chatter, and unrelated archive detail.

Plan Mode compaction uses moderately proactive token criteria:

- context usage at or above 60% when percentage is available
- context tokens within 32,000 tokens of the context window when window size is available
- 100,000 context tokens as a fallback when only token count is available

The extension skips compaction during execution and continues if compaction fails. Toggle Plan Mode off/on for a fresh context-shaping pass.

## Debug Measurement

With `--dd-context-debug`, Plan Mode records local JSONL events for entry, first-request context shaping, planning turn end, compaction request/result, and execution start.

Events include context usage when available, git state, compaction reason, current-work focus, queued/flushed load state, CLI context availability, entry counts, and todo counts. Debug output defaults under `docs/archive/report/context-metrics/` unless `--dd-context-debug-output` is provided.

## Plan Review Choice

Plan Mode uses tiered hidden runtime instructions. The first active planning turn receives the full safety/workflow prompt; later turns receive a compact reminder. Each planning turn also receives request framing: advisory questions stay lightweight, implementation-looking requests become durable plans first, memory-load requests use the curated load flow, and explicit execution requests use the existing execution path.

When the agent finishes planning after creating or updating an active plan markdown file under `docs/plan/`, plan mode asks whether to execute, stay in plan mode, or refine the plan.

If the user explicitly asks to execute a named active plan, such as `execute docs/plan/<task-slug>/README.md` or `<task-slug> 진행해줘`, Plan Mode resolves that plan and enters execution even if the plan file was not modified in the current turn.

- Plan files under `docs/plan/` remain the durable review artifact.
- Plan Mode stores the current active plan README path so execution prompts, resume, and compaction summaries can refer to it after context changes.
- Plan mode does not render saved-plan previews in the TUI and does not show the action prompt for ordinary explanatory replies that did not touch an active plan file.
- Todo extraction and execution tracking remain available when a concrete `Plan:` section is present.

## Todo Extraction and Execution

Plan mode extracts numbered executable steps from a `Plan:` section. Generic planning template labels such as `Target files and rationale`, `Implementation steps`, and `Verification method` are ignored so they do not become execution todos.

When the user chooses to execute the plan or explicitly asks to execute a resolved active plan:

- Full tool access is restored.
- The execute follow-up or execution context names the current active plan path when known.
- Remaining steps are loaded from the selected plan README when needed and injected into execution context with the active plan path when known.
- The agent marks completed steps by including `[DONE:n]` in the same response that reports completion.
- Final implementation or verification responses must include `[DONE:n]` for every step completed in that turn.
- After modification or coding work, execution guidance requires `dotdotgod validate` for the project before final completion.
- `/todos` displays completion progress.

When all tracked steps are complete, plan execution state is cleared without an additional preview/message. Plan completion does not auto-index by default; future cache-refresh hooks should be opt-in after all steps have `[DONE:n]` markers.

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
    "pnpm --filter @dotdotgod/pi run typecheck",
    "node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/extensions/plan-mode/index.ts --yml"
  ]
}
```
