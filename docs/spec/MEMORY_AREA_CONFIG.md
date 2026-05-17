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

If neither file exists, the CLI uses its built-in defaults. The zero-config default must remain compatible with the existing docs scaffold. Use `dotdotgod config <root>` to inspect the resolved policy, or `dotdotgod config init <root>` to materialize the defaults as `dotdotgod.config.json` for a project.

## Memory Area Fields

A config may define `memory.areas` as an ordered array. Each area supports:

- `id`: kebab-case memory-area id.
- `label`: human-readable label.
- `paths`: non-empty array of exact paths or `/**` subtree patterns.
- `excludePaths`: optional array of exact paths or `/**` subtree patterns removed from this area.
- `scope`: `shared` or `local`.
- `freshness`: `fresh` or `stale`.
- `role`: retrieval role surfaced in graph and snapshot metadata.
- `priority`: integer from 0 to 100 used for bounded retrieval ordering.
- `includeBodiesByDefault`: boolean controlling whether matching files are included in the default index and load snapshot.

All path fields are arrays; scalar string path settings are invalid. The first matching configured area classifies a path after its `excludePaths` are applied.

## Default Memory Policy

Without config, the CLI behaves as if these areas were configured:

- `AGENTS.md`: shared fresh agent rules.
- `CLAUDE.md` and `CODEX.md`: shared fresh agent entrypoints.
- `README.md`: shared fresh project overview.
- `docs/README.md`: shared fresh docs index.
- `docs/spec/**`: shared fresh product specs.
- `docs/arch/**`: shared fresh architecture docs.
- `docs/test/**`: shared fresh verification knowledge.
- `docs/plan/**`: local fresh active-plan memory.
- `docs/archive/README.md`: local stale archive map included by default.
- `docs/archive/**`: local stale archive body excluded by default.

## Archive Map and Archive Body

`docs/archive/README.md` is the archive map. It is stale local memory, but it remains included by default because it tells agents what historical memory exists.

Archive bodies under `docs/archive/**` are stale local memory and remain excluded from default indexing/loading unless a future explicit policy includes them. Agents should use the archive map first and read archive bodies only through targeted lookup when the current task needs history.

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
- exact duplicate path patterns that are not excluded by the later area

Invalid memory config does not make the CLI crash. Runtime commands fall back to the default memory config while validation reports repairable errors.

## Load Snapshot Effects

`dotdotgod load-snapshot <root> --json` includes:

- `memoryConfig`: the resolved source, memory-area definitions, and traceability path policy.
- `memoryPolicy`: bounded lists of shared, local, fresh, and stale area ids.
- `memoryAreas`: bounded file summaries grouped by configured area.
- existing archive bounds showing whether archive bodies were included.

The load snapshot must not embed the full graph or stale archive bodies by default.

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
    "docs/test/README.md"
  ],
  "relatedDocs": [
    "docs/spec/CONFIG_COMMAND.md",
    "docs/arch/MEMORY_AREA_CONFIG.md",
    "docs/arch/DOCS_STRUCTURE.md",
    "docs/arch/VALIDATION_ARCHITECTURE.md"
  ],
  "verificationCommands": [
    "pnpm --filter @dotdotgod/cli test",
    "node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"
  ]
}
```
