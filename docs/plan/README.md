# Plans

Use this area for active implementation plans.

## Naming

- Task directories use kebab-case: `docs/plan/<task-slug>/`.
- Markdown file names use UPPER_SNAKE_CASE: `README.md`, `RESEARCH_NOTES.md`, `VERIFICATION.md`.

## Structure

- Create one directory per task: `docs/plan/<task-slug>/`.
- Put the task overview, index, scope, status, and main plan in `docs/plan/<task-slug>/README.md`.
- Add supporting research, checklists, payload captures, or verification notes as additional UPPER_SNAKE_CASE markdown files in the same task directory.
- Move completed or superseded task directories to `docs/archive/plan/<task-slug>/`.

## Lifecycle

Use lightweight status labels so this directory reflects current intent:

- `active`: currently being executed or expected to resume soon.
- `paused`: valid but waiting for user input, external timing, or prioritization.
- `ready-to-archive`: completed or superseded and waiting for final archive housekeeping.

Prefer pausing or archiving stale work over leaving every possible future idea as active.

## Active Plans

- `2-stage2-3/` — active: plan and support design for extending `/plan-generator` from Stage 01 into Stage 02 context-load and Stage 03 discovery using store state plus data-only stage constants.
- `codex-plugin-metadata/` — paused: plan to align Claude Code and Codex plugin metadata and verification with current platform docs and the impact-review workflow contract; ready for execution when prioritized.
- `cli-core-module-split/` — active: plan to split `packages/cli/src/core.mjs` into responsibility-focused modules while preserving CLI behavior and public exports.
- `commit-split-current-work/` — active: commit-splitting plan for the current mixed staged/unstaged worktree, including latest `/plan-generator` resume, path resume, and interrupt pause work.
- `context-metrics-follow-up/` — paused: follow-up checklist for reviewing context size, lazy refresh behavior, snapshot boundedness, and graph usefulness after more representative usage.
- `documentation-clarity-program/` — active: phased plan to clarify README, AGENTS.md, spec, test, architecture, and report documentation with role-specific subagent review and writing passes.
- `landing-site/` — paused: plan for adding a static React landing and documentation site to the pnpm monorepo; waiting on framework, deployment, and design decisions.
- `notion-docs-sync/` — active: plan for a Notion integration that links Notion task/issue pages with GitHub-hosted markdown under `docs/` and preserves traceability; Phase 1-3 use CLI dry-run, CLI write mode, and GitHub Actions without custom server resources.
- `pi-subagents-resource-conflict/` — active: plan to suppress duplicate `pi-subagents` skill and prompt resources when standalone `pi-subagents` is already installed alongside `@dotdotgod/pi`.
- `plan-generator-stage-01-loop/` — active: plan to complete only the `/plan-generator` Stage 01 agent-end evaluation loop, pass/blocked/retry handling, store persistence, and next-context handoff.
- `plan-generator-interrupt-toggle-resume/` — active: plan Esc pause, next-message same-stage resume, and no-arg `/plan-generator` toggle-off behavior for active generator workflows.
- `plan-generator-path-resume/` — active: plan `/plan-generator docs/plan/<task>/README.md` path mode to resume existing durable plans from checkpoints or start Stage 01 in place when no checkpoint exists.
- `plan-generator-stage-simplification/` — active: simplify `/plan-generator` and CLI plan validation from the old 9-stage flow to intake, context load, discovery, plan, and optional workstream handoff.
- `plan-generator-resume-progress/` — paused: earlier resume-semantics plan paused after the stage-flow review; resume after the simplified generator stage model lands.
- `restore-plan-generator-llm-slug/` — active: plan to restore LLM-generated task slugs for `/plan-generator` while keeping deterministic fallback, collision handling, and regression tests.

This directory is local-only and ignored by git by default.
