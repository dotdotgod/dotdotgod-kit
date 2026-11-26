# Plan Mode

## Purpose

`plan-mode` is a Pi extension that provides a safe planning workflow before source changes. It lets the agent inspect the project, maintain markdown plan files, and switch into execution mode with tracked plan steps.

## Commands and Shortcut Summary

This README is a navigation summary. Detailed behavior contracts live in the traced non-README files listed in the domain map below.

- `pi --dd-plan`: start Pi with dotdotgod Plan Mode enabled. The extension does not register the generic `--plan` flag.
- `/dd:plan`: toggle plan mode when no request text is provided.
- `/dd:plan <request>`: enable Plan Mode if needed and send `<request>` as the first or next planning request without toggling Plan Mode off.
- `/dd:plan <path>`: when `<path>` resolves to `docs/plan/<task>/README.md` or `docs/plan/<task>`, load the existing plan for review. If another attempt was approved, selecting a candidate does not replace the approved plan, progress, or debt until Execute commits.
- `/impact-check`: request shared MCP impact review of pending and git-changed source/config paths, in batches of at most twenty. Pending is advisory, not an execution gate.
- `mcp__dotdotgod_context__project_impact`: shared MCP tool for changed-file impact review; no native impact/status wrapper is registered.
- `Ctrl+Alt+P`: toggle plan mode.

Pi has no built-in plan mode; this package provides the workflow as an extension.

## Domain Map

- [`DECISION_WIZARD.md`](DECISION_WIZARD.md): sequential decision questions, draft answers, batch confirmation, compatibility, fallback, and stale-result safety.

- [`TOOL_POLICY.md`](TOOL_POLICY.md): allowed planning work and command boundaries.
- [`WORKFLOW.md`](WORKFLOW.md): advisory context shaping, plan review, todo extraction, execution, and pending impact checks.
- [`EXECUTION_VERIFICATION.md`](EXECUTION_VERIFICATION.md): plan checks, evidence, settlement, status, and branch recovery.
- [`DEBUG_AND_ARCHIVE.md`](DEBUG_AND_ARCHIVE.md): debug metrics, archive policy, and traceability.
- [`../PLAN_MODE_TOOL_SETTINGS.md`](../PLAN_MODE_TOOL_SETTINGS.md): optional extra tool settings for Plan Mode.

## Plan File Shape

Active work should use this shape:

```text
docs/plan/<task-slug>/README.md
```

Supporting files may live in the same task directory as UPPER_SNAKE_CASE markdown files, for example `RESEARCH_NOTES.md`, `PROGRESS.md`, `DECISIONS.md`, or `VERIFY.md`.


Saved plans should include scope/status, target files and rationale, `Plan:` steps, `## Verification` with runnable required checks and expected outcomes, `## Re-plan If` with concrete invalidating conditions, and archive housekeeping. Small tasks that need mandatory verification commands also use a saved plan under the configured documentation root. Simple checklists without required commands may stay in chat, outside the Execute loop.

Long-running tasks may keep progress, decision, and verification details as concise sections in the task README or in optional support files. Small tasks should stay in a single README unless separate files improve resume quality.
