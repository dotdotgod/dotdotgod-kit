# Cross-Agent Adapter Smoke Tests

## Claude Code Adapter

Run locally:

```bash
claude --plugin-dir /path/to/dotdotgod/packages/claude-code
```

Confirm these commands are discoverable or invokable:

```text
/dd:load
/dd:plan
/dd:init
```

For `/dd:load`, generated guidance should prefer `dotdotgod load-snapshot <root> --json`, treat the snapshot as the first-pass project-memory map, keep `docs/archive/README.md` as the archive map, and fall back to README-index reads when the CLI is unavailable.

## Codex Adapter

Install or add `/path/to/dotdotgod/packages/codex` with the current local plugin workflow.

Confirm `project-load`, `doc-first-planning`, and `project-initializer` skills are discoverable. Trigger phrases `dd:load`, `dd:plan`, and `dd:init` should activate the expected workflows. For `dd:load`, use the same snapshot/archive/fallback expectations as Claude Code.

## Cross-Agent Planning Parity

- Claude Code `/dd:plan` and `doc-first-planning` guidance mention the written plan file as the durable review artifact and do not reference saved-plan preview UI.
- Codex `doc-first-planning` guidance has the same planning workflow, archive housekeeping, and package-manager-aware verification guidance.
- `pnpm run verify:generated` confirms generated resources match `packages/shared/workflows/plan.md`.
