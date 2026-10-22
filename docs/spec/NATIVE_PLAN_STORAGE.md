# Native Plan Storage

## Claude Code

`dotdotgod init <root> --claude-plans` opts into project-local native plans.
The CLI adds `plansDirectory: "./docs/plan"` to `.claude/settings.json`, using
the resolved documentation root instead of `docs` when configured. Other keys
and existing `plansDirectory` values are preserved. Dry-run reports the proposed
action without writes. Invalid JSON/non-object settings and settings symlinks
fail before scaffolding. No global settings, permissions or existing plans move.

The POSIX fallback has no settings-merge support; use the adapter's bundled
`mcp/cli.mjs` with Node when the installed CLI is unavailable. Native file naming
belongs to Claude Code, not the task README convention. Native Plan Mode does
not gain arbitrary shared-plan write permission. Mods are not required.

## Adapter Boundaries

Planning Markdown under the resolved local plan directory does not create
Claude/Codex source-impact pending gates. Other edits retain their existing
hook policy. Hook/MCP internal caches and state are not claimed to be confined
by the model's plan permission profile. Hermes has no native Plan Mode; its
permissions and impact policy are unchanged. OpenCode keeps its separate native
plan-agent integration.

## Traceability





<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/claude-plans.mjs](../../packages/cli/src/claude-plans.mjs)
  - [packages/cli/src/init.mjs](../../packages/cli/src/init.mjs)
  - [packages/context/src/hooks.mjs](../../packages/context/src/hooks.mjs)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
- Verified by:
  - [packages/cli/test/claude-plans.test.mjs](../../packages/cli/test/claude-plans.test.mjs)
  - [packages/claude-code/scripts/smoke-plans.mjs](../../packages/claude-code/scripts/smoke-plans.mjs)
  - [packages/context/test/hooks.test.mjs](../../packages/context/test/hooks.test.mjs)
- Related docs:
  - [docs/test/NATIVE_PLAN_STORAGE.md](../test/NATIVE_PLAN_STORAGE.md)
  - [docs/spec/PROJECT_INITIALIZER.md](PROJECT_INITIALIZER.md)
- Design decisions:
  - [docs/arch/NATIVE_PLAN_INTEGRATION.md](../arch/NATIVE_PLAN_INTEGRATION.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/claude-plans.mjs","packages/cli/src/init.mjs","packages/context/src/hooks.mjs","scripts/generate-adapters.mjs"],"verifiedBy":["packages/cli/test/claude-plans.test.mjs","packages/claude-code/scripts/smoke-plans.mjs","packages/context/test/hooks.test.mjs"],"relatedDocs":["docs/test/NATIVE_PLAN_STORAGE.md","docs/spec/PROJECT_INITIALIZER.md"],"designDecisions":["docs/arch/NATIVE_PLAN_INTEGRATION.md"]}
```
