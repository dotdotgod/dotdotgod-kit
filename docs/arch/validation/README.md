# Validation Architecture

## Purpose

This domain defines the validation strategy for the dotdotgod workspace.

## Packages

`@dotdotgod/cli` owns docs scaffold validation, project memory snapshots, graph indexing, graph queries, and Leiden-style community detection.

CLI binary:

```bash
dotdotgod validate <root>
```

Local workspace command:

```bash
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

The previous standalone `@dotdotgod/docs-validator` package was replaced by the unified CLI package.

## Domain Map

- [`RULE_BOUNDARIES.md`](RULE_BOUNDARIES.md): validation ownership and size budget rules.
- [`CACHE_AND_INDEX.md`](CACHE_AND_INDEX.md): cache lifecycle, lazy refresh, graph shards, memory areas, communities, and impact reports.
- [`VERIFICATION.md`](VERIFICATION.md): dependency policy, package tests, and root verification gates.
