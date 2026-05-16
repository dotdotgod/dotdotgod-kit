# @dotdotgod/cli

Command-line tools for dotdotgod project memory. The CLI validates the docs scaffold, builds a local graph/cache, reports cache freshness, and returns bounded project-memory snapshots for agents.

## Why Use It?

- Replace ad-hoc docs checks with `dotdotgod validate`.
- Build `.dotdotgod/` as a local, ignored cache of file fingerprints and compact graph shards.
- Use `load-snapshot` as the bounded first-pass map for agent loading instead of embedding every doc or archive body.
- Query likely side effects with grouped, bounded graph impact reports.
- Turn dotdotgod's docs structure into retrieval priors: specs, architecture, tests, active plans, and archive maps become explicit memory-area hints instead of generic files.
- Keep product intent, design rationale, and verification standards discoverable as structured project memory for coding agents.
- Keep indexing generic: discovery follows gitignore-visible files and supported text/source/config formats rather than assuming a pnpm monorepo.

## Commands

```bash
dotdotgod --help
dotdotgod --version
dotdotgod validate .
dotdotgod validate . --check-index
dotdotgod config .
dotdotgod config init .
dotdotgod status .
dotdotgod index .
dotdotgod load-snapshot .
dotdotgod graph impact . --changed <path>
dotdotgod graph impact . --changed <path> --compact
dotdotgod graph communities .
```

`validate` replaces the previous standalone docs validator package. It checks docs structure, local Markdown links, CLI-enforced spec traceability blocks, and traceability target paths. With `--check-index`, it also compares current Markdown fingerprints with `.dotdotgod/manifest.json` and reports stale or missing graph index entries without refreshing the cache. `config` shows the resolved root-scoped project config without refreshing the graph cache, and `config init` writes `dotdotgod.config.json` from the built-in defaults when a project wants editable policy. Graph indexing currently extracts a deterministic first-pass graph from Markdown headings/links, README routing links, package metadata/resources, TypeScript/JavaScript imports, exports, top-level declarations, Pi command registrations, inferred tests, metric-event string literals, and dotdotgod memory-area membership. Other supported plain-text/source/config files are indexed as file metadata until dedicated extractors are added.

The cache uses `.dotdotgod/manifest.json` plus compact graph shards under `.dotdotgod/graph/` so larger long-running projects do not require one giant JSON file. `status` is read-only and reports whether the cache is missing, fresh, stale, or schema-incompatible. `load-snapshot` and `graph` commands lazily refresh a missing/stale cache before producing agent-facing output and include refresh reason, elapsed timing, changed-file count, schema version, cache size, and archive inclusion policy in JSON output when available.

Memory-aware graph metadata is deterministic and path-based: files under `docs/spec`, `docs/arch`, `docs/test`, `docs/plan`, and `docs/archive/README.md` get `memoryArea`, `memoryRole`, `retrievalPriority`, and `retrieval.signals` metadata. The graph also adds `memory_area:*` nodes, `belongs_to_area` edges, and `routes_to` edges from README indexes so curated docs maps become routing hints rather than plain links only.

`--help`, `-h`, and `help` print usage to stdout; `--version`, `-v`, and `version` print the package version. Command-specific help is available with `dotdotgod <command> --help`, including nested commands such as `dotdotgod graph impact --help` and `dotdotgod config init --help`.

`load-snapshot` returns bounded `memoryAreas` summaries alongside cache, graph, community, and archive-policy metadata. `graph impact` returns a bounded impact report grouped into files, docs, tests, commands, events, package resources, and symbols, with related nodes annotated by retrieval priority and reason-derived signals. Use `graph impact --compact` for a smaller agent-facing grouped summary; use raw `--json` for diagnostics. `graph impact` requires `--changed <path>` so impact ranking has a seed file. `graph communities` projects durable graph nodes into weighted edges and runs Leiden community detection through `leiden-ts` with a deterministic fallback to domain grouping for tiny or invalid graphs.

## Indexing Scope

`dotdotgod index` is gitignore-aware by default. It uses `git ls-files --cached --others --exclude-standard` when possible, then filters to supported text, source, script, config, web, and infrastructure files. In non-git contexts it falls back to a conservative directory walk.

Default exclusions include dependency, generated, cache, and secret-like paths such as `.git/`, `.dotdotgod/`, `node_modules/`, `dist/`, `build/`, `coverage/`, `.next/`, `target/`, `vendor/`, `.venv/`, and `.env`. Example env templates such as `.env.example` remain indexable. `docs/archive/README.md` is included as the archive map, while archive bodies are excluded by default.

## Compared with Graphify-Style Reports

The CLI is not designed to make agents read a giant graph report. The full graph stays in the local cache; agent-facing output is bounded and includes omitted counts.

Its practical advantage is that graph and retrieval start from project-declared structure: `docs/spec` means behavior truth, `docs/arch` means design rationale, `docs/test` means verification, `docs/plan` means current intent, and `docs/archive/README.md` means historical map. The CLI encodes that structure as memory-area metadata, `belongs_to_area` edges, README `routes_to` edges, and retrieval signals before any source file is read.

This avoids common failure modes where a memory layer costs more than direct file reads on small tasks, indexes dependency/generated directories, or expands dense documents through repeated extraction.
