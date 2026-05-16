# Traceability Config

## Purpose

The dotdotgod CLI supports configurable traceability enforcement paths so projects can decide which behavior documents must include final fenced `json dotdotgod` traceability blocks.

The default remains unchanged: projects without config require traceability for markdown files under `docs/spec/**` except README files.

## Config File

Traceability policy lives in the same optional root config file used by memory-area policy. Use `dotdotgod config <root>` to inspect the resolved policy or `dotdotgod config init <root>` to create an editable default config.

1. `dotdotgod.config.json`
2. `.dotdotgodrc.json`

## Config Shape

```json
{
  "traceability": {
    "required": ["docs/spec/**"],
    "exclude": ["**/README.md"]
  }
}
```

Fields:

- `required`: array of exact repository-relative paths, `/**` subtree patterns, or `**/suffix` patterns that require traceability.
- `exclude`: optional array of exact repository-relative paths, `/**` subtree patterns, or `**/suffix` patterns removed from enforcement.

All path fields are arrays. Scalar string path settings are invalid and should be repaired instead of silently coerced.

## Behavior

- If `traceability` is absent, the CLI uses the default policy: `required: ["docs/spec/**"]`, `exclude: ["**/README.md"]`.
- If `traceability.required` is an empty array, no files require traceability. This is allowed only through explicit config.
- Custom `required` replaces the default list instead of merging with it.
- Traceability block parsing and graph extraction still work in any markdown file that contains a valid block; the config only controls which files fail validation when the block is missing or invalid.
- Invalid config is reported by `dotdotgod validate`. Runtime commands fall back to the default policy so read-only snapshot and graph commands remain usable.

## Example: Move Enforcement Outside Specs

```json
{
  "traceability": {
    "required": ["docs/product/**", "docs/requirements/**"],
    "exclude": ["**/README.md"]
  }
}
```

With this config, `docs/product/FEATURE.md` and `docs/requirements/REQ.md` require traceability, while `docs/spec/FEATURE.md` no longer fails solely because it lacks a traceability block.

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
    "docs/test/TRACEABILITY_CONFIG.md"
  ],
  "relatedDocs": [
    "docs/arch/VALIDATION_ARCHITECTURE.md",
    "docs/arch/MEMORY_AREA_CONFIG.md",
    "docs/spec/MEMORY_AREA_CONFIG.md",
    "docs/spec/CONFIG_COMMAND.md"
  ],
  "verificationCommands": [
    "pnpm --filter @dotdotgod/cli test",
    "node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"
  ]
}
```
