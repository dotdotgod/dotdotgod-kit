# Config Command Tests

## Purpose

These checks cover `dotdotgod config` and `dotdotgod config init` behavior for project-level config discovery and initialization.

## Automated Coverage

`packages/cli/test/core.test.mjs` verifies that the generated default config template:

- is valid according to the shared config validator
- includes default memory areas, traceability policy, markdown validation policy, impact ranking policy, and fuzzy reference expansion low-signal add/remove policy
- can be written as `dotdotgod.config.json` and read back by the CLI config loader

`packages/cli/test/e2e.test.mjs` verifies:

- `dotdotgod config <root> --json` reports default config without creating `.dotdotgod/`
- `dotdotgod config init <root> --json` creates `dotdotgod.config.json`
- generated config contains the default archive-body exclusion, markdown validation budgets, balanced impact ranking preset, and fuzzy low-signal add/remove settings
- show output reports `dotdotgod.config.json` after initialization
- init refuses to overwrite an existing config without `--force`
- init with `--force` overwrites `dotdotgod.config.json`
- init refuses when `.dotdotgodrc.json` exists, even with `--force`
- invalid config show output reports validation errors and does not refresh the graph cache
- command-specific help works for `config` and `config init`

## Manual Smoke

```bash
node packages/cli/bin/dotdotgod.mjs config .
node packages/cli/bin/dotdotgod.mjs config . --json
node packages/cli/bin/dotdotgod.mjs config init /tmp/dotdotgod-fixture --json
node packages/cli/bin/dotdotgod.mjs validate /tmp/dotdotgod-fixture --json
```

Use a temporary fixture for `config init` so the repository root is not modified accidentally.
