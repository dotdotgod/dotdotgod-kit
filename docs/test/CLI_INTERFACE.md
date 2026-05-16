# CLI Interface Verification

## Scope

Verify baseline `dotdotgod` command discovery, version reporting, subcommand help, and invalid `graph impact` usage guidance.

## Automated Coverage

`packages/cli/test/e2e.test.mjs` covers:

- Bare `dotdotgod`, `--help`, `-h`, and `help` print usage to stdout with exit `0`.
- `--version`, `-v`, and `version` print the package version to stdout with exit `0`.
- `validate`, `index`, `status`, `load-snapshot`, `graph`, `graph impact`, `graph query`, and `graph communities` expose help without running command side effects.
- Unknown commands and invalid options print diagnostics to stderr and exit `2`.
- `graph impact` and deprecated `graph query` require `--changed <path>` and do not create `.dotdotgod/` when the argument is missing.
- JSON missing-argument output uses `ok: false` with `error.code: "MISSING_CHANGED"`.

## Smoke Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs --help
node packages/cli/bin/dotdotgod.mjs --version
node packages/cli/bin/dotdotgod.mjs validate --help
node packages/cli/bin/dotdotgod.mjs graph impact --help
node packages/cli/bin/dotdotgod.mjs graph impact . --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json
```
