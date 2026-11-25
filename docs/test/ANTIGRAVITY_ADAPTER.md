# Antigravity Adapter Verification

Verification coverage for `@dotdotgod/antigravity` (`packages/antigravity/`), its bundled MCP server and advisory hooks, strict plugin manifest checks, and live Antigravity CLI/App smoke scenarios. See [behavior contract](../spec/ANTIGRAVITY_ADAPTER.md).

## Automated Unit And Resource Suites

- `packages/context/test/hooks-antigravity.test.mjs` (`AG-01`..`AG-03`):
  - `AG-01`: never falls back to `process.cwd()` when workspace inputs are missing; stays silent and creates no `.dotdotgod/` directory in uninitialized repositories; rejects symlinked `dotdotgod.config.json` or `.dotdotgod`.
  - `AG-02`: tracks both CLI (`write_file`/`edit_file` with `Path`) and App/IDE (`write_to_file`/`replace_file_content`/`multi_replace_file_content` with `TargetFile`) edits; verifies 1-time `PreInvocation` `claimUnnotified` injection and re-edit reset; clears requested paths on successful `call_mcp_tool` (`ServerName: "dotdotgod_context"`, `ToolName: "project_impact"`) and direct `mcp__dotdotgod_context__project_impact`; retains pending rows on `isError: true` or non-empty `error`; ignores third-party MCP prefixes; masks DB errors without leaking raw `error.message` or `$HOME` into stdout/`injectSteps`.
  - `AG-03`: verifies Option C-2 `/plan` observation triggers only on `PostToolUse` write/edit to `<artifactDirectoryPath>/implementation_plan.md` (ignores reads, workspace `implementation_plan.md`, sibling `<artifactDirectoryPath>-evil/`, and other/nested artifacts); enforces `readArtifactBounded` `2 MiB` pass vs `2 MiB + 1 B` reject and rejects symlinks, directories, and POSIX FIFOs without blocking; confirms `plan_notices` omits `$HOME` paths, `PreInvocation` emits no permission-bypass fields, hooks never write workspace files, and `<docRoot>/plan/**/*.md` writes clear `plan_notices`.
- `packages/antigravity/test/resources.test.mjs` (`AP-01`):
  - Validates `package.json` (`@dotdotgod/antigravity`, `Elastic-2.0`, `engines.node >=22.5.0`), `plugin.json` schema/version/3 `suggestedPrompts`, `mcp_config.json` (`mcpServers.context`, `${PLUGIN_ROOT}/mcp/server.mjs`), and `hooks.json` (`PostToolUse` + `PreInvocation` only, `node ./scripts/hook-runtime.mjs`).
  - Checks `rules/AGENTS.md` (`1..25` lines) for initialized-repo activation scope, 3 short skills (`/dd-init`, `/dd-load`, `/dd-impact`) + `dd:*` triggers + native `/plan`, non-blocking advisory rule, C-2 native write boundary, approval gates, and `instructionAuthority: "none"`, and confirms `doc-first-planning` is absent.
  - Audits `assets/logo.svg` (`<= 16 KiB`, borderless pastel yellow-green palette `#D6F0B0`/`#BCE08E`/`#1F2E1A`, zero `<!DOCTYPE`/`<!ENTITY`/`<?xml-stylesheet`/`<script`/`<foreignObject`/`on*=`/external URLs).
  - Verifies `README.md` prerequisites/contracts (omitting legacy bundled-copy upgrade prose) and runs `agy plugin validate --strict --json` when `agy` is installed on `PATH`.
- `packages/context/test/adapter-packaging.test.mjs` (`AP-02`):
  - Packs and extracts `@dotdotgod/antigravity` outside workspace dependency ancestry, audits links and local-path leakage, executes bundled `scripts/hook-runtime.mjs` with valid and malformed input, initializes bundled `mcp/server.mjs` (19 tools), runs focused `project_load`, checks CLI syntax, and measures tarball/unpacked sizes.
- `packages/context/test/adapters.test.mjs`:
  - Starts `packages/antigravity/mcp/server.mjs` outside the plugin directory and verifies the full 19-tool MCP surface and `doctor` health check.
- `packages/cli/test/{document-clarify,skill-guidance,e2e}.test.mjs`:
  - Verifies `document-clarify` stays excluded from `@dotdotgod/antigravity`, generated skill guidance matches contracts, and `pack:dry-run` succeeds.

## Strict Manifest Validation And Commands

```bash
agy plugin validate --strict packages/antigravity
pnpm --filter @dotdotgod/antigravity run verify
pnpm --filter @dotdotgod/antigravity run pack:dry-run
node --test packages/context/test/hooks-antigravity.test.mjs \
  packages/antigravity/test/resources.test.mjs \
  packages/context/test/adapters.test.mjs \
  packages/context/test/adapter-packaging.test.mjs
```

`agy plugin validate --strict packages/antigravity` must exit `0` with `0` errors and `0` warnings.

## Live CLI And App Smoke Scenarios

Run sequentially in isolated disposable workspaces (`/tmp/ddg-agy-init` with `dotdotgod.config.json` and `/tmp/ddg-agy-uninit` without `dotdotgod.config.json`/`.dotdotgod/`) after verifying `$HOME/.dotdotgod` before and after:

1. **Install & presentation**: run `agy plugin validate --strict <pkg>` and `agy plugin install <pkg>`. Confirm `/mcp` shows `dotdotgod_context` (19 tools), `/hooks` lists `PostToolUse` + `PreInvocation` only, `/dd-*` lists all 3 skills (`dd-init`, `dd-load`, `dd-impact`), and Antigravity App renders `assets/logo.svg` and `rules/AGENTS.md`.
2. **Uninitialized isolation**: edit a file in `/tmp/ddg-agy-uninit`; confirm `.dotdotgod/` is not created and `$HOME/.dotdotgod` is unchanged.
3. **MCP `roots/list` & `sessionBound`**: in `/tmp/ddg-agy-init`, verify MCP startup resolves the workspace via `roots/list` (despite `cwd === ${PLUGIN_ROOT}`), `doctor` succeeds, and `impact_status` returns `sessionBound: false` with single-line `guidance` (`<= 120` chars) without creating `impact.sqlite`.
4. **Advisory impact & `call_mcp_tool` clearance**: edit `src/app.ts`; confirm 1-time `PreInvocation` advisory, run test/commit commands unblocked, confirm the next turn does not duplicate the advisory, call `call_mcp_tool` (`project_impact`) with an error (`isError: true`) to confirm pending retention, then call valid `project_impact` to confirm pending clearance.
5. **Option C-2 `/plan`**: run `/plan` writing `<artifactDirectoryPath>/implementation_plan.md`; confirm 1-time `PreInvocation` save advisory, zero hook workspace writes, intact host **Proceed** gate, no `$HOME` path in `plan_notices`, and clearance after writing `<docRoot>/plan/<slug>/README.md` via native file write tools.
6. **Cleanup**: run `agy plugin uninstall dotdotgod` and delete `/tmp/ddg-agy-*`.

## Unverified Boundaries

- Automated unit tests do not substitute for interactive Antigravity App/IDE GUI logo rendering or interactive `/plan` **Proceed** gates; record any unexecuted live GUI step as `unverified`.
- Non-POSIX Windows FIFO/symlink behavior is skipped on `win32` and unverified on macOS.
