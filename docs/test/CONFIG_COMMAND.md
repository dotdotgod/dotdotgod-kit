# Config Command Tests

## Purpose

These checks cover `dotdotgod config` and `dotdotgod config init` behavior for project-level config discovery and initialization.

## Automated Coverage

`packages/cli/test/core.test.mjs` verifies that the generated default config template:

- is valid according to the shared config validator
- includes default memory areas, the four ordered traceability-key definitions, markdown validation policy, retained semantic candidate policy, and fuzzy reference expansion low-signal add/remove policy
- can be written as `dotdotgod.config.json` and read back by the CLI config loader
- accepts valid optional memory-area `description` and `clarify` metadata while rejecting invalid metadata with repairable errors

`packages/cli/test/e2e.test.mjs` verifies:

- `dotdotgod init`, `dotdotgod config init`, and the POSIX fallback produce structurally identical config data
- project init reports config dry-run and existing-file skip behavior
- packaged Pi, Claude Code, and Codex adapters include the generated fallback config template
- `dotdotgod config <root> --json` reports default config without creating `.dotdotgod/`
- `dotdotgod config init <root> --json` creates `dotdotgod.config.json`
- generated config contains archive-body exclusion, markdown budgets, four editable traceability keys, retained semantic candidate settings, and fuzzy low-signal add/remove settings without ranking presets/PPR tuning or noisy memory-area metadata
- show output reports `dotdotgod.config.json` after initialization
- init refuses to overwrite an existing `dotdotgod.config.json`
- `.dotdotgodrc.json` is not recognized as a project config source
- `dotdotgod config <root> --json` preserves configured memory-area `description` and `clarify` metadata
- invalid config show output reports validation errors and does not refresh the graph cache
- arbitrary retired, unknown, malformed, or unsupported `impactRanking` values remain non-blocking; valid semantic candidate controls apply while invalid values fall back to defaults and retired fields remain omitted from show/init output
- legacy `load.pinnedPaths` and `load.pinnedBodies` values remain non-blocking, normalize to empty arrays, and do not alter Load output
- resolved impact diagnostics expose fixed caps and internal reference `0.4` without serializing them into initialized config
- command-specific help works for `config` and `config init`

## Manual Smoke

```bash
node packages/cli/bin/dotdotgod.mjs config .
node packages/cli/bin/dotdotgod.mjs config . --json
node packages/cli/bin/dotdotgod.mjs init /tmp/dotdotgod-fixture --json
node packages/cli/bin/dotdotgod.mjs validate /tmp/dotdotgod-fixture --json
```

Use a temporary fixture for `config init` so the repository root is not modified accidentally.
