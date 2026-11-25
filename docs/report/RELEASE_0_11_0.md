# Release 0.11.0

## Antigravity Adapter And All-Adapter Advisory Impact

Add the native `@dotdotgod/antigravity` plugin for Antigravity CLI, App, and IDE
and unify all six adapters (`pi`, `opencode`, `claude-code`, `codex`, `hermes`,
and `antigravity`) on Pi's non-blocking advisory impact model backed by
`.dotdotgod/context/impact.sqlite` v2 (24-hour fixed TTL).

- **`@dotdotgod/antigravity`**: ships root `plugin.json`, borderless pastel
  yellow-green `assets/logo.svg`, `mcp_config.json` (`dotdotgod_context`),
  `hooks.json` (`PostToolUse` + `PreInvocation`), initialized-repo-scoped
  `rules/AGENTS.md`, three short `/dd-*` skills (`/dd-init`, `/dd-load`,
  `/dd-impact`; no separate planning skill), bundled hook/MCP/CLI artifacts,
  and Option C-2 native `/plan` artifact observation (`plan_notices`, zero hook
  workspace writes).
- **Shared Core (`@dotdotgod/context`)**: splits `impact-path.mjs` and
  `hook-state.mjs`, upgrades `impact-state.mjs` to v2 WAL (`pending.notified`,
  `plan_notices`, fast read-only `write=false`, `clearPaths`, `claimUnnotified`),
  adds standard MCP `roots/list` workspace discovery when
  `DOTDOTGOD_PROJECT_ROOT` is unset, and reports `sessionBound` + bounded
  `guidance` on unbound `impact_status` and `project_impact.impactStatus`.
- **Non-Blocking Conversion**: removes `PreToolUse` blocking gates from Claude
  Code and Codex (`SessionStart` + `UserPromptSubmit` + `PostToolUse`, ignoring
  legacy `runtime/*.json`) and converts Hermes to Path 1 (`post_tool_call` +
  Python↔Node `impact.sqlite` interop, removing all three blocking sites).

## Version Alignment And Verification

Workspace packages, public-package metadata, plugin manifests, and Obsidian
metadata align to `0.11.0` (minimum Obsidian version remains `1.14.5`). Full
workspace verification, `agy plugin validate --strict`, generated-runtime
parity, docs/check-index validation, package dry-runs, Antigravity CLI packed
tarball smoke, and Hermes pinned-host smoke (`19b57f11...`) passed. Interactive
Antigravity App/IDE GUI, Claude Code, Codex `/hooks` trust, and Windows checks
remain manual acceptance items.
