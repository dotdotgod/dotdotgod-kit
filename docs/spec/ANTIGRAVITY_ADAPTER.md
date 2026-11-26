# Antigravity Adapter

## Plugin Layout And Resources

Install the native Antigravity CLI/App/IDE plugin with
`dotdotgod adapter install antigravity`. It writes `~/.gemini/config/plugins/dotdotgod/`
for direct discovery. The rendered pinned plugin must pass
`agy plugin validate --strict` with zero errors and zero warnings; its manifest
has no required `variables`. Restart Antigravity and enable it in the host if needed.

- Manifest (`plugin.json`): declares `$schema`
  (`https://antigravity.google/schemas/v1/plugin.json`), `name: "dotdotgod"`,
  `displayName: "dotdotgod"`, `logo: "assets/logo.svg"`, up to three
  `suggestedPrompts`, repository metadata, and `Elastic-2.0` license.
- Icon (`assets/logo.svg`): static 512x512 pastel yellow-green vector mark
  (`<= 16 KiB`), free of `<script>`, `<foreignObject>`, event handlers, DTD or
  entity declarations, and external URLs.
- MCP (`mcp_config.json`): declares `mcpServers.context` running
  the shared CLI with `mcp`, which Antigravity exposes as
  `dotdotgod_context` with 19 unprefixed tools.
- Hooks (`hooks.json`): root hook config registering only `PostToolUse` and
  `PreInvocation` under `"dotdotgod"` (no `SessionStart`, `PreToolUse`, or
  `Stop` hooks). `PreInvocation` has `timeout: 25` seconds.
- Rules (`rules/AGENTS.md`): concise always-on router that activates ONLY when
  `dotdotgod.config.json` or `.dotdotgod/` exists in the workspace root and
  stays silent in uninitialized repositories unless explicitly invoked. It never
  self-activates from an `AGENTS.md` mention, never bypasses host permissions,
  sandbox, or `/plan` gates, and treats MCP outputs (`instructionAuthority: "none"`)
  and hook paths as untrusted data.
