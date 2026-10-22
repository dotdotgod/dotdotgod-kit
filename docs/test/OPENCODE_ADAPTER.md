# OpenCode Adapter Verification

## Automated Checks

- `packages/opencode/test/plugin.test.mjs`: commands/skills, attachment and
  delivery preservation, literal argument substitution, known plan reminders,
  unknown-layout warning, in-place permission exception and later user deny,
  successful/failed edit tracking, location isolation, host-owned MCP identity,
  plan-only MCP restrictions and propagation of user shell denials.
- `packages/context/test/impact-state.test.mjs`: persistence, session isolation,
  failed reviews, same-content revision changes, external content changes,
  cancellation, symlink exclusion and more than fifty retained pending paths.
- `packages/context/test/mcp.test.mjs`: real stdio catalog/schema, execution,
  search, session routing, jobs, diagnostics and explicit initialization.
- `packages/context/test/adapters.test.mjs`: bundled OpenCode MCP startup from
  an unrelated working directory.
- `packages/context/test/opencode-packaging.test.mjs`: isolated tarball imports,
  parser/resource contents, standalone Load and shared advisory-state completion.
- `scripts/build-adapter-runtime.mjs --check`: catalog/runtime/parser drift.

## Installed Host Smoke

Run `pnpm --filter @dotdotgod/opencode smoke` from the source checkout with
OpenCode 2.1.2 on PATH. It uses disposable HOME/XDG directories, an isolated
service port and local deterministic OpenAI-compatible responses. It checks
command discovery, skill routing, plan permissions, actual outgoing auto-save
instructions, real plan-file writes, user-deny/outside-plan safety, pending edit
reminders, MCP Code Mode host identity, and unprefixed impact/status review and
pending clearance. No paid model is used.
This proves integration plumbing, not a live model's compliance with guidance.
Use `node packages/opencode/scripts/smoke.mjs <directory>` with an extracted
package to test the same host behavior without workspace dependencies.

## Acceptance Checklist

Follow [manual acceptance](manual-smoke/OPENCODE_ADAPTER.md) for a real model:
automatic creation/revision, unrelated tasks, user denies, outside-plan edits,
MCP indexed output, pending tracking and failure/re-edit retention.

## Commands

```bash
pnpm run generate
pnpm --filter @dotdotgod/opencode verify
pnpm --filter @dotdotgod/pi verify
pnpm --filter @dotdotgod/context verify
pnpm run verify
pnpm run pack:dry-run
```
