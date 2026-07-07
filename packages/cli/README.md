# @dotdotgod/cli

[![npm version](https://img.shields.io/npm/v/@dotdotgod/cli.svg)](https://www.npmjs.com/package/@dotdotgod/cli) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod--kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/cli) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](https://github.com/dotdotgod/dotdotgod-kit/blob/main/LICENSE)

Command-line tools for dotdotgod project memory.

Use this package when you want to initialize a docs-first project scaffold, validate project-memory docs, build a local graph/cache, load bounded context snapshots, expand project references, or ask what should be checked after a file changes.

These commands implement dotdotgod's project-memory loop — init, load, plan, impact — for shells, scripts, CI, and any agent without a dedicated adapter.

## Start Here

Run one command without installing globally:

```bash
npx @dotdotgod/cli validate .
```

Install only if you want a persistent `dotdotgod` command:

```bash
npm install -g @dotdotgod/cli
```

Common first commands:

```bash
dotdotgod init .
dotdotgod validate .
dotdotgod load-snapshot .
dotdotgod graph impact . --changed <path> --compact
```

## What It Does

- `init` creates `AGENTS.md`, thin agent entrypoints, docs indexes, active-plan space, archive map, and local cache ignores.
- `validate` checks the dotdotgod docs/project-memory structure, local links, traceability blocks, config validity, and optional index freshness.
- `index` builds `.dotdotgod/manifest.json` and compact graph shards from maintained project files.
- `load-snapshot` returns a bounded first-pass project map for AI agents, including files pinned through the `load.pinnedPaths`/`load.pinnedBodies` config so context such as code conventions stays visible on every load.
- `resolve` and `expand` map explicit or high-signal prompt references to project files.
- `graph impact` ranks likely related specs, tests, docs, commands, and source files for a changed path.
- `traceability links` checks or repairs generated Markdown traceability-link sections.
- `plan validate` validates active plan artifacts and simplified Plan Generator checkpoints before execution.
- `plan stage create` creates an internal `.dotdotgod-plan/NN_STAGE_NAME.md` checkpoint for a simplified Plan Generator stage.
- `trello sync` plans or writes Trello linked-doc metadata from configured docs paths.

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
dotdotgod traceability links . --check
dotdotgod traceability links . --write
dotdotgod plan validate docs/plan/<task-slug>/README.md
dotdotgod plan validate docs/plan/<task-slug>/README.md --stage 04
dotdotgod plan stage create 02 docs/plan/<task-slug>/README.md
dotdotgod graph impact . --changed <path>
dotdotgod graph impact . --changed <path> --compact
dotdotgod graph impact . --changed <path> --yml
dotdotgod graph communities .
```

`--help`, `-h`, and `help` print usage to stdout. Command-specific help is available with `dotdotgod <command> --help`, including nested commands such as `dotdotgod graph impact --help`, `dotdotgod config init --help`, `dotdotgod plan stage create --help`, and `dotdotgod traceability links --help`.

## Which Command Should I Use?

| Need | Command |
| --- | --- |
| Add the dotdotgod scaffold to a repository | `dotdotgod init .` |
| Check docs, links, config, traceability, and optional index freshness | `dotdotgod validate . --check-index` |
| Refresh the local graph/cache | `dotdotgod index .` |
| Give an agent a bounded project map | `dotdotgod load-snapshot .` |
| Resolve `[[...]]` references from a prompt | `dotdotgod expand . "Update [[PLAN_MODE]]"` |
| Repair generated traceability-link sections | `dotdotgod traceability links . --write` |
| Validate an active plan before execution | `dotdotgod plan validate docs/plan/<task>/README.md` |
| Create an internal Plan Generator stage checkpoint | `dotdotgod plan stage create 03 docs/plan/<task>/README.md` |
| See what else to inspect after a change | `dotdotgod graph impact . --changed <path> --compact` |
| Preview Trello linked-doc updates | `dotdotgod trello sync . --dry-run` |

## Changed-File Impact

```bash
$ dotdotgod graph impact . --changed packages/cli/src/core.mjs --compact
```

```text
docs:
- docs/spec/REFERENCE_EXPANSION.md (91; incoming:implemented_by, semantic_similarity)
- docs/test/REFERENCE_EXPANSION.md (65.3; verified_by, semantic_similarity)

files:
- packages/cli/src/core.mjs (100; changed-file)
- packages/pi/extensions/plan-mode/index.ts (45; implemented_by, semantic_similarity)
```

`graph impact` needs `--changed <path>` so ranking has a seed file. Use `--compact` for short text, `--yml` or `--yaml` for compact structured agent-facing output, and `--json` for machine-readable detail.

The graph is built from maintained project files: Markdown links, README routes, headings, traceability blocks, package metadata, memory areas, imports, exports, commands, tests, and deterministic routing hints.

## Validation and Verification Boundaries

| Command | Responsibility |
| --- | --- |
| `dotdotgod validate <root>` | Checks dotdotgod docs/project-memory structure, local links, traceability blocks, generated traceability-link drift, config validity, and optional index freshness. |
| `dotdotgod traceability links <root> --check` | Runs only the generated traceability-link and compact JSON drift check. |
| `dotdotgod traceability links <root> --write` | Repairs generated traceability-link sections and rewrites canonical `json dotdotgod` blocks as compact JSON. |
| `dotdotgod plan validate <plan-readme>` | Checks active-plan structure, required Markdown sections, decision/assumption blockers, atomic-task verification, and simplified Plan Generator checkpoints when present. |
| `pnpm run verify` | Runs this repository's quality gate: generated-resource checks, package verify contracts, tests, typecheck, and docs validation where each package defines it. |

Most users start with `validate`. Use `traceability links --write` only when generated traceability output needs repair, and use `verify` before release-style handoff in this repository.

## Memory, Specs, and Config

The default scaffold gives docs explicit roles:

- `docs/spec/**`: product behavior and requirements. This path is traceability-enforced by default.
- `docs/arch/**`: architecture rationale, boundaries, conventions, and decisions.
- `docs/test/**`: verification strategy, regression coverage, fixtures, and commands.
- `docs/plan/**`: local active-task intent.
- `docs/archive/README.md`: local archive map included by default.
- `docs/archive/**`: local archive bodies excluded by default unless targeted.

Use `memory.areas` to customize memory classification and retrieval priority. Use `traceability.required` and `traceability.exclude` to customize which Markdown paths need `json dotdotgod` traceability blocks. Use `validation.markdown`, `impactRanking`, and `referenceExpansion` to tune size budgets, impact scoring, and fuzzy prompt matching.

## Indexing Scope

`dotdotgod index` is gitignore-aware by default. It uses `git ls-files --cached --others --exclude-standard` when possible, then filters to supported text, source, script, config, web, and infrastructure files.

Default exclusions include dependency, generated, cache, and secret-like paths such as `.git/`, `.dotdotgod/`, `node_modules/`, `dist/`, `build/`, `coverage/`, `.next/`, `target/`, `vendor/`, `.venv/`, and `.env`. Example env templates such as `.env.example` remain indexable.

## Learn More

See the [root README](https://github.com/dotdotgod/dotdotgod-kit#readme), [Context curation](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_CURATION.md), [Context mechanics](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_MECHANICS.md), [Memory area config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/MEMORY_AREA_CONFIG.md), and [Traceability config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/TRACEABILITY_CONFIG.md).
