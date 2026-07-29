# Memory Area Config

## Purpose

The dotdotgod CLI supports an optional project-level memory-area config so projects can classify curated memory paths without changing CLI source code.

The config makes four memory concepts explicit:

- **Shared memory:** durable project memory intended to be committed and used by every agent, such as product specs, architecture docs, and test strategy.
- **Local memory:** ignored project-local working memory that can help current agents without becoming shared repository history, such as active plans and archives.
- **Fresh memory:** current or active memory that should be surfaced early during project loading, such as active plans or current docs indexes.
- **Stale memory:** historical or completed memory that should remain available through maps, indexes, or targeted lookup.

## Config File

The CLI looks for the optional `dotdotgod.config.json` file at the project root.

If the file does not exist, the CLI uses its built-in defaults. The zero-config default must support the default docs scaffold. Use `dotdotgod config <root>` to inspect the resolved policy, or `dotdotgod config init <root>` to materialize the defaults as `dotdotgod.config.json` for a project. The project-level config also carries related CLI policies such as fuzzy reference-expansion low-signal `add`/`remove` terms.

## Memory Area Fields

A config may define `memory.areas` as an ordered array. Each area supports:

- `id`: kebab-case memory-area id.
- `label`: human-readable label.
- `paths`: non-empty array of exact paths or `/**` subtree patterns.
- `excludePaths`: optional array of exact paths or `/**` subtree patterns excluded from this area.
- `scope`: `shared` or `local`.
- `freshness`: `fresh` or `stale`.
- `role`: retrieval role surfaced in graph metadata and config summaries.
- `description`: optional non-empty string explaining the area's document purpose for agents and readers.
- `clarify`: optional documentation-clarity guidance used by `document-clarify` skills. Supported optional fields are `audience`, `documentType`, `clarityGoal`, and `editRules`.
- `priority`: integer from 0 to 100 used for bounded retrieval ordering.
- `includeBodiesByDefault`: boolean controlling whether matching files are included in the default graph index. It does not control the Load documentation map or vector-query corpus.

All path fields are arrays; scalar string path settings are invalid. The first matching configured area classifies a path after its `excludePaths` are applied. `description` and `clarify` are optional project metadata; they do not change path matching, traceability enforcement, or index inclusion.

## Default Memory Policy

Without config, the CLI behaves as if these areas were configured:

- `AGENTS.md`: shared fresh agent rules.
- `CLAUDE.md` and `CODEX.md`: shared fresh agent entrypoints.
- `README.md`: shared fresh project overview.
- `docs/README.md`: shared fresh docs index.
- `docs/spec/**`: shared fresh product specs. This memory classification is separate from the default traceability enforcement path, which also targets `docs/spec/**` unless `traceability` config changes it.
- `docs/arch/**`: shared fresh architecture docs.
- `docs/test/**`: shared fresh verification knowledge.
- `docs/plan/**`: local fresh active-plan memory.
- `docs/archive/README.md`: local stale archive map included by default.
- `docs/archive/**`: local stale archive body excluded by default.
- all remaining `docs/**`: shared fresh project documentation through a final low-priority catch-all area.

The built-in default areas intentionally omit `description` and `clarify` metadata so `dotdotgod config init` stays concise. The `document-clarify` workflow carries the default dotdotgod document-role fallback for zero-config projects.

Configured local areas with body inclusion enabled are also direct-disk discovery roots, so ignored local files are not limited to the built-in plan directory. Exact paths and `/**` subtrees are expanded under the normal secret, generated-file, supported-file, and bounded traversal checks; broad `**/suffix` patterns are classification-only.

## Archive Map and Archive Body

`docs/archive/README.md` is the archive map. It is stale local memory, but it remains included by default because it tells agents what historical memory exists.

Archive bodies under `docs/archive/**` are stale local memory and are excluded from default indexing/loading unless explicit project policy includes them. Agents should use the archive map first and read archive bodies only through targeted lookup when the current task needs history.

## Load Documentation Summary

