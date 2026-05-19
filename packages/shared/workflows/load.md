## Goal

Load the current repository's dotdotgod project memory in a read-only pass. Explicit manual loads should build the fuller curated project map. Prompt-injected refreshes and already-loaded sessions should request compact mode and build a delta-oriented context map from shared agent instructions, README indexes, specs, architecture notes, test docs, active plans, and relevant archive notes.

Do not modify files during the load pass unless the user explicitly asks for edits after the summary.

## Workflow

1. Identify the repository root and current state.
   - Check current directory, git root, branch, and dirty worktree status.
   - Mention user changes and avoid reverting or cleaning them.
2. Prefer the bounded CLI snapshot when available.
   - If the user prompt contains explicit project-memory refs such as `[[PLAN_MODE]]`, run `dotdotgod expand <root> "<prompt>" --json` before broad `grep` or `find` scans, then read the resolved candidates selectively.
   - If the prompt has high-signal natural refs such as `PLAN_MODE`, `docs/spec/PLAN_MODE.md`, or quoted doc names, use `dotdotgod expand <root> "<prompt>" --fuzzy --json` before broad scans; avoid fuzzy expansion for low-signal generic words alone and respect configured fuzzy low-signal add/remove terms.
   - If `dotdotgod` is installed or available in the repository, run `dotdotgod load-snapshot <root> --json`.
   - If the local environment allows package execution but no `dotdotgod` binary is available, optionally run `npx @dotdotgod/cli load-snapshot <root> --json`.
   - Treat the snapshot as the first-pass project-memory map for cache status, graph size, top memory areas, top related communities, and archive inclusion policy. Avoid expanding command/event-heavy details unless the user asks for a full or diagnostic load.
   - During load/planning, treat `dotdotgod status`, `load-snapshot`, `resolve`, `expand`, `graph impact`, `graph communities`, read-only `config`, and `index` as bounded context/status helpers. Avoid mutating scaffold/config commands such as `init` or `config init` unless the user explicitly asks for initialization or config creation.
   - Use `dotdotgod graph impact <root> --changed <path> --yml` as a task-focused structured impact map when the user identifies a likely source/config/doc file.
   - Use `grep` or `find` after `expand`, impact, and targeted reads when the task needs fallback discovery or raw source text search.
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

For explicit manual full loads, respond concisely with:

- Project summary
- Key working rules
- Available commands and verification methods
- Documentation map
- Active plans
- Relevant archive notes
- Open TODO/TBD items or questions to clarify

For compact loads, respond with compact routing information:

- Project-memory status: available, stale, missing, or newly refreshed memory
- Relevant docs map: only the docs areas or README indexes likely needed for the current request
- Active plan hints: active plan paths only when relevant
- Next recommended reads: a short, bounded list, or a note that no further reads are needed