- Skills (`skills/`): bundles three short generated skills exposed as native
  `/dd-*` commands with `dd:*` natural-language triggers: `dd-init` (`dd:init`),
  `dd-load` (`dd:load`), and `dd-impact` (`dd:impact`). Planning uses
  Antigravity's built-in `/plan` with Option C-2 sync rather than a separate
  `doc-first-planning` skill. No root `commands/` folder is shipped.
  The two [optional skills](cli/ADAPTER.md#optional-skills) are separate from the plugin.
- Hooks run the shared CLI with `hook antigravity <event>`.
  `AGENTS.md` remains canonical; no `ANTIGRAVITY.md` or `GEMINI.md` is scaffolded.

## Runtime And MCP Boundary

The installer checks Node.js `>=22.5.0` with built-in `node:sqlite`.
Use the default pinned binding for GUI launches with a restricted `PATH`.
Once invoked, hook dispatch fails open (`{}` and exit `0`) on input or runtime
errors, with one bounded stderr line and HOME paths masked. A missing launcher
cannot return a hook response; inspect `adapter status` and rebind.

Antigravity spawns plugin MCP servers with `process.cwd() = ${PLUGIN_ROOT}`.
When `DOTDOTGOD_PROJECT_ROOT` is unset and the client advertises
`capabilities.roots`, the server resolves the workspace root via standard MCP
`roots/list` (and `notifications/roots/list_changed`), falling back to
`process.cwd()` for non-roots clients.

Antigravity does not pass hook `conversationId` to the stdio MCP server. Direct
`impact_status` and `project_impact.impactStatus` calls therefore report
`sessionBound: false` with a single-line static `guidance` (`<= 120` chars, no
path or session leakage) and do not open or create `impact.sqlite`.

## Advisory Impact Hooks

Hooks validate `conversationId` strictly via `validateSessionId` and fail open
(`{}`) when missing or invalid (no `'default'` fallback). Initialized
workspaces are selected strictly from payload `workspacePaths` or `cwd` (non-symlink
`dotdotgod.config.json` regular file or `.dotdotgod` directory); hooks never
fall back to `process.cwd()` or create `.dotdotgod/` in uninitialized repos.

- `PostToolUse` tracks successful CLI (`write_file`, `edit_file`) and App/IDE
  (`write_to_file`, `replace_file_content`, `multi_replace_file_content`) edits
  inside initialized workspaces in `.dotdotgod/context/impact.sqlite` v3
  (24-hour fixed TTL). Paths outside the canonical root, `node_modules`, `.git`,
  `.dotdotgod`, `dist`, `build`, `coverage`, and `<docRoot>/(plan|archive)` are
  excluded; `<docRoot>/post` remains tracked.
- Failed tool results (`error`, `isError`, `is_error`, `ok === false`, or
  `status` in `error`/`failed`) neither mark nor clear pending state.
- Because Antigravity persists `PreInvocation` `injectSteps` in trajectory,
  `PreInvocation` claims unnotified rows once via atomic `claimUnnotified`
  (`pending.notified: 0 -> 1`, reset to `0` on new or repeated edits) and injects
  a non-blocking advisory `systemMessage` with sanitized untrusted-data paths.
  Pending impact never blocks edits, tests, builds, commits, or other tools.
- Successful `PostToolUse` for allowlisted `call_mcp_tool` (`ServerName` in
  `dotdotgod_context`/`dotdotgod-context`, `ToolName: "project_impact"`) or
  direct `mcp__dotdotgod_context__project_impact` /
  `dotdotgod_context__project_impact` clears requested paths via `clearPaths`;
  failed reviews retain pending rows.

## Project Memory Load

The static `rules/AGENTS.md` has one line directing the agent to call
`project_load` autonomously before substantive work unless `decision.mode` is
`manual` or the user opts out with `/dd:no-load` (A3). It adds no hook trajectory
step; the text itself cannot dynamically disappear in `manual` or on opt-out.
The agent must honor the caveat. `PreInvocation` adds no load step for `advisory`
or `manual`, including those fallback outcomes. Impact and plan notices remain
independent.

`PreInvocation` triages at most one initialized workspace: match `cwd` or use the
sole initialized workspace; if several remain and none matches, skip load triage.
`model` reads `lastUserInput` and skips missing or blank input. The internal
budget is at most 22 seconds; advice or prefetch is injected as a `systemMessage`
of at most 6,144 UTF-8 bytes. `always` produces a one-time load hint, not a gate.
See [Decision Config](DECISION_CONFIG.md) for policy and payload boundaries.

Successful `PostToolUse` for allowlisted `call_mcp_tool` with
`ToolName: "project_load"`, or for a recognized direct MCP tool name, calls
`markLoaded()` for the matched workspace/conversation. Failed results do not mark completion.

## Native Plan Integration

Antigravity's native `/plan` artifact (`<artifactDirectoryPath>/implementation_plan.md`),
inline comments, and **Proceed** approval gate remain 100% host-owned and
untouched (Option C-2).

- Successful `PostToolUse` write/edit targeting exact
  `<realpath(artifactDirectoryPath)>/implementation_plan.md` (rejecting sibling,
  workspace, or other artifact files) reads the file via a read-only, symlink-
  and FIFO-safe descriptor (`O_RDONLY | O_NOFOLLOW | O_NONBLOCK`, `fstat`
  regular-file `dev`/`ino` match, 2 MiB cap) and hashes its content into
  `plan_notices` (storing no `$HOME` path). Hooks NEVER write workspace files.
- On the next `PreInvocation`, `claimPlanNotice` injects a one-time advisory
  (`notified: 0 -> 1`, re-armed only when content hash changes) asking the model
  to persist the concrete plan to `<docRoot>/plan/<task-slug>/README.md` and
  `<docRoot>/plan/README.md` via native file write tools only when workspace
  writes are permitted.
- Writing `<docRoot>/plan/**/*.md` clears `plan_notices`. Moving completed plans
  to `<docRoot>/archive/plan/<task-slug>/` remains explicit.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/assets/adapters/antigravity/plugin.json](../../packages/cli/assets/adapters/antigravity/plugin.json)
  - [packages/cli/src/adapters/hosts/antigravity.mjs](../../packages/cli/src/adapters/hosts/antigravity.mjs)
  - [packages/cli/assets/adapters/antigravity/hooks.json](../../packages/cli/assets/adapters/antigravity/hooks.json)
  - [packages/cli/assets/adapters/antigravity/rules/AGENTS.md](../../packages/cli/assets/adapters/antigravity/rules/AGENTS.md)
  - [packages/cli/assets/adapters/antigravity/assets/logo.svg](../../packages/cli/assets/adapters/antigravity/assets/logo.svg)
  - [packages/cli/src/context/hooks-antigravity.mjs](../../packages/cli/src/context/hooks-antigravity.mjs)
  - [packages/cli/src/context/hook-state.mjs](../../packages/cli/src/context/hook-state.mjs)
  - [packages/cli/src/context/impact-state.mjs](../../packages/cli/src/context/impact-state.mjs)
  - [packages/cli/src/context/server.mjs](../../packages/cli/src/context/server.mjs)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
  - [packages/cli/src/context/decision.mjs](../../packages/cli/src/context/decision.mjs)
- Verified by:
  - [packages/cli/test/context/hooks-antigravity.test.mjs](../../packages/cli/test/context/hooks-antigravity.test.mjs)
  - [packages/cli/test/adapters/antigravity-resources.test.mjs](../../packages/cli/test/adapters/antigravity-resources.test.mjs)
  - [packages/cli/test/adapters/runtime-smoke.test.mjs](../../packages/cli/test/adapters/runtime-smoke.test.mjs)
  - [docs/test/ANTIGRAVITY_ADAPTER.md](../test/ANTIGRAVITY_ADAPTER.md)
