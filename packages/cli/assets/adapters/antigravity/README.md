# Dotdotgod for Antigravity

Install the host artifacts with `dotdotgod adapter install antigravity` from
`@dotdotgod/cli` (Node.js `>=22.5.0`). Add `--with-skills` if you also want
`ddg-planning` and `document-clarify`. Restart the host after installing.

Use `/dd-init` (`dd:init`) to initialize project memory, `/dd-load` (`dd:load`)
to load it, and `/dd-impact` (`dd:impact`) to review graph impact. The rules
stay silent in uninitialized repositories unless explicitly invoked.

The `dotdotgod_context` MCP server uses the same CLI runtime as the advisory
hooks. MCP is `sessionBound: false` when the host does not share the hook
conversation ID; pending impact is advisory and never blocks work.

Native `/plan` and `implementation_plan.md` remain host-owned. A hook can
remind you to save a concrete plan under `docs/plan/` without bypassing
native file permissions or approval gates.
