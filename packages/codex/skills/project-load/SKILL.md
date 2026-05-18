---
name: project-load
description: Load and summarize the current repository's dotdotgod project memory. Use when the user asks Codex to load, refresh, inspect, summarize, or resume project context; when switching repositories; when starting unfamiliar work; or when a dd:load style project memory pass is requested.
---

# Project Load

## Goal

Load the current repository's dotdotgod project memory in a read-only pass. Build a compact context map from shared agent instructions, README indexes, specs, architecture notes, test docs, active plans, and relevant archive notes.

Do not modify files during the load pass unless the user explicitly asks for edits after the summary.

## Workflow

1. Identify the repository root and current state.
   - Check current directory, git root, branch, and dirty worktree status.
   - Mention user changes and avoid reverting or cleaning them.
2. Prefer the bounded CLI snapshot when available.
   - If `dotdotgod` is installed or available in the repository, run `dotdotgod load-snapshot <root> --json`.
   - If the local environment allows package execution but no `dotdotgod` binary is available, optionally run `npx @dotdotgod/cli load-snapshot <root> --json`.
   - Treat the snapshot as the first-pass project-memory map for cache status, graph size, memory areas, related communities, and archive inclusion policy.
   - Use `dotdotgod graph impact <root> --changed <path> --compact --json` as a task-focused impact map when the user identifies a likely source/config/doc file.
   - Fall back to raw `dotdotgod graph impact <root> --changed <path> --json` only when diagnostics need the full payload.
   - When graph impact surfaces traceability relations, inspect the related specs, tests, and docs before editing source.
   - Related behavior docs: [load project](../../../docs/spec/LOAD_PROJECT.md), [cross-agent support](../../../docs/spec/CROSS_AGENT_SUPPORT.md), and [cross-agent architecture](../../../docs/arch/CROSS_AGENT_ARCHITECTURE.md).
   - If the CLI is unavailable, network/package execution is undesirable, or the command fails, continue with the manual README-index fallback below.
3. Inspect baseline memory files when present:
   - `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `README.md`
   - `docs/README.md`
   - `docs/spec/README.md`
   - `docs/test/README.md`
   - `docs/arch/README.md`
   - `docs/plan/README.md`
   - `docs/archive/README.md`
4. Start with `AGENTS.md`, `README.md`, and `docs/README.md` when they are not already clear from the CLI snapshot or loaded context.
5. Follow README indexes. Read relevant docs under `docs/spec`, `docs/test`, and `docs/arch` selectively unless the task needs a full refresh.
6. List `docs/plan` entries first, then selectively read only relevant active plans.
7. Use `docs/archive/README.md` as the archive history map. Do not scan archive bodies by default; read targeted completed plans under `docs/archive/plan/` or reports under `docs/archive/report/` only when directly relevant.
8. Avoid broad reads of generated outputs, dependencies, databases, caches, secrets, and `.env*` contents.

## Output Shape

Respond concisely with:

- Project summary
- Key working rules
- Available commands and verification methods
- Documentation map
- Active plans
- Relevant archive notes
- Open TODO/TBD items or questions to clarify
