# @dotdotgod/cli

> **Change a file, know what else must be checked.**

Command-line tools for dotdotgod project memory. The CLI validates the docs scaffold, builds a local graph/cache, reports cache freshness, returns bounded project-memory snapshots, and uses `graph impact` to surface the docs, tests, commands, and nearby files related to a changed file.

## Why Use It?

- Initialize the shared agent docs and documentation scaffold with `dotdotgod init`.
- Replace ad-hoc docs checks with `dotdotgod validate`.
- Build `.dotdotgod/` as a local, ignored cache of file fingerprints and compact graph shards.
- Use `load-snapshot` as the bounded first-pass map for agent loading.
- Query the safe review scope for a changed file with grouped, bounded graph impact reports.
- Turn dotdotgod's docs structure into retrieval priors: specs, architecture, tests, active plans, and archive maps become explicit memory-area hints.
- Keep product intent, design rationale, and verification standards discoverable as structured project memory for coding agents.
- Keep indexing generic: discovery follows gitignore-visible files and supported text/source/config formats across repository shapes.

## Commands

```bash
dotdotgod --help
dotdotgod --version
dotdotgod validate .
dotdotgod validate . --check-index
dotdotgod init .
dotdotgod config .
dotdotgod config init .
dotdotgod status .
dotdotgod index .
dotdotgod load-snapshot .
dotdotgod resolve . PLAN_MODE
dotdotgod expand . "Update [[PLAN_MODE]] and [[HOOKS]]"
dotdotgod graph impact . --changed <path>
dotdotgod graph impact . --changed <path> --compact
dotdotgod graph communities .
```

`init` creates the shared agent docs, docs indexes, local plan/archive areas, and `.gitignore` entries for local memory and `.dotdotgod/` cache files. `validate` replaces the previous standalone docs validator package. It checks docs structure, local Markdown links, CLI-enforced spec traceability blocks, and traceability target paths. With `--check-index`, it also compares current Markdown fingerprints with `.dotdotgod/manifest.json` and reports stale or missing graph index entries without refreshing the cache. `config` shows the resolved root-scoped project config without refreshing the graph cache, and `config init` writes `dotdotgod.config.json` from the built-in defaults when a project wants editable policy. Graph indexing currently extracts a deterministic routing graph from Markdown headings/links, README routing links, package metadata/resources, and dotdotgod memory-area membership. Other supported plain-text/source/config files are indexed as file metadata until docs/package routing rules need them.

The cache uses `.dotdotgod/manifest.json` plus compact graph shards under `.dotdotgod/graph/` so larger long-running projects do not require one giant JSON file. `status` is read-only and reports whether the cache is missing, fresh, stale, or schema-incompatible. `load-snapshot` and `graph` commands lazily refresh a missing/stale cache before producing agent-facing output and include refresh reason, elapsed timing, changed-file count, schema version, cache size, and archive inclusion policy in JSON output when available.

Memory-aware graph metadata is deterministic and path-based: files under `docs/spec`, `docs/arch`, `docs/test`, `docs/plan`, and `docs/archive/README.md` get `memoryArea`, `memoryRole`, `retrievalPriority`, and `retrieval.signals` metadata. The graph also adds `memory_area:*` nodes, `belongs_to_area` edges, and `routes_to` edges from README indexes so curated docs maps become routing hints.

`--help`, `-h`, and `help` print usage to stdout; `--version`, `-v`, and `version` print the package version. Command-specific help is available with `dotdotgod <command> --help`, including `dotdotgod init --help`, `dotdotgod resolve --help`, `dotdotgod expand --help`, and nested commands such as `dotdotgod graph impact --help` and `dotdotgod config init --help`.

`load-snapshot` returns bounded `memoryAreas` summaries alongside cache, graph, community, and archive-policy metadata. `resolve` resolves a single project-memory reference from the existing graph index, so names such as `PLAN_MODE` or `docs/spec/PLAN_MODE.md` can map to ranked docs, heading, and file candidates without a new full-repository grep pass. `expand` scans prompt text for `[[refs]]`, resolves each target, and can include compact impact context with `--with-impact`. Both commands lazily refresh missing or stale cache data like other graph-backed read commands and exclude archive bodies by default unless `--include-archive` is passed. `graph impact` returns a bounded impact report grouped into files, docs, tests, package resources, memory areas, and deterministic routing hints, with related nodes annotated by retrieval priority and reason-derived signals. Use `graph impact --compact` for a smaller agent-facing grouped summary; use raw `--json` for diagnostics. `graph impact` requires `--changed <path>` so impact ranking has a seed file. `graph communities` projects durable graph nodes into weighted edges and runs Leiden community detection through `leiden-ts` with a deterministic fallback to domain grouping for tiny or invalid graphs.

## Indexing Scope

`dotdotgod index` is gitignore-aware by default. It uses `git ls-files --cached --others --exclude-standard` when possible, then filters to supported text, source, script, config, web, and infrastructure files. In non-git contexts it falls back to a conservative directory walk.

Default exclusions include dependency, generated, cache, and secret-like paths such as `.git/`, `.dotdotgod/`, `node_modules/`, `dist/`, `build/`, `coverage/`, `.next/`, `target/`, `vendor/`, `.venv/`, and `.env`. Example env templates such as `.env.example` remain indexable. `docs/archive/README.md` is included as the archive map, while archive bodies are excluded by default.

## Compared with Graphify-Style Reports

The CLI is not designed to make agents read a giant graph report. The full graph stays in the local cache; agent-facing output is bounded and includes omitted counts.

Its practical advantage is that graph and retrieval start from project-declared structure: `docs/spec` means behavior truth, `docs/arch` means design rationale, `docs/test` means verification, `docs/plan` means current intent, and `docs/archive/README.md` means historical map. The CLI encodes that structure as memory-area metadata, `belongs_to_area` edges, README `routes_to` edges, and retrieval signals before any source file is read.

This avoids common failure modes where a memory layer costs more than direct file reads on small tasks, indexes dependency/generated directories, or expands dense documents through repeated extraction.
