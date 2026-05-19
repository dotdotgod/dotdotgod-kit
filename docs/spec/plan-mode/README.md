# Plan Mode

## Purpose

`plan-mode` is a Pi extension that provides a safe planning workflow before source changes. It lets the agent inspect the project, maintain markdown plan files, and switch into execution mode with tracked plan steps.

## Commands and Shortcut

- `/plan`: toggle plan mode.
- `/todos`: show current plan progress.
- `/impact-check`: run `dotdotgod graph impact --yml` for pending source/config edits, or for current git changed/untracked files when no pending files are recorded.
- `dotdotgod_graph_impact`: LLM-callable impact tool. Successful structured YML starts at `impact:`; multiple successes use `---`.
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

Supporting files may live in the same task directory as UPPER_SNAKE_CASE markdown files, for example `RESEARCH_NOTES.md` or `VERIFICATION.md`.

Plans should include scope/status, target files and rationale, implementation steps, risks and edge cases when useful, verification method, and a final archive-housekeeping step.
