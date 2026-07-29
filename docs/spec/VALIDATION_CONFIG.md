# Validation Config

## Purpose

The dotdotgod CLI supports project-level configuration for markdown validation size budgets. Projects can keep the default 200-line and 10,000-character limits, raise or lower them, or exempt explicit paths from size checks when an index or generated reference is intentionally large.

This config controls only the size-budget checks. Exempted files remain subject to naming, traceability, link, anchor, README, plan/archive shape, gitignore, and optional stale-index checks.

## Config File

Validation policy lives in the optional root `dotdotgod.config.json` file alongside memory, traceability, and impact ranking policy. Use `dotdotgod config <root>` to inspect the resolved policy or `dotdotgod config init <root>` to create an editable default config.

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

All path fields are arrays. Scalar path settings are invalid and validation should report them for repair.

## Behavior

- If `validation` is absent, the CLI uses `maxLines: 200`, `maxChars: 10000`, and no size-check excludes.
- If `validation.markdown` is absent, markdown validation uses those same defaults.
- `dotdotgod validate --max-lines <n>` and `--max-chars <n>` override configured numeric budgets for that invocation.
- `validation.markdown.exclude` applies when CLI numeric overrides are used.
- Invalid config is reported by `dotdotgod validate` and `dotdotgod config`. Runtime commands fall back to the default policy so read-only snapshot and graph commands remain usable.
- Generated traceability-link regions and canonical `json dotdotgod` blocks are excluded before line and character budgets are measured.
- `FILE_TOO_LONG` and `FILE_TOO_LARGE` errors include a repair prompt that names the matched memory area and role, and tells agents to split the oversized document into focused files by documentation area and role while updating the nearest README index.
- Markdown size budgets encourage focused specs and test docs, but size validation does not classify micro-specs or enforce semantic coverage.

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

This keeps the default markdown budgets for normal docs while allowing the archive history map to grow beyond the default size. The archive README receives all non-size validation checks.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/core.mjs](../../packages/cli/src/core.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/VALIDATION_CONFIG.md](../test/VALIDATION_CONFIG.md)
- Related docs:
  - [docs/spec/CONFIG_COMMAND.md](CONFIG_COMMAND.md)
  - [docs/spec/CLI_INTERFACE.md](CLI_INTERFACE.md)
  - [docs/arch/VALIDATION_ARCHITECTURE.md](../arch/VALIDATION_ARCHITECTURE.md)
  - [docs/arch/DOCS_STRUCTURE.md](../arch/DOCS_STRUCTURE.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs config . --json`
  - `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/VALIDATION_CONFIG.md"],"relatedDocs":["docs/spec/CONFIG_COMMAND.md","docs/spec/CLI_INTERFACE.md","docs/arch/VALIDATION_ARCHITECTURE.md","docs/arch/DOCS_STRUCTURE.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs config . --json","node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"]}
```
