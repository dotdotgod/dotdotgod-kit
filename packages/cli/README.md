# @dotdotgod/cli

[![npm version](https://img.shields.io/npm/v/@dotdotgod/cli.svg)](https://www.npmjs.com/package/@dotdotgod/cli) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod-kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/cli) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](../../LICENSE)

> **Change a file, know what else must be checked.**

```bash
$ dotdotgod graph impact . --changed packages/cli/src/core.mjs --compact
```

```text
docs:
- docs/spec/REFERENCE_EXPANSION.md (91; incoming:implemented_by, semantic_similarity)
- docs/test/REFERENCE_EXPANSION.md (65.3; verified_by, semantic_similarity)
- docs/spec/LOAD_PROJECT.md (35.8; related_doc, semantic_similarity)

tests:
- packages/cli/test/core.test.mjs (78.6; semantic_similarity, incoming:semantic_similarity, verified_by)
- packages/cli/test/e2e.test.mjs (51.4; verified_by)

files:
- packages/cli/src/core.mjs (100; changed-file)
- packages/pi/extensions/plan-mode/index.ts (45; implemented_by, semantic_similarity)
```

`graph impact` ranks the specs, tests, architecture notes, config docs, and source files most likely to matter for a change. `--compact` keeps the result agent-facing: grouped by docs/tests/files and annotated with the reasons each item is likely relevant. It uses the project-memory graph built from Markdown links, README routes, headings, traceability blocks, package metadata, memory areas, and deterministic routing hints.

Command-line tools for dotdotgod project memory. The CLI turns explicit, maintained project links into a local graph/cache: README routes, Markdown links, traceability blocks, memory areas, package metadata, commands, tests, and deterministic routing hints. That maintained graph powers `graph impact`, while the initialized docs surface keeps agent load context high signal.

## Why Use It?

- Initialize `AGENTS.md`, thin agent entrypoints, docs indexes, active-plan space, archive map, and local cache ignores with `dotdotgod init`.
- Replace ad-hoc docs checks with `dotdotgod validate`.
- Build `.dotdotgod/` as a local ignored cache of file fingerprints and compact graph shards derived from maintained project links.
- Use `load-snapshot` as a bounded first-pass map for high-quality agent loading.
- Resolve explicit `[[...]]` references or high-signal fuzzy references before broad text search.
- Query safe review scope for a changed file with grouped, bounded impact reports.
- Inspect or initialize project config with `dotdotgod config` and `dotdotgod config init`.

## Commands

```bash
dotdotgod --help
dotdotgod --version
dotdotgod init .
dotdotgod validate .
dotdotgod validate . --check-index
dotdotgod config .
dotdotgod config init .
dotdotgod status .
dotdotgod index .
dotdotgod load-snapshot .
dotdotgod resolve . PLAN_MODE
dotdotgod expand . "Update [[PLAN_MODE]] and [[HOOKS]]"
dotdotgod expand . "PLAN_MODE 수정하자" --fuzzy
dotdotgod graph impact . --changed <path>
dotdotgod graph impact . --changed <path> --compact
dotdotgod graph communities .
```

`--help`, `-h`, and `help` print usage to stdout. Command-specific help is available with `dotdotgod <command> --help`, including nested commands such as `dotdotgod graph impact --help` and `dotdotgod config init --help`.

## Graph, Cache, and Impact

The cache uses `.dotdotgod/manifest.json` plus graph shards under `.dotdotgod/graph/`. `status` is read-only. `load-snapshot`, `resolve`, `expand`, and `graph` commands lazily refresh missing or stale cache data before returning agent-facing output.

`graph impact` requires `--changed <path>` so ranking has a seed file. Raw JSON is useful for diagnostics; `--compact` returns a smaller grouped summary for agents. Related nodes include scores, reasons, and retrieval metadata, and output stays bounded with omitted counts.

`graph communities` runs Leiden community detection through `leiden-ts` with a deterministic fallback for tiny or invalid graphs.

## Reference Expansion

`resolve` maps one project-memory reference such as `PLAN_MODE` or `docs/spec/PLAN_MODE.md` to ranked graph candidates. `expand` scans prompt text for `[[refs]]`, resolves each target, and can include compact impact context with `--with-impact`.

Use `expand --fuzzy` for high-signal natural prompt references such as uppercase identifiers, path-like mentions, quoted phrases, and strong indexed aliases. Fuzzy low-signal terms use built-in defaults and can be adjusted in `dotdotgod.config.json` with `referenceExpansion.fuzzy.lowSignal.add` and `remove`. Archive bodies are excluded by default unless `--include-archive` is passed.

## Memory, Specs, and Config

The default docs scaffold gives files explicit project-memory meaning:

- `docs/spec/**`: stable shared/fresh product truth and, by default, the traceability-enforced behavior-spec path.
- `docs/arch/**`: stable shared/fresh architecture rationale.
- `docs/test/**`: stable shared/fresh verification knowledge.
- `docs/plan/**`: local fresh active-task intent.
- `docs/archive/README.md`: local stale archive map included by default.
- `docs/archive/**`: local stale archive bodies excluded by default.

Those roles are configurable but separate. Use `memory.areas` to customize memory classification and retrieval priority. Use `traceability.required` / `traceability.exclude` to customize which markdown paths must end with `json dotdotgod` traceability blocks. Use `validation.markdown`, `impactRanking`, and `referenceExpansion` to tune size budgets, impact scoring, and fuzzy prompt matching.

See the [root README](../../README.md), [GitHub repository](https://github.com/dotdotgod/dotdotgod-kit), [`docs/concept/CONTEXT_CURATION.md`](../../docs/concept/CONTEXT_CURATION.md), [`docs/concept/CONTEXT_MECHANICS.md`](../../docs/concept/CONTEXT_MECHANICS.md), [`docs/spec/MEMORY_AREA_CONFIG.md`](../../docs/spec/MEMORY_AREA_CONFIG.md), and [`docs/spec/TRACEABILITY_CONFIG.md`](../../docs/spec/TRACEABILITY_CONFIG.md) for the deeper model.

## Indexing Scope

`dotdotgod index` is gitignore-aware by default. It uses `git ls-files --cached --others --exclude-standard` when possible, then filters to supported text, source, script, config, web, and infrastructure files. In non-git contexts it falls back to a conservative directory walk.

Default exclusions include dependency, generated, cache, and secret-like paths such as `.git/`, `.dotdotgod/`, `node_modules/`, `dist/`, `build/`, `coverage/`, `.next/`, `target/`, `vendor/`, `.venv/`, and `.env`. Example env templates such as `.env.example` remain indexable.

## Compared with Graphify-Style Reports

The CLI is not designed to make agents read a giant graph report. The full graph stays local; agent-facing output is bounded. The strength is explicit project-maintained links before extraction: docs areas, README indexes, traceability blocks, package metadata, commands, tests, and memory policy tell agents which files are behavior truth, architecture rationale, verification, current intent, or historical memory before they read source.
