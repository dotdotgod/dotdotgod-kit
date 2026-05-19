# Config Command

## Purpose

The `dotdotgod config` command makes project-level config policy discoverable from the CLI.

It does not introduce global config, user config, or monorepo cascading config. The CLI resolves one optional config file from the project root:

1. `dotdotgod.config.json`
2. `.dotdotgodrc.json`

When neither file exists, commands use built-in defaults.

## Show Command

```bash
dotdotgod config <root> [--json]
```

The show command is read-only. It MUST NOT create or refresh `.dotdotgod/`, and it MUST NOT write a config file.

Human output summarizes:

- config source
- config path when a file is present
- memory-area count
- traceability required/exclude patterns
- markdown validation line and character budgets
- markdown validation size-check exclude patterns
- impact ranking preset
- fuzzy reference expansion low-signal policy
- config validation errors, when present

JSON output includes:

- `ok`
- `command: "config"`
- `root`
- `source`
- `path`
- `config`
- `errors`

If the project config is invalid, `ok` is `false`, errors use the same validation shape as `dotdotgod validate`, and the displayed `config` is the default fallback policy. The command exits non-zero for invalid config, but it must not crash.

## Policy Families

The config command surfaces the same policy families that validation, snapshots, reference expansion, and graph impact use:

- `memory.areas`: ordered path classifiers for shared/local and fresh/stale project memory.
- `traceability.required` and `traceability.exclude`: path rules that decide which markdown files must end with a valid `json dotdotgod` block.
- `validation.markdown`: line/character budgets and narrow size-check exclusions.
- `impactRanking`: presets, weights, PPR, relation boosts, routing hints, and compact impact behavior.
- `referenceExpansion.fuzzy.lowSignal`: `add`/`remove` term lists that tune low-signal fuzzy prompt matching without replacing built-in defaults.

## Init Command

```bash
dotdotgod config init <root> [--force] [--json]
```

The init command creates `dotdotgod.config.json` with the current built-in defaults for:

- `memory.areas`
- `traceability`
- `validation.markdown`
- `impactRanking`
- `referenceExpansion.fuzzy.lowSignal.add/remove`

The generated file must validate with `dotdotgod validate`. The generated reference-expansion section uses empty `add` and `remove` arrays; the resolved defaults remain visible in `dotdotgod config <root> --json` output.

Overwrite behavior:

- If `dotdotgod.config.json` already exists, init refuses to overwrite it unless `--force` is passed.
- If `.dotdotgodrc.json` exists, init refuses with a clear error so users can intentionally choose which config file to keep.
- `--force` may overwrite only `dotdotgod.config.json`.

JSON output for successful init includes:

- `ok: true`
- `command: "config init"`
- `root`
- `path`
- `created`
- `overwritten`

JSON output for init errors includes `ok: false`, `command: "config init"`, `root`, `path` when known, `created: false`, `overwritten: false`, and `error.code`.

## Non-Goals

- Do not require a config file for zero-config projects.
- Do not change runtime fallback behavior for invalid config.
- Do not add interactive prompts.
- Do not infer package-level configs in workspaces.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": [
    "packages/cli/src/core.mjs"
  ],
  "verifiedBy": [
    "packages/cli/test/core.test.mjs",
    "packages/cli/test/e2e.test.mjs",
    "docs/test/CONFIG_COMMAND.md"
  ],
  "relatedDocs": [
    "docs/spec/MEMORY_AREA_CONFIG.md",
    "docs/spec/TRACEABILITY_CONFIG.md",
    "docs/spec/VALIDATION_CONFIG.md",
    "docs/spec/IMPACT_RANKING_CONFIG.md",
    "docs/spec/CLI_INTERFACE.md",
    "docs/arch/MEMORY_AREA_CONFIG.md"
  ],
  "verificationCommands": [
    "pnpm --filter @dotdotgod/cli test",
    "node packages/cli/bin/dotdotgod.mjs config . --json",
    "node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"
  ]
}
```
