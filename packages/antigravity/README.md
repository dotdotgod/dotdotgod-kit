# @dotdotgod/antigravity

`document-clarify` is distributed separately through [@dotdotgod/skills](../skills/README.md).

[![npm version](https://img.shields.io/npm/v/@dotdotgod/antigravity.svg)](https://www.npmjs.com/package/@dotdotgod/antigravity) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod--kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/antigravity) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](https://github.com/dotdotgod/dotdotgod-kit/blob/main/LICENSE)

Antigravity plugin for dotdotgod's docs-first project-memory workflow: bounded context loading, durable plans, local FTS5 retrieval, and non-blocking advisory impact review across Antigravity CLI, Antigravity App, and Antigravity IDE.

## Prerequisites And Recovery

- **Node.js `>=22.5.0`** is required on `PATH` because the bundled MCP server and advisory hooks use built-in `node:sqlite`.
- Verify the active Node binary before installing:

```bash
node -v
```

- **Recovery if Antigravity spawns an older Node binary:** install or activate Node `>=22.5.0` in the shell/environment that launches Antigravity (`nvm`, `fnm`, `volta`, or system Node), restart Antigravity, and verify `/mcp` shows `dotdotgod_context` connected. Hooks fail open (returning `{}` on error) rather than blocking your session if Node is incompatible.

## Start Here

Validate and install the plugin from a published npm package directory or extracted tarball (zero-prompt activation; no environment variables required; from a monorepo checkout, run `pnpm --dir packages/antigravity pack` and install the extracted `package/` directory so workspace `node_modules/` symlinks are not copied):

```bash
agy plugin validate --strict /path/to/dotdotgod-antigravity-package
agy plugin install /path/to/dotdotgod-antigravity-package
```

Inspect active components inside Antigravity:

- **CLI**: `/plugin`, `/mcp` (`dotdotgod_context`), `/hooks` (`dotdotgod`), and `/<skill-name>`
- **Antigravity App**: **Customizations > Installed > dotdotgod**
- **Antigravity IDE**: **... > Customizations**

## Skills And Triggers

Three short workflow skills are exposed as native `/dd-*` commands and also respond to `dd:*` natural-language triggers in initialized repositories. Planning uses Antigravity's built-in `/plan` with Option C-2 sync rather than a separate planning skill:

| Skill command | Natural trigger | Purpose |
| --- | --- | --- |
| `/dd-init` | `dd:init` | Initialize or normalize shared `AGENTS.md`, docs indexes, local-memory areas, and `dotdotgod.config.json`. |
| `/dd-load` | `dd:load` | Load bounded shared project memory and optional query-focused evidence without editing tracked docs. |
| `/dd-impact` | `dd:impact` | Run `project_impact` from `dotdotgod_context` to inspect related specs, tests, commands, and source files. |

Always-on `rules/AGENTS.md` activates dotdotgod workflows **only** when `dotdotgod.config.json` or `.dotdotgod/` exists in the workspace root, staying silent in uninitialized repositories unless explicitly invoked.

## Bundled MCP And Advisory Impact

- **MCP server (`dotdotgod_context`)**: local stdio server launched from `${PLUGIN_ROOT}/mcp/server.mjs`, exposing 19 unprefixed tools (`execute`, `execute_file`, `index`, `search`, `fetch_and_index`, `session_resume`, ingestion job tools, `context_heal`, `stats`, `doctor`, `purge`, `project_load`, `project_impact`, `impact_status`, `project_initialize`, `embedding_status`, `embedding_install`). Workspace root is discovered via standard MCP `roots/list` when `DOTDOTGOD_PROJECT_ROOT` is unset.
- **Advisory-only hooks (`hooks.json`)**: registers only `PostToolUse` and `PreInvocation` (no `SessionStart`, `PreToolUse`, or `Stop`).
  - `PostToolUse` tracks successful workspace edits (both CLI `write_file`/`edit_file` and App/IDE `write_to_file`/`replace_file_content`/`multi_replace_file_content`) in `.dotdotgod/context/impact.sqlite` (24-hour TTL), ignoring `<docRoot>/plan/**`, `<docRoot>/archive/**`, build/cache directories, and failed tool calls.
  - `PreInvocation` claims unnotified pending paths once (`pending.notified: 0 -> 1`) and injects a non-blocking advisory `systemMessage` (re-notifying only if files are newly edited). Pending impact **never blocks** edits, tests, builds, commits, or other tools.
  - Successful `PostToolUse` for `dotdotgod_context` `project_impact` clears the reviewed paths (`clearPaths`); failed calls (`error` or `isError: true`) retain pending state.
- **`sessionBound: false` note**: Antigravity launches the stdio MCP server without sharing the hook's `conversationId`. Consequently, direct `impact_status` and `project_impact.impactStatus` responses report `sessionBound: false` with static guidance and do not inspect hook-tracked pending rows (nor create `impact.sqlite`). Pending impact tracking and clearance in Antigravity are managed by the `PostToolUse` and `PreInvocation` hooks keyed by `conversationId`.

## Native `/plan` Integration (Option C-2)

Antigravity's native `/plan` artifact (`<artifactDirectoryPath>/implementation_plan.md`), inline comments, and **Proceed** UI remain 100% host-owned and untouched:

1. When a write/edit tool updates `<artifactDirectoryPath>/implementation_plan.md`, `PostToolUse` hashes the file read-only (2 MiB cap, symlink/FIFO-safe, no workspace writes, no `$HOME` path stored) into `plan_notices`.
2. On the next `PreInvocation`, the hook injects a one-time advisory reminding the model to persist the concrete plan to `<docRoot>/plan/<task-slug>/README.md` and update `<docRoot>/plan/README.md` using native file write tools only when workspace write permissions allow.
3. Writing `<docRoot>/plan/**/*.md` clears the pending plan sync notice. Moving completed plans to `<docRoot>/archive/plan/<task-slug>/` remains explicit and manual.

## Local Development

```bash
pnpm --filter @dotdotgod/antigravity run verify
pnpm --filter @dotdotgod/antigravity run pack:dry-run
```
