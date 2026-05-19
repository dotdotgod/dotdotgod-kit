# CLI Interface Verification

## Scope

Verify baseline `dotdotgod` command discovery, version reporting, init/config command discovery, and invalid `graph impact` usage guidance.

## Automated Coverage

`packages/cli/test/e2e.test.mjs` covers:

- Bare `dotdotgod`, `--help`, `-h`, and `help` print usage to stdout with exit `0`.
- `--version`, `-v`, and `version` print the package version to stdout with exit `0`.
- `validate`, `init`, `index`, `config`, `config init`, `status`, `load-snapshot`, `resolve`, `expand`, `graph`, `graph impact`, and `graph communities` expose help without running command side effects, and `expand --help` lists `--fuzzy`.
- Unknown commands, removed graph subcommands such as `graph query`, and invalid options print diagnostics to stderr and exit `2`.
- `graph impact` requires `--changed <path>` and does not create `.dotdotgod/` when the argument is missing.
- JSON missing-argument output uses `ok: false` with `error.code: "MISSING_CHANGED"`, including when `--compact` is present.
- Compact graph impact output remains opt-in and smaller than raw JSON.

## Smoke Commands

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
node packages/cli/bin/dotdotgod.mjs graph impact . --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --yml
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --compact
```
