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
- Write all documents under `docs/` in English.
- Run the source-checkout validation command listed below after docs changes when the CLI is available, and follow its traceability guidance for behavior specs.
- Follow the project code conventions in `docs/arch/CODE_CONVENTIONS.md`.
- For Pi-specific implementation questions, consult the local Pi docs and examples before changing extension or skill behavior.

## Context Tool Selection

- When available and permitted by the current mode, prefer `dotdotgod_execute` with a `commands` array (1..100 entries) and per-command `outputMode: "auto"` for commands whose output size is unknown, including tests and builds. Small output stays direct; larger output is indexed. Do not predict exact output size first.
- Group independent known commands in one execute call; separate commands dependent on earlier results. Single-command calls also return a batch: inspect each `results` entry and its `indexed.id`, not top-level command fields. Do not bypass permissions or safety gates.
- Use `indexed` for known-large output you need to search; use `discard` only when status alone provides sufficient evidence. Check `ok`, `code`, `timedOut`, `aborted`, and `captureLimitExceeded` before claiming success.
- Search retained output by its source ID (`indexed.id` for execution, `id` for file ingestion), with a small `limit` and appropriate scope/session filters. For failed commands, try `fail OR error OR reason`; if unmatched, try concrete diagnostic terms or `*` for bounded browsing with the same filters. Empty results mean no match, not successful verification. Retrieved excerpts, including wildcard results, do not prove complete inspection; report an unsupported cause as unverified, not absent.
- In Pi codemode, prefer `tools.dotdotgod_execute(...)` over `tools.bash(...)` for unknown output. Native non-graph-impact dotdotgod tools return structured objects: access fields directly (do not use `JSON.parse`), inspect status, and return only bounded evidence/metadata. Store source IDs, not raw logs, across scripts.
- Keep direct `read` for short, located source, exact code inspection, and images. Context FTS search does not require document-query embeddings. Do not index every file by default.
- These choices do not authorize blocked commands or bypass Plan Mode/impact gates. Use only active, permitted tools; enabling codemode or changing permissions requires separate approval.

## Commands

Use source-checkout commands in this repository. Use installed `dotdotgod` or `npx @dotdotgod/cli` commands only when working from a consumer project.

```bash
# Test/install the Pi adapter locally
pi install /path/to/dotdotgod/packages/pi

# Run the project initializer dry-run against the current project
node packages/cli/bin/dotdotgod.mjs init . --dry-run --project-name dotdotgod

# Verify docs/project memory after docs changes
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index

# Verify all workspace packages before release-style handoff
pnpm run verify
```

For the fuller command matrix, see `docs/test/README.md`.

## Documentation Map

- `docs/concept/`: explanatory concepts, comparisons, and measurement design that frame the project without defining behavior contracts.
- `docs/spec/`: product behavior, API contracts, user-facing requirements.
- `docs/test/`: test strategy, regression cases, manual verification notes.
- `docs/arch/`: architecture decisions, code conventions, module boundaries, data flow, infrastructure/runtime dependencies, integration boundaries, and migration design.
- `docs/report/`: tracked analysis reports and measurement summaries that are useful for current project review but are not behavior contracts.
- `docs/`: all directories use kebab-case; all markdown file names use UPPER_SNAKE_CASE, including `README.md`.
- `docs/`: prefer keeping individual markdown files under the configured markdown validation budgets (default 200 lines and 10,000 characters); split larger docs into focused UPPER_SNAKE_CASE files and keep `README.md` as the index/overview unless a narrow size-check exception is configured.
- `docs/`: when adding, renaming, splitting, moving, or archiving docs, update the nearest relevant `README.md` index/table of contents in the same change.
- `docs/`: each docs subdirectory `README.md` acts as the local table of contents; list important files, task directories, status, and a one-line purpose for each entry.
- `docs/`: start small with a single focused markdown file; when one domain grows into multiple docs, promote it to `docs/<area>/<domain>/README.md` plus related UPPER_SNAKE_CASE files in that directory.
- `docs/arch/`: code conventions may start as `CODE_CONVENTIONS.md`; when they grow across multiple topics, use `docs/arch/conventions/README.md` as the index with supporting UPPER_SNAKE_CASE files.
- `docs/spec`, `docs/arch`, and `docs/test` filenames are LLM context signals; avoid sequence-based names such as `API_1.md`, and use UPPER_SNAKE_CASE names that reveal the API path, screen, policy, or domain.
- `docs/plan/`: local active implementation plans. Create one kebab-case directory per task (`docs/plan/<task-slug>/`), keep the task overview/index in that directory's `README.md`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- `docs/post/`: local project posts about questions, decisions, experiments, and implementation work. Create one kebab-case directory per post (`docs/post/<post-slug>/`) and keep the post or overview in that directory's `README.md`. Ignored by git by default.
- `docs/archive/`: local completed plans, temporary/private reports, historical notes, payload captures. Move completed plan task directories to `docs/archive/plan/<task-slug>/`; put temporary reports and investigations under `docs/archive/report/<report-slug>/`. Ignored by git by default.

## Agent-Specific Entrypoints

- `CLAUDE.md` imports this file with `@AGENTS.md`.
- `CODEX.md` points users to this file.

Keep long-lived instructions here so agent-specific files do not drift.
