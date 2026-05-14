---
name: project-initializer
description: Initialize a new software project with shared AI agent instructions and a documentation scaffold. Use when asked to set up a new project, create or normalize AGENTS.md/CLAUDE.md/CODEX.md, create docs/spec docs/test docs/arch docs/plan docs/archive, or establish a doc-first project baseline for multiple AI agents.
---

# Project Initializer

## Overview

Create a conservative dotdotgod project baseline that multiple AI coding agents can share:

- `AGENTS.md` is the canonical project instruction file.
- `CLAUDE.md` imports `AGENTS.md` for Claude Code.
- `CODEX.md` points Codex users to `AGENTS.md`.
- `docs/` contains `spec`, `test`, `arch`, `plan`, and `archive` areas with concise README files.
- `docs/arch/` covers architecture decisions, code conventions, module boundaries, data flow, infrastructure/runtime dependencies, integration boundaries, and migration design.
- Code conventions can start as `docs/arch/CODE_CONVENTIONS.md`; when they grow across multiple topics, promote them to `docs/arch/conventions/README.md` plus supporting UPPER_SNAKE_CASE files.
- Under `docs/`, all directories use kebab-case and all markdown file names use UPPER_SNAKE_CASE, including `README.md`.
- `docs/plan/<task-slug>/README.md` is the default shape for active plan work.
- Completed plans move to `docs/archive/plan/<task-slug>/`.
- Temporary reports and investigations move to `docs/archive/report/<report-slug>/`.
- `.gitignore` includes `docs/plan` and `docs/archive` so local memory stays local by default.

Prefer the bundled dependency-free shell script for deterministic setup:

```bash
sh scripts/init_project.sh <project-root>
```

Use `--dry-run` before touching an unfamiliar repository. Use `--dotdot-setting` when the user wants dotdot code conventions generated under `docs/arch/CODE_CONVENTIONS.md` and referenced from `AGENTS.md`. Use `--force` only when explicitly requested; it creates timestamped backups before replacing files.

## Workflow

1. Inspect the target project root.
   - Check for existing `AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `CODEX.md`, `README.md`, `.gitignore`, and `docs/`.
   - Preserve project-specific instructions unless the user asks to replace them.
   - If both `AGENT.md` and `AGENTS.md` exist, prefer `AGENTS.md` as canonical and leave `AGENT.md` untouched unless asked.
2. Run the initializer.
   - Default behavior creates missing files only.
   - Existing files are skipped.
   - `.gitignore` is created or appended with missing `docs/plan` and `docs/archive` entries.
   - `--dotdot-setting` additionally creates `docs/arch/CODE_CONVENTIONS.md`, adds it to the architecture README index, and adds an `AGENTS.md` reference.
   - `--force` backs up replaced files as `<name>.bak.<timestamp>`.
3. Review generated files.
   - Fill project-specific sections in `AGENTS.md` when context is available.
   - Keep `CLAUDE.md` and `CODEX.md` thin so instructions do not drift.
   - Treat `docs/plan` and `docs/archive` as local working memory unless the project deliberately changes that policy.
4. Report the result.
   - List created/skipped/backed-up files.
   - Mention any existing instructions that still need manual consolidation.

## Bundled Resources

- `scripts/init_project.sh`: creates the scaffold and handles overwrite policy with POSIX shell only.
- `references/agent-docs.md`: naming rationale and expected content model for shared agent docs.
