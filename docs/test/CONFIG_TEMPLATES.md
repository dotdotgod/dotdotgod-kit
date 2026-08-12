# Config Template Tests

## Automated Coverage

`packages/cli/test/core.test.mjs` verifies that all built-in templates satisfy the project config schema and that `software` preserves canonical defaults.

`packages/cli/test/e2e.test.mjs` verifies:

- missing project config still reports the built-in zero-config runtime policy even when a global default exists
- global `defaultTemplate` controls initial config creation
- explicit `--template` controls `init` and `config init`
- all built-in resources are packaged for Pi, Claude Code, and Codex
- a same-name custom file completely replaces the built-in template
- invalid custom JSON fails closed without creating project config
- the POSIX fallback initializes an explicitly selected built-in template
- existing project config is preserved
- bundled templates materialize their explicit domain scaffold through both CLI and POSIX initialization
- research initialization creates `docs/research/README.md`, `docs/record/README.md`, `docs/report/README.md`, and `outputs/`
- dry-run action output includes template-specific files and directories

Tests use an isolated temporary home and never touch the developer's real `~/.dotdotgod`.

## Manual Smoke

```bash
HOME=/tmp/dotdotgod-home node packages/cli/bin/dotdotgod.mjs config init /tmp/research-project --template research --json
HOME=/tmp/dotdotgod-home node packages/cli/bin/dotdotgod.mjs init /tmp/policy-project --template policy --dry-run --json
sh packages/shared/initializer/scripts/init_project.sh /tmp/publication-project --template publication --dry-run
```

Confirm `dotdotgod config <root> --json` remains `source: "default"` when no project config exists, regardless of global template settings. For the research fixture, also confirm the three maintained domain indexes and `outputs/` exist after initialization; general validation is not intended to require all configured memory areas to exist.
