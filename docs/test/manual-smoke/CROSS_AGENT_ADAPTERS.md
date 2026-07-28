# Cross-Agent Adapter Smoke Tests

## Pi Adapter Dependency Resources

`@dotdotgod/pi` should install `@dotdotgod/cli` and `pi-subagents` as runtime dependencies. In a packaged-install smoke, confirm Pi can load `/dd:load`, `/impact-check`, and `subagent` without separate global installs of those packages. If `pi-subagents` is installed both standalone and through `@dotdotgod/pi`, confirm the dotdotgod wrapper waits until session startup and skips duplicate `subagent` tool, skill, and prompt resources instead of failing startup or logging resource conflicts.

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
/dd:impact
```

For `/dd:init`, generated guidance should preserve existing files, use the CLI or bundled fallback, and create the same complete default project config. Confirm the packaged initializer contains both `scripts/init_project.sh` and `templates/dotdotgod.config.json`.

For `/dd:load`, generated guidance should prefer `dotdotgod load-snapshot <root> --json`, treat the snapshot as the first-pass project-memory map, keep `docs/archive/README.md` as the archive map, and fall back to README-index reads when the CLI is unavailable.

For `/dd:impact`, generated guidance should identify changed source/config/docs files, run one repeated-`--changed` multi-seed `dotdotgod graph impact` command for up to 20 unique paths (and ordered batches only above that bound), inspect the combined ranking and per-seed results selectively, and choose focused verification before handoff.

## Codex Adapter

Install or add `/path/to/dotdotgod/packages/codex` with the current local plugin workflow.

Confirm `project-load`, `doc-first-planning`, `project-initializer`, and `impact-review` skills are discoverable. Trigger phrases `dd:load`, `dd:plan`, `dd:init`, and `dd:impact` should activate the expected workflows. For `dd:init`, verify the same config template and preservation behavior as Claude Code. For `dd:load`, use the same snapshot/archive/fallback expectations as Claude Code. For `dd:impact`, use the same bounded multi-seed changed-file graph-impact and focused-verification expectations as Claude Code.

## Cross-Agent Planning Parity

- Claude Code `/dd:plan` and `doc-first-planning` guidance mention the written plan file as the durable review artifact and do not reference saved-plan preview UI.
- Claude Code `/dd:impact` and Codex `impact-review` provide the cross-agent counterpart to Pi's `/impact-check` reminders without claiming Pi's runtime pending-impact state.
- Codex `doc-first-planning` guidance has the same planning workflow, archive housekeeping, and package-manager-aware verification guidance.
- `pnpm run verify:generated` confirms generated resources match `packages/shared/workflows/plan.md` and `packages/shared/workflows/impact.md`.
