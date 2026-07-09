# Memory Area Config

## Purpose

The dotdotgod CLI supports an optional project-level memory-area config so projects can classify curated memory paths without changing CLI source code.

The config makes four memory concepts explicit:

- **Shared memory:** durable project memory intended to be committed and used by every agent, such as product specs, architecture docs, and test strategy.
- **Local memory:** ignored project-local working memory that can help current agents without becoming shared repository history, such as active plans and archives.
- **Fresh memory:** current or active memory that should be surfaced early during project loading, such as active plans or current docs indexes.
- **Stale memory:** historical or completed memory that should remain available through maps, indexes, or targeted lookup.

## Config File

The CLI looks for one optional JSON config file at the project root:

1. `dotdotgod.config.json`
2. `.dotdotgodrc.json`

If neither file exists, the CLI uses its built-in defaults. The zero-config default must support the default docs scaffold. Use `dotdotgod config <root>` to inspect the resolved policy, or `dotdotgod config init <root>` to materialize the defaults as `dotdotgod.config.json` for a project. The project-level config also carries related CLI policies such as fuzzy reference-expansion low-signal `add`/`remove` terms.

## Memory Area Fields

A config may define `memory.areas` as an ordered array. Each area supports:

- `id`: kebab-case memory-area id.
- `label`: human-readable label.
- `paths`: non-empty array of exact paths or `/**` subtree patterns.
- `excludePaths`: optional array of exact paths or `/**` subtree patterns excluded from this area.
- `scope`: `shared` or `local`.
- `freshness`: `fresh` or `stale`.
- `role`: retrieval role surfaced in graph and snapshot metadata.
- `description`: optional non-empty string explaining the area's document purpose for agents and readers.
- `clarify`: optional documentation-clarity guidance used by `document-clarify` skills. Supported optional fields are `audience`, `documentType`, `clarityGoal`, and `editRules`.
- `priority`: integer from 0 to 100 used for bounded retrieval ordering.
- `includeBodiesByDefault`: boolean controlling whether matching files are included in the default index and load snapshot.

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

The optional `load.documentationSummary.exclude` array controls which docs directories are omitted from the Pi load prompt's `Documentation directory summary`.

Behavior contract:

- The zero-config default is `docs/plan` and `docs/archive`.
- The policy is independent from `memory.areas`; changing local-memory scope does not change summary exclusions, and changing exclusions does not change indexing or retrieval metadata.
- An explicit empty array includes all discovered summary directories, including plan and archive indexes.
- Values use the same repository-relative exact and supported subtree path patterns as other path policies.
- The policy filters only the book-like directory summary. Baseline-file detection, load-snapshot memory areas, pinned files, archive-body policy, and later targeted agent reads remain unchanged.
- `dotdotgod config init` materializes the default list so projects can manage it independently.

## Load Pinned Files

The optional top-level `load` policy family also pins always-visible files into load output:

- `load.pinnedPaths`: array of repository-relative paths or path patterns whose matches are always listed in load-snapshot output and Pi load prompts.
- `load.pinnedBodies`: array of repository-relative paths or path patterns whose matching file contents are also embedded in full load output.

Behavior contract:

- Both options are arrays; scalar strings are invalid.
- Files matched by `pinnedBodies` are also surfaced as pinned paths without duplicating them in `pinnedPaths`.
- Pinned files are read directly from disk, so pinned paths do not need to be present in the graph index.
- Matches and bodies are bounded: at most 20 pinned paths, 5 pinned bodies, and 10,000 characters per body, with omitted and truncated counts reported.
- Missing files are reported with a `missing` status instead of failing; binary files are skipped.
- Secret-like paths such as `.env`, credentials, secrets, and private keys are rejected by validation and skipped at runtime.
- Broad archive patterns stay subject to the same bounds and secret checks; pinning does not re-enable default archive-body indexing.
- `dotdotgod config init` writes empty `load.pinnedPaths` and `load.pinnedBodies` arrays for discoverability.

The motivating use case is keeping code conventions such as `docs/arch/CODE_CONVENTIONS.md` visible on every project-memory load.

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

## Load Snapshot Effects

`dotdotgod load-snapshot <root> --json` includes:

- `memoryConfig`: the resolved source, memory-area definitions, optional area `description`/`clarify` metadata, traceability path policy, and reference-expansion fuzzy low-signal policy.
- `memoryPolicy`: bounded lists of shared, local, fresh, and stale area ids.
- `memoryAreas`: bounded file summaries grouped by configured area, including area clarity metadata when configured.
- `memoryConfig.load.documentationSummary.exclude`: the independently resolved Pi documentation-summary exclusion policy.
- `pinnedFiles`: configured pinned paths with per-file statuses and bounded pinned bodies read directly from disk.
- archive bounds showing whether archive bodies were included.

The load snapshot must not embed the full graph or stale archive bodies by default.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/memory/config.mjs](../../packages/cli/src/memory/config.mjs)
  - [packages/cli/src/core.mjs](../../packages/cli/src/core.mjs)
  - [packages/cli/src/load-snapshot/summary.mjs](../../packages/cli/src/load-snapshot/summary.mjs)
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
{"kind":"spec","implementedBy":["packages/cli/src/memory/config.mjs","packages/cli/src/core.mjs","packages/cli/src/load-snapshot/summary.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/README.md","docs/test/MEMORY_AREA_CONFIG.md"],"relatedDocs":["docs/spec/CONFIG_COMMAND.md","docs/arch/MEMORY_AREA_CONFIG.md","docs/arch/DOCS_STRUCTURE.md","docs/arch/VALIDATION_ARCHITECTURE.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"]}
```
