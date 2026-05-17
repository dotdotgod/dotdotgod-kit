# Validation Config Tests

## Purpose

These checks cover configurable markdown validation size budgets and path-specific size-check exclusions.

## Automated Coverage

`packages/cli/test/core.test.mjs` verifies:

- the generated default config template includes `validation.markdown.maxLines`, `maxChars`, and `exclude`
- valid validation config is loaded from `dotdotgod.config.json`
- invalid max-line, max-character, and exclude settings are reported by the shared config validator
- invalid validation config falls back to default policy at runtime

`packages/cli/test/e2e.test.mjs` verifies:

- an oversized markdown file fails default validation with `FILE_TOO_LARGE`
- `validation.markdown.exclude` skips only markdown size checks for a matching path
- configured `maxChars` and `maxLines` change validation budgets
- CLI `--max-chars` overrides a configured character budget for one invocation
- `dotdotgod config init` writes validation defaults
- invalid validation config is surfaced by `dotdotgod config` without refreshing `.dotdotgod/`

## Manual Smoke

```bash
node packages/cli/bin/dotdotgod.mjs config . --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --max-chars 12000
```

To exempt only the archive map from markdown size checks, add:

```json
{
  "validation": {
    "markdown": {
      "exclude": ["docs/archive/README.md"]
    }
  }
}
```

The exemption should not be used for general docs that can be split into focused files.
