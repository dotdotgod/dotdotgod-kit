# Hook Tests

These checks cover packaged non-blocking advisory hooks across Claude Code, Codex, and Antigravity, plus optional user-configured hook guidance. Packaged hooks never block host edits, tests, builds, commits, or other tools; all pending state lives in `.dotdotgod/context/impact.sqlite` v2 while legacy `.dotdotgod/context/runtime/*.json` files are ignored.

- **Claude Code & Codex (`hooks/hooks.json`)**: `SessionStart`, `UserPromptSubmit`, and `PostToolUse` (`PreToolUse` is removed from `hooks.json`; invoking `pretooluse` directly returns `{}`).
- **Antigravity (`hooks.json`)**: `PostToolUse` and `PreInvocation` (`rules/AGENTS.md` replaces `SessionStart`; no `PreToolUse` or `Stop`).

## Automated Checks

- `packages/context/test/hooks.test.mjs` (`HK-01`..`HK-05`):
  - `HK-01`: `extractHookSessionId` rejects empty, traversal, 129-char, or non-string IDs and returns `null` (no `'default'` fallback, no DB created).
  - `HK-02`: `isInitializedProject` rejects symlinked `dotdotgod.config.json` and symlinked `.dotdotgod`; `selectWorkspaceForPath` enforces segment-boundary matching (`/a/app` vs `/a/app-v2` returns `null`, `/a/app/sub` selects longest match).
  - `HK-03`: `formatHookError` and `runHookSafely` mask `$HOME`, strip `\r\n`/ANSI controls, cap stderr at `<= 240` chars, and fail open with `{}\n` + exit `0`.
  - `HK-04`..`HK-05`: Claude Code and Codex full advisory loop — `SessionStart` routing, `PostToolUse` single transition advisory on `0 -> >0` (`becameNonEmpty`), `apply_patch` multi-file tracking, `UserPromptSubmit` per-turn advisory while pending > 0, `PreToolUse` returning `{}` (never `deny`), failed `project_impact` retaining pending rows, succeeded `project_impact` clearing requested paths (`clearPaths`), third-party `mcp__other_server__project_impact` ignored, and pre-seeded legacy `.dotdotgod/context/runtime/*.json` completely ignored.
- `packages/context/test/hooks-antigravity.test.mjs` (`AG-01`..`AG-03`): Antigravity workspace isolation, CLI + App/IDE tool tracking, 1-time `PreInvocation` `claimUnnotified`, `call_mcp_tool` clearance and `isError` retention, and Option C-2 `/plan` observation. See [`ANTIGRAVITY_ADAPTER.md`](ANTIGRAVITY_ADAPTER.md).
- `pnpm --filter @dotdotgod/cli test`: validates Claude/Codex hook README JSON/TOML examples, safety policy rules, and package dry-run inclusion of `hooks/README.md`.
- `pnpm --filter @dotdotgod/claude-code run verify`, `pnpm --filter @dotdotgod/codex run verify`, and `pnpm --filter @dotdotgod/antigravity run verify`: verify packaged hook manifests and generated hook/MCP/CLI runtime drift.
- `node --test packages/context/test/adapter-packaging.test.mjs` (`AP-02`): extracts Claude Code, Codex, and Antigravity tarballs outside workspace dependency ancestry and checks advisory hook loading (no `PreToolUse`, no `runtime/*.json`, no `deny`), fail-open malformed input, MCP 19-tool startup, focused `project_load`, link/path leakage, and artifact sizes.
- `pnpm run verify:generated` and `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index`: verify generated commands/skills and hook docs freshness.

## Manual Smoke Checks

For Claude Code hook checks:

- confirm packaged defaults load only after the host's plugin hook activation/trust flow and ship `SessionStart`, `UserPromptSubmit`, and `PostToolUse` without `PreToolUse`
- confirm `PostToolUse` emits a single `0 -> >0` advisory and `UserPromptSubmit` repeats per-turn advisories without ever denying Bash, Edit, Write, tests, or git commands
- confirm failed `project_impact` retains pending rows, succeeded `project_impact` clears requested paths, unrelated MCP `PostToolUse` events leave `impact.sqlite` unchanged, and legacy `.dotdotgod/context/runtime/*.json` is ignored
- confirm optional hook examples use Claude settings JSON, keep `dotdotgod status` read-only, label `dotdotgod query`/`dotdotgod graph` as cache-aware, keep `dotdotgod validate . --include-local-memory --check-index` opt-in, and do not present undocumented `PrePlanMode`/`PostPlanMode` hooks as available

For Codex hook checks:

- confirm `[features].hooks = true` and `/hooks` trust review enable packaged `SessionStart`, `UserPromptSubmit`, and `PostToolUse` (no `PreToolUse`)
- confirm multi-file `apply_patch` updates `impact.sqlite`, `UserPromptSubmit` injects the structured JSON `additionalContext` advisory, commands are never denied, and legacy `runtime/*.json` is ignored
- confirm docs note `hooks.json` and inline `config.toml` shapes, do not imply Claude/Pi slash-command parity, and do not return raw `dotdotgod status` JSON as Stop output

For Antigravity hook checks:

- follow [`ANTIGRAVITY_ADAPTER.md`](ANTIGRAVITY_ADAPTER.md) for `PostToolUse` + `PreInvocation`, 1-time `claimUnnotified`, `call_mcp_tool` clearance/`isError` retention, and Option C-2 `/plan` observation

For all hook-enabled adapters:

- `dotdotgod index`, `pnpm run verify:cache`, full `pnpm run verify`, and archive moves must never be default automatic hook actions
- `/dd:impact`, `dd:impact`, and `/impact-review` remain the cross-agent counterparts to Pi's `/impact-check` reminders