The optional `load.documentationSummary.exclude` array controls which docs paths are omitted from the Pi Load `Documentation map`.

Behavior contract:

- The zero-config default is `docs/plan` and `docs/archive`.
- The policy is independent from `memory.areas`; changing local-memory scope does not change map/query exclusions, and changing exclusions does not change graph indexing or retrieval metadata.
- An explicit empty array includes all discovered summary directories, including plan and archive indexes.
- Values use the same repository-relative exact and supported subtree path patterns as other path policies.
- The policy filters the documentation tree and vector-query corpus. Baseline-file detection, graph memory areas, archive-body policy, and later targeted reads remain unchanged.
- `dotdotgod config init` materializes the default list so projects can manage it independently.

## Legacy Load Pinned Fields

`load.pinnedPaths` and `load.pinnedBodies` remain accepted, validated, and serialized for config compatibility, but they no longer alter Load output. Secret-like values remain invalid. New projects should rely on the complete documentation tree and focused local query instead of pinned bodies.

## Validation Behavior

`dotdotgod validate` reports memory config errors for:

- invalid JSON
- non-object config
- non-array `memory.areas`
- duplicate or non-kebab-case area ids
- empty or invalid `paths`
- invalid `excludePaths`
- unknown `scope` or `freshness`
- non-integer or out-of-range `priority`
- non-boolean `includeBodiesByDefault`
- invalid `description` values when present; they must be non-empty strings
- invalid `clarify` values when present; `clarify` must be an object, `documentType` and `clarityGoal` must be non-empty strings, and `audience` and `editRules` must be arrays of non-empty strings
- exact duplicate path patterns that are not excluded by the subsequent area
- malformed `referenceExpansion.fuzzy.lowSignal.add` or `remove` arrays
- non-object `load`; invalid `load.documentationSummary` objects; non-array or invalid `load.documentationSummary.exclude` patterns; non-array or invalid `load.pinnedPaths`/`load.pinnedBodies` patterns; absolute or traversal paths; and secret-like pinned paths
- invalid `planMode.writablePaths`; entries must be safe repository-relative exact or `/**` documentation paths under `docs/`

Invalid memory config does not make the CLI crash. Runtime commands fall back to the default memory config while validation reports repairable errors.

## Load and Query Effects

Pi Load applies `load.documentationSummary.exclude` before rendering the Markdown tree. `dotdotgod query` applies the same exclusions before chunking and embedding shared documentation. `memory.areas[].includeBodiesByDefault` independently controls graph indexing. Default policies align by excluding plan/archive bodies, but changing one policy does not change the other. Memory-area metadata remains available through `dotdotgod config` and graph commands rather than being injected into Load narrative.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/memory/config.mjs](../../packages/cli/src/memory/config.mjs)
  - [packages/cli/src/core.mjs](../../packages/cli/src/core.mjs)
  - [packages/cli/src/commands/query.mjs](../../packages/cli/src/commands/query.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/README.md](../test/README.md)
  - [docs/test/MEMORY_AREA_CONFIG.md](../test/MEMORY_AREA_CONFIG.md)
- Related docs:
  - [docs/spec/CONFIG_COMMAND.md](CONFIG_COMMAND.md)
  - [docs/arch/MEMORY_AREA_CONFIG.md](../arch/MEMORY_AREA_CONFIG.md)
  - [docs/arch/DOCS_STRUCTURE.md](../arch/DOCS_STRUCTURE.md)
  - [docs/arch/VALIDATION_ARCHITECTURE.md](../arch/VALIDATION_ARCHITECTURE.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/memory/config.mjs","packages/cli/src/core.mjs","packages/cli/src/commands/query.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/README.md","docs/test/MEMORY_AREA_CONFIG.md"],"relatedDocs":["docs/spec/CONFIG_COMMAND.md","docs/arch/MEMORY_AREA_CONFIG.md","docs/arch/DOCS_STRUCTURE.md","docs/arch/VALIDATION_ARCHITECTURE.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"]}
```
