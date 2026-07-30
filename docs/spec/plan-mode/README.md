# Plan Mode

## Purpose

`plan-mode` is a Pi extension that provides a safe planning workflow before source changes. It lets the agent inspect the project, maintain markdown plan files, and switch into execution mode with tracked plan steps.

## Commands and Shortcut Summary

This README is a navigation summary. Detailed behavior contracts live in the traced non-README files listed in the domain map below.

- `/plan`: toggle plan mode when no request text is provided.
- `/plan <request>`: enable Plan Mode if needed and send `<request>` as the first or next planning request without toggling Plan Mode off.
- `/plan <path>`: when `<path>` resolves to `docs/plan/<task>/README.md` or `docs/plan/<task>`, load that existing plan as the active plan and populate `/todos`.
- `/todos`: show current plan progress.
- `/impact-check`: run `dotdotgod graph impact --yml` for pending source/config edits and current git source/config changes.
- `dotdotgod_graph_impact`: LLM-callable impact tool for changed-file impact review.
- `Ctrl+Alt+P`: toggle plan mode.

Pi has no built-in plan mode; this package provides the workflow as an extension.

## Domain Map

- [`TOOL_POLICY.md`](TOOL_POLICY.md): allowed planning work and command boundaries.
- [`WORKFLOW.md`](WORKFLOW.md): context shaping, compaction, plan review, todo extraction, execution, and pending impact checks.
- [`DEBUG_AND_ARCHIVE.md`](DEBUG_AND_ARCHIVE.md): debug metrics, archive policy, and traceability.
- [`../PLAN_MODE_TOOL_SETTINGS.md`](../PLAN_MODE_TOOL_SETTINGS.md): optional extra tool settings for Plan Mode.

## Plan File Shape

Active work should use this shape:

```text
docs/plan/<task-slug>/README.md
```

Supporting files may live in the same task directory as UPPER_SNAKE_CASE markdown files, for example `RESEARCH_NOTES.md`, `PROGRESS.md`, `DECISIONS.md`, or `VERIFY.md`.


Plans should include scope/status, target files and rationale, implementation steps, risks and edge cases when useful, verification method, and a final archive-housekeeping step.

Long-running tasks may keep progress, decision, and verification details as concise sections in the task README or in optional support files. Small tasks should stay in a single README unless separate files improve resume quality.
