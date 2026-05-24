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

- `codex-plugin-metadata/` — paused: plan to align Claude Code and Codex plugin metadata and verification with current platform docs and the impact-review workflow contract; ready for execution when prioritized.
- `cli-core-module-split/` — active: plan to split `packages/cli/src/core.mjs` into responsibility-focused modules while preserving CLI behavior and public exports.
- `context-metrics-follow-up/` — paused: follow-up checklist for reviewing context size, lazy refresh behavior, snapshot boundedness, and graph usefulness after more representative usage.
- `documentation-clarity-program/` — active: phased plan to clarify README, AGENTS.md, spec, test, architecture, and report documentation with role-specific subagent review and writing passes.
- `landing-site/` — paused: plan for adding a static React landing and documentation site to the pnpm monorepo; waiting on framework, deployment, and design decisions.
- `notion-docs-sync/` — active: plan for a Notion integration that links Notion task/issue pages with GitHub-hosted markdown under `docs/` and preserves traceability; Phase 1-3 use CLI dry-run, CLI write mode, and GitHub Actions without custom server resources.
- `pi-subagents-resource-conflict/` — active: plan to suppress duplicate `pi-subagents` skill and prompt resources when standalone `pi-subagents` is already installed alongside `@dotdotgod/pi`.

This directory is local-only and ignored by git by default.
