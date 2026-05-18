---
description: Plan a change using dotdotgod doc-first planning conventions
argument-hint: <task or change request>
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---

# /dd:plan - Doc-First Planning

Create or update a dotdotgod implementation plan before changing source/config files.

Task request: `$ARGUMENTS`

## Goal

Create implementation plans from the repository's documented design sources before changing source/config files. Treat planning as a managed artifact under `docs/plan`.

Do not start implementation until the plan has a clear evidence trail and the user has asked to execute it. Treat the written plan file as the durable review artifact; do not rely on transient chat previews.

## Source Order

Prefer live repository docs in this order:

1. `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `README.md`, and `docs/README.md` for working rules and project map.
2. `docs/spec/` for behavior, domain rules, API contracts, and acceptance criteria.
3. `docs/test/` for verification strategy, regression cases, fixtures, and manual checks.
4. `docs/arch/` for architecture decisions, module boundaries, integration constraints, and runtime assumptions.
5. `docs/plan/README.md` and matching active plans under `docs/plan/`.
6. Relevant completed plans under `docs/archive/plan/` or reports under `docs/archive/report/` only when directly useful.

## Workflow

1. Establish current state.
   - Check git status.
   - Locate relevant docs and active plans.
   - Preserve user edits and unrelated dirty worktree changes.
   - If the session is long or noisy, suggest a user-initiated planning-focused compaction before writing or revising the plan; do not compact automatically because compaction is lossy.
2. Gather evidence before planning.
   - Search docs by domain terms from the user request.
   - Read nearest README indexes and relevant focused docs.
   - For behavior changes, prefer specs with CLI-enforced fenced `json dotdotgod` traceability blocks in the final section; use their source, test, related-doc, and verification-command mappings before editing code.
   - When the dotdotgod CLI is available and likely target files are known, run `dotdotgod graph impact <root> --changed <path> --compact --json` for a small bounded set of those files. Use the related specs, tests, docs, commands, scores, and reasons to strengthen target files, risks, and verification steps. If impact lookup fails or the CLI is unavailable, continue with README-index and traceability fallback evidence.
   - Read code only after docs identify likely module boundaries, impact output points to relevant files, or docs are missing/stale.
3. Create or update the active plan at:

   ```text
   docs/plan/<task-slug>/README.md
   ```

4. Use supporting files in the same task directory only when useful, with UPPER_SNAKE_CASE markdown names such as `RESEARCH_NOTES.md` or `VERIFICATION.md`.
5. Include:
   - scope and current status
   - target files and rationale
   - impact-derived related files/checks when available
   - implementation steps
   - risks and edge cases when useful
   - verification method
   - final housekeeping step to move completed work to `docs/archive/plan/<task-slug>/`
6. Update `docs/plan/README.md` if the repository keeps active plan entries there.
7. Use repository-local package manager evidence for verification commands. In this repository, prefer `pnpm run verify`, `pnpm run pack:dry-run`, and `.husky/pre-push` when applicable.
8. After creating or updating behavior specs, run project validation when possible. For dotdotgod projects, `dotdotgod validate` enforces machine-readable `json dotdotgod` traceability blocks as the final section in specs. Use `dotdotgod validate --check-index` when you need to confirm markdown fingerprints match the graph index. If validation fails, use the schema, property guidance, and example shown in the validation error to repair the spec.
9. Stop after presenting the plan unless the user explicitly asks for execution.
10. After implementation and verification, archive completed or superseded plan directories under `docs/archive/plan/<task-slug>/`; remove stale local plan artifacts only when the project policy allows plan/archive housekeeping.

## Quality Rules

- Prefer documented facts over inference; label inference explicitly.
- Keep plans concise and maintainable.
- Use local repository terminology and existing module names.
- Validation steps must be executable commands or concrete review checks.
- Avoid turning explanatory numbered lists into executable implementation plans. Use concrete action-oriented `Plan:` steps only when a real active plan artifact is being created or updated.

## Execution Rule

Do not implement source/config changes until the plan is clear and the user asks to proceed.
