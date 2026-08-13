# CLI Traceability Links

## Purpose

`dotdotgod traceability links` keeps generated Markdown traceability-link sections synchronized with the canonical fenced `json dotdotgod` blocks in docs.

## Requirements

- `dotdotgod traceability links <root> [--check|--write] [--json]` MUST expose help without reading caches or refreshing graph indexes.
- Check mode MUST report missing or stale generated traceability-link sections.
- Write mode MUST update only sentinel-bounded generated regions or insert missing regions before canonical traceability blocks.
- Write mode MUST preserve canonical compact JSON and normalize drift only inside traceability regions.
- `--json` output MUST include enough structured status for scripts to distinguish clean checks, changed files, marker failures, and validation errors.
- The generated Markdown section is derived output. The fenced `json dotdotgod` block remains the source of truth.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/core.mjs](../../../packages/cli/src/core.mjs)
  - [packages/cli/src/commands/traceability.mjs](../../../packages/cli/src/commands/traceability.mjs)
  - [packages/cli/src/docs/traceability.mjs](../../../packages/cli/src/docs/traceability.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../../packages/cli/test/e2e.test.mjs)
  - [docs/test/CLI_INTERFACE.md](../../test/CLI_INTERFACE.md)
  - [docs/test/TRACEABILITY_CONFIG.md](../../test/TRACEABILITY_CONFIG.md)
- Related docs:
  - [docs/spec/TRACEABILITY_CONFIG.md](../TRACEABILITY_CONFIG.md)
  - [docs/spec/IMPACT_RANKING_CONFIG.md](../IMPACT_RANKING_CONFIG.md)
  - [docs/test/README.md](../../test/README.md)
  - [packages/cli/README.md](../../../packages/cli/README.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs","packages/cli/src/commands/traceability.mjs","packages/cli/src/docs/traceability.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/CLI_INTERFACE.md","docs/test/TRACEABILITY_CONFIG.md"],"relatedDocs":["docs/spec/TRACEABILITY_CONFIG.md","docs/spec/IMPACT_RANKING_CONFIG.md","docs/test/README.md","packages/cli/README.md"],"designDecisions":[]}
```
