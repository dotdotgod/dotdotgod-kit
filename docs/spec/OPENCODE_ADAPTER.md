# OpenCode Adapter

## Package And Resources

`dotdotgod adapter install opencode` installs a local V2 ESM plugin and adds one
`plugins` entry to the selected config. Project scope is default; see
[scope and conflict rules](cli/ADAPTER.md). It registers three commands
(`dd:load`, `dd:init`, `dd:impact`) and four skills (`project-load`,
`doc-first-planning`, `project-initializer`, `impact-review`). The two
[optional skills](cli/ADAPTER.md#optional-skills) are managed separately.
Commands preserve prompt attachments and delivery mode. Skill paths identify the
actual SKILL.md so supporting files resolve from the installed package.

The adapter registers `dotdotgod_context` via the shared CLI `mcp` entrypoint,
with Code Mode enabled and rooted in the active checkout. It adds no duplicate
execution/search/project tools. The thin runtime loader verifies that the bound
CLI belongs to `@dotdotgod/cli` before importing its fixed internal OpenCode
runtime for load and impact. If that import fails, advisory hooks fail open;
native Plan Mode protections are independent. `AGENTS.md` remains canonical;
no `OPENCODE.md` or project-memory scaffold is added.

All nineteen shared tool names are unprefixed, including project_load,
project_impact, impact_status, and execute; the dotdotgod_context server namespace
remains. No legacy forwarding aliases are registered. Reload sessions after
upgrading and update saved calls/prompts that reference removed names.

## Native Plan Integration

Use the native plan agent; dd:plan is not registered. Once a concrete task plan
exists, the agent saves it automatically to docs/plan/<task-slug>/README.md,
without requiring an explicit save request. Use a kebab-case directory, English
Markdown, scope, executable steps, verification and unresolved decisions. Reuse
the task file as feedback changes the plan; never overwrite unrelated plans.
Early clarification and explanation-only exchanges need no file. An unresolved
decision can remain in a saved draft. Saving is not execution approval.

Integration targets OpenCode 2.1.2. It recognizes the native reminder, replaces
the explicit-save-only policy and path in outgoing requests, and replaces the
shipped edit exception in place. Later global/agent/session denies remain in
force. Other edits and delegating mutations remain forbidden in plan mode.
Implementation still requires the user to switch agents.

No broad permission-evaluation allow hook is installed. Unknown versions or
reminder/permission layouts report unavailable integration and retain native
restrictions instead of claiming successful automatic storage. The agent uses
normal write/edit tools; the plugin does not dump or summarize transcripts into
files. Compatible context transformation does not rewrite persisted history.

## Project Memory Load

`session.hook("context")` assesses initialized repositories with a valid session
ID and a matching checkout (`isLocalSession`). It reads only the last user
message's text, discards non-text parts, and strips `<system-reminder>` blocks
before triage. While unloaded it can offer non-forcing `advisory` guidance or
apply the configured [Decision Config](DECISION_CONFIG.md) mode.

Load advice and bounded read-only prefetch go into `event.system`. That context
is ephemeral (P-06): successful prefetch marks `loaded`, so the block is not
re-injected on later turns while the load record is current. Later turns can
rely only on retained conversation content or request an explicit load.

The Code Mode executor wrapper marks successful `project_load` results loaded.
The native `execute.after` hook also marks completed
`dotdotgod_context_project_load` calls. Both use `markLoaded()` for the initialized
local session in `impact.sqlite` v3.

## Advisory Impact

Successful observed edit/write/patch operations add contained paths to durable
session-local pending state. Failed operations add nothing. Do not import all
git changes as session edits. Plan/archive, cache, dependency and build artifacts
are excluded. Shell/script, external-editor and unrecognized-tool mutations are
not claimed as automatically tracked.

MCP executors receive the real host session ID, including Code Mode calls.
Successful project impact clears only requested pending paths with unchanged
revision and current-review content. Failures, cancellation and concurrent edits
retain state. A status tool and bounded context reminder expose pending paths.
All pending revisions also expire after [24 hours](CONTEXT_RETENTION.md); expiry
does not mean reviewed, and an empty pending list is not proof of review.
Pending impact never denies tools or adds approval dialogs; user permissions,
native shell rules and plan-only restrictions are separate.

## Shared MCP Boundary

Document/code query, execution, indexing and retained-result search use shared
MCP services. Preserve isError, structuredContent, command status and source IDs.
Project query and retained-output FTS are different retrieval layers. MCP command
execution is write-capable, not a sandbox; it checks host shell permissions but
does not reproduce the native shell scanner for compound commands.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/assets/adapters/opencode/src/index.mjs](../../packages/cli/assets/adapters/opencode/src/index.mjs)
  - [packages/cli/assets/adapters/opencode/src/resources.mjs](../../packages/cli/assets/adapters/opencode/src/resources.mjs)
  - [packages/cli/assets/adapters/opencode/src/plan.mjs](../../packages/cli/assets/adapters/opencode/src/plan.mjs)
  - [packages/cli/assets/adapters/opencode/src/mcp.mjs](../../packages/cli/assets/adapters/opencode/src/mcp.mjs)
  - [packages/cli/assets/adapters/opencode/src/impact.mjs](../../packages/cli/assets/adapters/opencode/src/impact.mjs)
  - [packages/cli/assets/adapters/opencode/src/location.mjs](../../packages/cli/assets/adapters/opencode/src/location.mjs)
  - [packages/cli/src/context/impact-state.mjs](../../packages/cli/src/context/impact-state.mjs)
  - [packages/cli/src/context/server.mjs](../../packages/cli/src/context/server.mjs)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
  - [packages/cli/src/adapters/hosts/opencode.mjs](../../packages/cli/src/adapters/hosts/opencode.mjs)
  - [packages/cli/assets/adapters/opencode/src/load.mjs](../../packages/cli/assets/adapters/opencode/src/load.mjs)
  - [packages/cli/src/context/opencode-runtime.mjs](../../packages/cli/src/context/opencode-runtime.mjs)
