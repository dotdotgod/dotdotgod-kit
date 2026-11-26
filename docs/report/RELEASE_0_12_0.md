# Release 0.12.0

## Unified CLI Runtime And Pi Plan Mode Verification Loop

Release `0.12.0` consolidates the workspace into three packages (`@dotdotgod/cli`, `@dotdotgod/pi`, and private `@dotdotgod/obsidian`), unifies advisory project-memory loading across all six hosts, and upgrades Pi Plan Mode with observed execution verification.

- **Unified CLI Runtime & Host Installer (`@dotdotgod/cli`)**:
  - Absorbs `@dotdotgod/context`, `@dotdotgod/shared`, `@dotdotgod/skills`, and the five standalone adapter packages (`claude-code`, `codex`, `antigravity`, `opencode`, `hermes`) plus the root `.claude-plugin` marketplace into `@dotdotgod/cli`.
  - Ships `dotdotgod mcp`, supported package exports (`/decision`, `/impact`, `/memory/config`, `/context`, `/hooks`, `/server`), and `dotdotgod adapter install|uninstall|status <host>` (plus `--with-skills` for `ddg-planning` and `document-clarify`).
  - Eliminates duplicated adapter runtime bundles while preserving existing project stores, graph/outline caches, and Obsidian's community build layout (`packages/obsidian/scripts/dev/`).
  - Retires the seven legacy public npm packages (`@dotdotgod/context`, `@dotdotgod/claude-code`, `@dotdotgod/codex`, `@dotdotgod/antigravity`, `@dotdotgod/opencode`, `@dotdotgod/hermes`, `@dotdotgod/skills`) with migration guidance in [ADAPTER_MIGRATION.md](../spec/ADAPTER_MIGRATION.md).
- **Advisory Load & Optional Decision-Model Triage**:
  - Standardizes zero-config `advisory` project-memory loading across all six hosts with optional decision-model triage (`ollama`, `openai-compatible`, Pi `host`), configurable `advice`/`prefetch`, and SQLite v3 `load_state`.
- **Pi Plan Mode Execution Verification Loop (`@dotdotgod/pi`)**:
  - Adds `## Verification` and `## Re-plan If` plan contracts, canonical single-snapshot review with fail-closed `Execute` canonical+byte drift rechecks, and candidate-vs-approved isolation.
  - Tracks observed edits (`Q2=A` source/config/runtime prompt debt vs. plain-doc stale-only edits) and bash/MCP `execute` receipts in branch-scoped v2 session JSONL (`executionEvidence`).
  - Evaluates the 11-step `agent_before_settle` gate (approval-turn `noop`, max 3 bounded auto-continuations per run, pause states, `[REPLAN]` / 2-consecutive-failure escalation back to restricted planning with pre-await revocation), persist-first non-aborted `agent_settled` completion, 3-channel non-UI delivery (`!hasUI && mode !== "print"`), `Q1=A` legacy recovery, and 4 opt-in `--dd-context-debug` metrics.

## Version Alignment And Verification

Workspace packages (`@dotdotgod/cli`, `@dotdotgod/pi`, `@dotdotgod/obsidian`) and Obsidian metadata (`manifest.json`, `versions.json`, minimum Obsidian `1.14.5`) align to `0.12.0`. Full workspace `pnpm run verify` (`@dotdotgod/cli` 442/442, `@dotdotgod/obsidian` 12/12, `@dotdotgod/pi` 344 tests / 0 fail), `verify:generated`, `verify:contract`, `traceability links --check`, `validate --include-local-memory`, `pack:dry-run`, and 7 automated live Pi `1.6.1` scenarios (`S1a`, `S1b`, `S2a`–`S2c`, `S4-RPC`, `S4-LiveExec`) passed. Interactive TUI Esc/`/tree` (`S3`, `S4-TUI`/`S4-TREE`) and live nested `codemode` MCP (`S4-MCP`, covered deterministically in `H9`) remain manual acceptance items.
