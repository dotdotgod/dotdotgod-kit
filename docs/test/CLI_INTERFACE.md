# CLI Interface Verification

## Scope

Verify baseline `dotdotgod` command discovery, version reporting, init/config command discovery, plan validation, and invalid `graph impact` guidance.

## Automated Coverage

`packages/cli/test/e2e.test.mjs` covers:

- Bare `dotdotgod`, `--help`, `-h`, and `help` print usage to stdout with exit `0`.
- `--version`, `-v`, and `version` print the package version to stdout with exit `0`.
- `validate`, `init`, `index`, `config`, `config init`, `status`, `load-snapshot`, `resolve`, `expand`, `plan`, `plan validate`, `plan stage`, `plan stage create`, `graph`, `graph impact`, and `graph communities` expose help without running command side effects, and `expand --help` lists `--fuzzy`.
- Unknown commands, removed graph subcommands such as `graph query`, and invalid options print diagnostics to stderr and exit `2`.
- `graph impact` requires `--changed <path>` and does not create `.dotdotgod/` when the argument is missing.
- JSON missing-argument output uses `ok: false` with `error.code: "MISSING_CHANGED"`, including when `--compact` is present.
- Compact graph impact output remains opt-in and smaller than raw JSON.
- `plan validate` accepts simplified Plan Generator artifacts for `01-intake`, `02-context-load`, `03-discovery`, `04-plan`, and optional final `05-workstream-handoff` using durable README sections plus optional `.dotdotgod-plan/NN_STAGE_NAME.md` internal state files.
- `plan validate --stage <stage>` accepts stage names and numeric prefixes such as `04` or `05`, validates only that stage, tolerates later missing stages for incremental authoring, keeps the normal JSON shape, identifies the selected stage, filters blockers outside that stage, and may include optional `nextStage` guidance after a clean pass.
- General docs validation accepts `.dotdotgod-plan/NN_STAGE_NAME.md` internal stage filenames without requiring public UPPER_SNAKE_CASE names or a workspace README.
- `plan stage create <stage>` creates `.dotdotgod-plan/NN_STAGE_NAME.md` from a numeric prefix such as `02`, supports JSON output, and rejects duplicate checkpoint creation without overwriting.

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
node packages/cli/bin/dotdotgod.mjs plan validate --help
node packages/cli/bin/dotdotgod.mjs plan stage create --help
node packages/cli/bin/dotdotgod.mjs plan stage create 02 docs/plan/<task-slug>/README.md --json
node packages/cli/bin/dotdotgod.mjs plan validate docs/plan/<task-slug>/README.md --stage 04 --json
node packages/cli/bin/dotdotgod.mjs plan validate docs/plan/<task-slug>/README.md --stage 05 --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --yml
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --compact
```

Expected-failure smoke command:

```bash
node packages/cli/bin/dotdotgod.mjs graph impact . --json
```

This command intentionally omits `--changed <path>` and should exit `2` with `error.code: "MISSING_CHANGED"` in JSON mode.