- Verified by:
  - [packages/cli/test/adapters/opencode-plugin.test.mjs](../../packages/cli/test/adapters/opencode-plugin.test.mjs)
  - [packages/cli/test/context/impact-state.test.mjs](../../packages/cli/test/context/impact-state.test.mjs)
  - [packages/cli/test/context/mcp.test.mjs](../../packages/cli/test/context/mcp.test.mjs)
  - [packages/cli/test/adapters/packaging-contract.test.mjs](../../packages/cli/test/adapters/packaging-contract.test.mjs)
  - [docs/test/OPENCODE_ADAPTER.md](../test/OPENCODE_ADAPTER.md)
- Related docs:
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
  - [docs/spec/DECISION_CONFIG.md](DECISION_CONFIG.md)
  - [docs/test/manual-smoke/OPENCODE_ADAPTER.md](../test/manual-smoke/OPENCODE_ADAPTER.md)
- Design decisions:
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/assets/adapters/opencode/src/index.mjs","packages/cli/assets/adapters/opencode/src/resources.mjs","packages/cli/assets/adapters/opencode/src/plan.mjs","packages/cli/assets/adapters/opencode/src/mcp.mjs","packages/cli/assets/adapters/opencode/src/impact.mjs","packages/cli/assets/adapters/opencode/src/location.mjs","packages/cli/src/context/impact-state.mjs","packages/cli/src/context/server.mjs","scripts/generate-adapters.mjs","packages/cli/src/adapters/hosts/opencode.mjs","packages/cli/assets/adapters/opencode/src/load.mjs","packages/cli/src/context/opencode-runtime.mjs"],"verifiedBy":["packages/cli/test/adapters/opencode-plugin.test.mjs","packages/cli/test/context/impact-state.test.mjs","packages/cli/test/context/mcp.test.mjs","packages/cli/test/adapters/packaging-contract.test.mjs","docs/test/OPENCODE_ADAPTER.md"],"relatedDocs":["docs/spec/CONTEXT_EXECUTION.md","docs/spec/DECISION_CONFIG.md","docs/test/manual-smoke/OPENCODE_ADAPTER.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