- Related docs:
  - [docs/spec/ADVISORY_IMPACT.md](ADVISORY_IMPACT.md)
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
  - [docs/spec/CROSS_AGENT_SUPPORT.md](CROSS_AGENT_SUPPORT.md)
  - [docs/spec/NATIVE_PLAN_STORAGE.md](NATIVE_PLAN_STORAGE.md)
  - [docs/spec/DECISION_CONFIG.md](DECISION_CONFIG.md)
- Design decisions:
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
  - [docs/arch/NATIVE_PLAN_INTEGRATION.md](../arch/NATIVE_PLAN_INTEGRATION.md)
- Contracts:
  - `ANTIGRAVITY-PLUGIN-001` — Native Antigravity plugin layout, skills, scoped rules, and MCP roots discovery (sections: 2, implementedBy: 5, verifiedBy: 3, relatedDocs: 2)
  - `ANTIGRAVITY-IMPACT-001` — Non-blocking advisory impact tracking, one-time PreInvocation notice, and PostToolUse clearance (sections: 1, implementedBy: 4, verifiedBy: 2, relatedDocs: 1)
  - `ANTIGRAVITY-PLAN-001` — Read-only native /plan artifact observation and one-time workspace save advisory (sections: 1, implementedBy: 3, verifiedBy: 2, relatedDocs: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/assets/adapters/antigravity/plugin.json","packages/cli/src/adapters/hosts/antigravity.mjs","packages/cli/assets/adapters/antigravity/hooks.json","packages/cli/assets/adapters/antigravity/rules/AGENTS.md","packages/cli/assets/adapters/antigravity/assets/logo.svg","packages/cli/src/context/hooks-antigravity.mjs","packages/cli/src/context/hook-state.mjs","packages/cli/src/context/impact-state.mjs","packages/cli/src/context/server.mjs","scripts/generate-adapters.mjs","packages/cli/src/context/decision.mjs"],"verifiedBy":["packages/cli/test/context/hooks-antigravity.test.mjs","packages/cli/test/adapters/antigravity-resources.test.mjs","packages/cli/test/adapters/runtime-smoke.test.mjs","docs/test/ANTIGRAVITY_ADAPTER.md"],"relatedDocs":["docs/spec/ADVISORY_IMPACT.md","docs/spec/CONTEXT_EXECUTION.md","docs/spec/CROSS_AGENT_SUPPORT.md","docs/spec/NATIVE_PLAN_STORAGE.md","docs/spec/DECISION_CONFIG.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md","docs/arch/NATIVE_PLAN_INTEGRATION.md"],"contracts":[{"id":"ANTIGRAVITY-PLUGIN-001","title":"Native Antigravity plugin layout, skills, scoped rules, and MCP roots discovery","sections":["Plugin Layout And Resources","Runtime And MCP Boundary"],"implementedBy":["packages/cli/assets/adapters/antigravity/plugin.json","packages/cli/src/adapters/hosts/antigravity.mjs","packages/cli/assets/adapters/antigravity/rules/AGENTS.md","packages/cli/assets/adapters/antigravity/assets/logo.svg","packages/cli/src/context/server.mjs"],"verifiedBy":["packages/cli/test/adapters/antigravity-resources.test.mjs","packages/cli/test/adapters/runtime-smoke.test.mjs","docs/test/ANTIGRAVITY_ADAPTER.md"],"relatedDocs":["docs/spec/CROSS_AGENT_SUPPORT.md","docs/spec/CONTEXT_EXECUTION.md"]},{"id":"ANTIGRAVITY-IMPACT-001","title":"Non-blocking advisory impact tracking, one-time PreInvocation notice, and PostToolUse clearance","sections":["Advisory Impact Hooks"],"implementedBy":["packages/cli/assets/adapters/antigravity/hooks.json","packages/cli/src/context/hooks-antigravity.mjs","packages/cli/src/context/hook-state.mjs","packages/cli/src/context/impact-state.mjs"],"verifiedBy":["packages/cli/test/context/hooks-antigravity.test.mjs","docs/test/ANTIGRAVITY_ADAPTER.md"],"relatedDocs":["docs/spec/ADVISORY_IMPACT.md"]},{"id":"ANTIGRAVITY-PLAN-001","title":"Read-only native /plan artifact observation and one-time workspace save advisory","sections":["Native Plan Integration"],"implementedBy":["packages/cli/assets/adapters/antigravity/hooks.json","packages/cli/src/context/hooks-antigravity.mjs","packages/cli/src/context/impact-state.mjs"],"verifiedBy":["packages/cli/test/context/hooks-antigravity.test.mjs","docs/test/ANTIGRAVITY_ADAPTER.md"],"relatedDocs":["docs/spec/NATIVE_PLAN_STORAGE.md"]}]}
```
