---
name: project-load
description: Use this skill when the user asks Claude Code to load, refresh, inspect, summarize, or resume a repository's dotdotgod project memory; when starting unfamiliar work; or when a dd:load style project context pass is requested.
version: 1.0.0
---

# Project Load

## Goal

Load the current repository's dotdotgod project memory in a read-only pass. Build a compact context map from shared agent instructions, README indexes, specs, architecture notes, test docs, active plans, and relevant archive notes.

Do not modify files during the load pass unless the user explicitly asks for edits after the summary.

## Workflow

1. Identify the repository root and current state.
   - Check current directory, git root, branch, and dirty worktree status.
   - Mention user changes and avoid reverting or cleaning them.
2. Inspect baseline memory files when present:
   - `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `README.md`
   - `docs/README.md`
   - `docs/spec/README.md`
   - `docs/test/README.md`
   - `docs/arch/README.md`
   - `docs/plan/README.md`
   - `docs/archive/README.md`
3. Start with `AGENTS.md`, `README.md`, and `docs/README.md` when available.
4. Follow README indexes. Read relevant docs under `docs/spec`, `docs/test`, and `docs/arch`.
5. List `docs/plan` and `docs/archive` entries first, then selectively read only relevant active plans or archive notes.
6. Distinguish completed plans under `docs/archive/plan/` from reports under `docs/archive/report/`.
7. Avoid broad reads of generated outputs, dependencies, databases, caches, secrets, and `.env*` contents.

## Output Shape

Respond concisely with:

- Project summary
- Key working rules
- Available commands and verification methods
- Documentation map
- Active plans
- Relevant archive notes
- Open TODO/TBD items or questions to clarify
