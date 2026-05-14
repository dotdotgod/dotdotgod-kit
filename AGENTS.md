# AGENTS.md

Canonical instructions for AI coding agents working in this repository.

## Project

- Name: dotdotgod
- Purpose: Project memory kit for AI coding agents containing shared docs initialization, plan/archive workflow conventions, and customized Pi, Claude Code, and Codex adapters.
- Primary stack: TypeScript/Node.js, Pi coding agent package conventions, POSIX shell for initializer scripting.

## Working Rules

- Read existing code and docs before changing behavior.
- Keep changes scoped to the user's request.
- Preserve user edits and unrelated dirty worktree changes.
- Prefer existing local patterns over introducing new abstractions.
- Update docs when behavior, architecture, or test strategy changes.
- Follow the project code conventions in `docs/arch/CODE_CONVENTIONS.md`.
- For Pi-specific implementation questions, consult the local Pi docs and examples before changing extension or skill behavior.

## Commands

Document project-specific commands here as they become available:

```bash
# Test/install the Pi adapter locally
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi

# Run the project initializer dry-run against the current project
sh packages/pi/skills/project-initializer/scripts/init_project.sh --dry-run --project-name dotdotgod .

# Verify all workspace packages
pnpm run verify
```

## Documentation Map

- `docs/spec/`: product behavior, API contracts, user-facing requirements.
- `docs/test/`: test strategy, regression cases, manual verification notes.
- `docs/arch/`: architecture decisions, code conventions, module boundaries, data flow, infrastructure/runtime dependencies, integration boundaries, and migration design.
- `docs/`: all directories use kebab-case; all markdown file names use UPPER_SNAKE_CASE, including `README.md`.
- `docs/`: prefer keeping individual markdown files under 200 lines and under 10,000 characters; split larger docs into focused UPPER_SNAKE_CASE files and keep `README.md` as the index/overview.
- `docs/`: when adding, renaming, splitting, moving, or archiving docs, update the nearest relevant `README.md` index/table of contents in the same change.
- `docs/`: each docs subdirectory `README.md` acts as the local table of contents; list important files, task directories, status, and a one-line purpose for each entry.
- `docs/`: start small with a single focused markdown file; when one domain grows into multiple docs, promote it to `docs/<area>/<domain>/README.md` plus related UPPER_SNAKE_CASE files in that directory.
- `docs/arch/`: code conventions may start as `CODE_CONVENTIONS.md`; when they grow across multiple topics, use `docs/arch/conventions/README.md` as the index with supporting UPPER_SNAKE_CASE files.
- `docs/plan/`: local active implementation plans. Create one kebab-case directory per task (`docs/plan/<task-slug>/`), keep the task overview/index in that directory's `README.md`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- `docs/archive/`: local completed plans, temporary reports, historical notes, payload captures. Move completed plan task directories to `docs/archive/plan/<task-slug>/`; put temporary reports and investigations under `docs/archive/report/<report-slug>/`. Ignored by git by default.

## Agent-Specific Entrypoints

- `CLAUDE.md` imports this file with `@AGENTS.md`.
- `CODEX.md` points users to this file.

Keep long-lived instructions here so agent-specific files do not drift.
