# OpenCode Adapter

## Package And Resources

`@dotdotgod/opencode` is a V2 ESM plugin. Shared workflows generate three commands
(`dd:load`, `dd:init`, `dd:impact`) and five skills (project-load,
doc-first-planning, project-initializer, impact-review, document-clarify).
Commands preserve prompt attachments and delivery mode. Skill paths identify the
actual SKILL.md so supporting files resolve from the installed package.

The adapter registers the bundled dotdotgod_context stdio MCP server with Code
Mode enabled, using the active checkout rather than another canonical worktree.
It adds no duplicate native execution/search/project tools. Node >=22.5 must be
available. AGENTS.md remains canonical; no OPENCODE.md or local scaffold is added.

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
  - [packages/opencode/src/index.mjs](../../packages/opencode/src/index.mjs)
  - [packages/opencode/src/resources.mjs](../../packages/opencode/src/resources.mjs)
  - [packages/opencode/src/plan.mjs](../../packages/opencode/src/plan.mjs)
  - [packages/opencode/src/mcp.mjs](../../packages/opencode/src/mcp.mjs)
  - [packages/opencode/src/impact.mjs](../../packages/opencode/src/impact.mjs)
  - [packages/opencode/src/location.mjs](../../packages/opencode/src/location.mjs)
  - [packages/context/src/impact-state.mjs](../../packages/context/src/impact-state.mjs)
  - [packages/context/src/server.mjs](../../packages/context/src/server.mjs)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
  - [scripts/build-adapter-runtime.mjs](../../scripts/build-adapter-runtime.mjs)
- Verified by:
  - [packages/opencode/test/plugin.test.mjs](../../packages/opencode/test/plugin.test.mjs)
  - [packages/opencode/scripts/smoke.mjs](../../packages/opencode/scripts/smoke.mjs)
  - [packages/context/test/impact-state.test.mjs](../../packages/context/test/impact-state.test.mjs)
  - [packages/context/test/mcp.test.mjs](../../packages/context/test/mcp.test.mjs)
  - [packages/context/test/opencode-packaging.test.mjs](../../packages/context/test/opencode-packaging.test.mjs)
  - [docs/test/OPENCODE_ADAPTER.md](../test/OPENCODE_ADAPTER.md)
- Related docs:
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
- Design decisions:
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/opencode/src/index.mjs","packages/opencode/src/resources.mjs","packages/opencode/src/plan.mjs","packages/opencode/src/mcp.mjs","packages/opencode/src/impact.mjs","packages/opencode/src/location.mjs","packages/context/src/impact-state.mjs","packages/context/src/server.mjs","scripts/generate-adapters.mjs","scripts/build-adapter-runtime.mjs"],"verifiedBy":["packages/opencode/test/plugin.test.mjs","packages/opencode/scripts/smoke.mjs","packages/context/test/impact-state.test.mjs","packages/context/test/mcp.test.mjs","packages/context/test/opencode-packaging.test.mjs","docs/test/OPENCODE_ADAPTER.md"],"relatedDocs":["docs/spec/CONTEXT_EXECUTION.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
