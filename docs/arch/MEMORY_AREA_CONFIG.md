# Memory Area Config Architecture

## Purpose

Memory-area config turns the docs-first memory model into an explicit project policy. The CLI uses the policy to classify files, attach graph retrieval metadata, decide which historical bodies are indexed by default, and expose bounded load-snapshot summaries.

## Vocabulary

- **Shared memory:** committed durable project memory for all agents. Default examples are `docs/spec/`, `docs/arch/`, and `docs/test/`.
- **Local memory:** ignored project-local memory. Default examples are `docs/plan/` and `docs/archive/`.
- **Fresh memory:** current or active memory that should rank high in retrieval. Default examples are active plans and current docs indexes.
- **Stale memory:** historical or completed memory that should remain available, but should not be loaded indiscriminately.
- **Archive map:** `docs/archive/README.md`; a stale local index that stays visible by default.
- **Archive body:** files under `docs/archive/**` except the archive map; stale local history excluded by default.

## Config Discovery

The CLI checks the project root in order:

1. `dotdotgod.config.json`
2. `.dotdotgodrc.json`

If no config exists, or if runtime parsing finds invalid config, the CLI falls back to built-in defaults. Validation still reports config errors so agents can repair them.

## Default Compatibility

The default config is equivalent to the previous hard-coded behavior:

- shared fresh areas for agent rules, agent entrypoints, project overview, docs index, specs, architecture, and tests
- local fresh area for active plans
- local stale archive map included by default
- local stale archive bodies excluded by default

This preserves zero-config behavior for initialized projects and package consumers.

## Path Matching

Each area has ordered `paths` and optional `excludePaths`.

Supported patterns are intentionally small:

- exact repository-relative paths, such as `docs/archive/README.md`
- subtree patterns ending in `/**`, such as `docs/spec/**`
- suffix patterns starting with `**/`, such as `**/README.md`, for traceability exclusions

All configurable path fields are arrays. Scalar strings are validation errors rather than silently coerced values.

The first matching area classifies a path after exclusions are applied. The default order places `archive-map` before `archive-body` so the archive README stays visible while the rest of the archive remains excluded.

## Indexing Policy

File discovery still respects gitignore and the supported text/source/config file filter.

After generic exclusions for secrets, generated files, dependencies, and build outputs, memory-area policy can exclude matched files when `includeBodiesByDefault` is `false`. This is how archive bodies remain outside the default index and load snapshot.

`docs/plan` and `docs/archive/README.md` remain explicit local-memory candidates so active plans and the archive map can be surfaced even when local memory paths are ignored by git.

## Graph Metadata

Each file node receives retrieval metadata derived from the resolved memory area:

- `memoryArea`
- `memoryRole`
- `memoryScope`
- `memoryFreshness`
- `retrievalPriority`
- `retrieval.scope`
- `retrieval.freshness`
- retrieval signals such as `scope:shared`, `scope:local`, `freshness:fresh`, and `freshness:stale`

The graph also creates `memory_area:*` nodes with area label, role, scope, freshness, priority, and inclusion policy. `belongs_to_area` edges carry the same scope and freshness metadata.

## Snapshot Policy

`load-snapshot` exposes config policy in bounded form:

- `memoryConfig`: the resolved config source and area definitions
- `memoryPolicy`: area ids grouped by shared/local and fresh/stale
- `memoryAreas`: bounded files by configured area
- `bounds.archiveBodiesIncluded`: whether stale archive bodies were indexed

The snapshot remains a navigation layer. It does not embed the full graph or archive bodies by default.

## Validation Policy

Validation owns schema checks for the optional config, but it does not require projects to create a config file. Memory scope and git tracking are related but separate: local-memory defaults still require `docs/plan`, `docs/archive`, and `.dotdotgod` to be ignored, while custom memory scopes can be introduced without turning every scope decision into a gitignore rule.

The same config file can define `traceability.required` and `traceability.exclude` arrays. When absent, the default traceability policy requires `docs/spec/**` and excludes `**/README.md`. Custom required arrays replace the default list, which lets projects move behavior-traceability enforcement to other shared documentation areas while keeping the traceability block schema unchanged.

## Future Extension Points

Possible later additions:

- a load policy enum such as `eager`, `indexed`, `targeted`, or `excluded`
- per-command memory profiles
- explicit archive-body opt-in command flags
- initializer option to materialize the default config for teams that want editable policy from day one
