# Validation Config

## Purpose

The dotdotgod CLI supports project-level configuration for markdown validation size budgets. Projects can keep the default 200-line and 10,000-character limits, raise or lower them, or exempt explicit paths from size checks when an index or generated reference is intentionally large.

This config controls only the size-budget checks. Exempted files still run naming, traceability, link, anchor, README, plan/archive shape, gitignore, and optional stale-index checks.

## Config File

Validation policy lives in the same optional root config file as memory, traceability, and impact ranking policy. Use `dotdotgod config <root>` to inspect the resolved policy or `dotdotgod config init <root>` to create an editable default config.

1. `dotdotgod.config.json`
2. `.dotdotgodrc.json`

## Config Shape

```json
{
  "validation": {
    "markdown": {
      "maxLines": 200,
      "maxChars": 10000,
      "exclude": []
    }
  }
}
```

Fields:

- `maxLines`: positive integer line budget for markdown files. Default: `200`.
- `maxChars`: positive integer character budget for markdown files. Default: `10000`.
- `exclude`: array of exact repository-relative paths, `/**` subtree patterns, or `**/suffix` patterns that skip only `FILE_TOO_LONG` and `FILE_TOO_LARGE` checks.

All path fields are arrays. Scalar path settings are invalid and should be repaired instead of silently coerced.

## Behavior

- If `validation` is absent, the CLI uses `maxLines: 200`, `maxChars: 10000`, and no size-check excludes.
- If `validation.markdown` is absent, markdown validation uses those same defaults.
- `dotdotgod validate --max-lines <n>` and `--max-chars <n>` override configured numeric budgets for that invocation.
- `validation.markdown.exclude` still applies when CLI numeric overrides are used.
- Invalid config is reported by `dotdotgod validate` and `dotdotgod config`. Runtime commands fall back to the default policy so read-only snapshot and graph commands remain usable.

## Example: Exempt an Archive Index

```json
{
  "validation": {
    "markdown": {
      "maxLines": 200,
      "maxChars": 10000,
      "exclude": ["docs/archive/README.md"]
    }
  }
}
```

This keeps the default markdown budgets for normal docs while allowing the archive history map to grow beyond the default size. The archive README still receives all non-size validation checks.

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
    "docs/test/VALIDATION_CONFIG.md"
  ],
  "relatedDocs": [
    "docs/spec/CONFIG_COMMAND.md",
    "docs/spec/CLI_INTERFACE.md",
    "docs/arch/VALIDATION_ARCHITECTURE.md",
    "docs/arch/DOCS_STRUCTURE.md"
  ],
  "verificationCommands": [
    "pnpm --filter @dotdotgod/cli test",
    "node packages/cli/bin/dotdotgod.mjs config . --json",
    "node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"
  ]
}
```
