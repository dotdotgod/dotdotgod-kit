# OpenCode Adapter

Dotdotgod project-memory workflows for OpenCode V2: shared MCP execution and
retrieval, native plan-agent integration, and advisory changed-file impact.

## Start Here

Requires Node.js >=22.5 on PATH. Plan integration targets OpenCode **2.1.2**.
Other versions retain native plan restrictions and report unavailable integration.

After publishing, add the package to the project's `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@dotdotgod/opencode"]
}
```

From this source checkout, run `pnpm run generate` first, then use the absolute
`packages/opencode` directory as the plugin target in a disposable project.
Local directory loading uses `index.js`; npm loading uses the package exports.
No project `.opencode/` scaffold or `OPENCODE.md` is required. Keep `AGENTS.md`
canonical. Reload/restart OpenCode after installation changes.

## Workflows

- `/dd:load`: bounded project map and optional focused query.
- `/dd:init`: initialize project memory; dry-run by default, writes confirmed.
- `/dd:impact`: review changed paths through the shared MCP tool.
- Five shared skills: project-load, doc-first-planning, project-initializer,
  impact-review, and document-clarify.

There is no `/dd:plan`. Select OpenCode's built-in plan agent. Concrete plans
are automatically saved to `docs/plan/<task-slug>/README.md` without a separate
save request, and revised in place as decisions change. Initial questions and
explanation-only conversations need no file. Saving does not approve execution:
switch agents before implementation. File creation is performed by the agent's
normal edit tools, not an automatic transcript dump.

## MCP Tools

The plugin registers `dotdotgod_context` with Code Mode enabled. Discover exact
tool names from OpenCode's catalog instead of guessing them. It supplies project
load/initialize/impact, execution, file processing, indexing, search, fetch,
diagnostics, and ingestion jobs. MCP replies retain content, structuredContent
and isError; inspect actual execution status and source IDs before claiming success.
Use auto output for unknown-size commands and bounded source-scoped retrieval.
Use native read for short, located source and images.

The nineteen shared catalog names have no `dotdotgod_` prefix: for example,
`project_load`, `project_impact`, `impact_status`, and `execute`. The server namespace
remains `dotdotgod_context`; no forwarding aliases are registered. Reload sessions
after upgrading and update saved calls/prompts that use removed names.

## Advisory Impact

Successful observed edit/write/patch operations add project-relative pending
paths. State persists per host session in `.dotdotgod/context/impact.sqlite`.
Successful MCP impact clears only covered paths whose revision and content did
not change during review. Failed reviews retain pending state. The status tool
reports a bounded list; no pending paths are silently evicted.
Records expire 24 hours after their revision is stored; expiration is not review.

Pending impact **never blocks** tests, builds, edits, commits or publishing.
Native permissions and plan-safety restrictions still apply. Shell/script,
external editor, and unrecognized tool changes are not automatically attributed;
provide their paths explicitly for review. Existing user dirty files are not
automatically imported from the whole worktree.

## Compatibility And Verification

Plan redirection recognizes the shipped reminder and replaces the shipped path
exception in place, preserving later user denies. Unsupported layouts warn rather
than force-allowing permissions. This is version-coupled integration, not an
OpenCode public path setting. MCP execution remains write-capable and is not a
filesystem sandbox; shell permission checks on MCP command strings do not
reproduce the host's full native shell scanner.

Run `pnpm --filter @dotdotgod/opencode verify`. The opt-in source-checkout command
`pnpm --filter @dotdotgod/opencode smoke` uses an installed OpenCode binary and a
local deterministic model endpoint, isolated HOME/XDG directories and its own
service port; it makes no paid model calls and stops only its isolated service.
Use `node packages/opencode/scripts/smoke.mjs <directory>` with an extracted
package to repeat that host smoke against a tarball instead of source files.
