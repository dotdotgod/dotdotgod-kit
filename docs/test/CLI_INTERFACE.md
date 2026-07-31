# CLI Interface Verification

## Scope

Verify baseline `dotdotgod` command discovery, version reporting, init/config command discovery, plan validation, and invalid `graph impact` guidance.

## Automated Coverage

`packages/cli/test/e2e.test.mjs` covers:

- Bare `dotdotgod`, `--help`, `-h`, and `help` print Help to stdout with exit `0`.
- Root Help starts with the AI-agent project-memory purpose, lists every supported command with a concise description, and routes to focused command Help without prescribing a workflow or making a global side-effect claim.
- `--version`, `-v`, and `version` print the package version to stdout with exit `0`.
- Unknown commands, removed graph subcommands such as `graph query`, and invalid options print diagnostics to stderr and exit `2`.
- `graph impact` requires `--changed <path>` and does not create `.dotdotgod/` when the argument is missing.
- JSON missing-argument output uses `ok: false` with `error.code: "MISSING_CHANGED"`, including when `--compact` is present.
- Compact graph impact output remains opt-in and smaller than raw JSON.

## Smoke Commands

Successful smoke commands:

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs --help
node packages/cli/bin/dotdotgod.mjs --version
node packages/cli/bin/dotdotgod.mjs validate --help
node packages/cli/bin/dotdotgod.mjs init --help
node packages/cli/bin/dotdotgod.mjs config --help
node packages/cli/bin/dotdotgod.mjs config init --help
node packages/cli/bin/dotdotgod.mjs resolve --help
node packages/cli/bin/dotdotgod.mjs expand --help
node packages/cli/bin/dotdotgod.mjs graph impact --help
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --yml
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --compact
```

Expected-failure smoke command:

```bash
node packages/cli/bin/dotdotgod.mjs graph impact . --json
```

This command intentionally omits `--changed <path>` and should exit `2` with `error.code: "MISSING_CHANGED"` in JSON mode.
