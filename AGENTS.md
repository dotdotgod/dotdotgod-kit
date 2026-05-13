# AGENTS.md

Canonical instructions for AI coding agents working in this repository.

## Project

- Name: pi-workflow
- Purpose: Personal Pi workflow package containing a project initializer skill and a customized plan mode extension.
- Primary stack: TypeScript/Node.js, Pi coding agent package conventions, POSIX shell for initializer scripting.

## Working Rules

- Read existing code and docs before changing behavior.
- Keep changes scoped to the user's request.
- Preserve user edits and unrelated dirty worktree changes.
- Prefer existing local patterns over introducing new abstractions.
- Update docs when behavior, architecture, or test strategy changes.
- For Pi-specific implementation questions, consult the local Pi docs and examples before changing extension or skill behavior.

## Commands

Document project-specific commands here as they become available:

```bash
# Test this package in Pi for one run
pi -e /Users/dotdot/Workspace/pi-workflow

# Install this package locally in Pi
pi install /Users/dotdot/Workspace/pi-workflow

# Run the project initializer dry-run against the current project
sh skills/project-initializer/scripts/init_project.sh --dry-run --project-name pi-workflow .
```

## Documentation Map

- `docs/spec/`: product behavior, API contracts, user-facing requirements.
- `docs/test/`: test strategy, regression cases, manual verification notes.
- `docs/arch/`: architecture decisions, data flow, module boundaries.
- `docs/`: all directories use kebab-case; all markdown file names use UPPER_SNAKE_CASE, including `README.md`.
- `docs/plan/`: local active implementation plans. Create one kebab-case directory per task (`docs/plan/<task-slug>/`), keep the task overview/index in that directory's `README.md`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- `docs/archive/`: local completed plans, historical notes, payload captures. Move completed task directories here (`docs/archive/<task-slug>/`). Ignored by git by default.

## Agent-Specific Entrypoints

- `CLAUDE.md` imports this file with `@AGENTS.md`.
- `CODEX.md` points users to this file.

Keep long-lived instructions here so agent-specific files do not drift.
