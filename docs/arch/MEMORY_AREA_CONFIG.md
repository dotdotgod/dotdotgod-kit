# Memory Area Config Architecture

## Purpose

Memory-area config turns the docs-first memory model into an explicit project policy. The CLI uses the policy to classify files, attach graph retrieval metadata, and decide which historical bodies are indexed or searched by default.

## Vocabulary

- **Shared memory:** committed durable project memory for all agents. Default examples are `docs/spec/`, `docs/arch/`, and `docs/test/`.
- **Local memory:** ignored project-local memory. Default examples are `docs/plan/` and `docs/archive/`.
- **Fresh memory:** current or active memory that should rank high in retrieval. Default examples are active plans and current docs indexes.
- **Stale memory:** historical or completed memory that should remain available, but should not be loaded indiscriminately.
- **Archive map:** `docs/archive/README.md`; a stale local index that stays visible by default.
- **Archive body:** files under `docs/archive/**` except the archive map; stale local history excluded by default.

## Config Discovery

The CLI checks the project root for `dotdotgod.config.json`.

If no config exists, or if runtime parsing finds invalid config, the CLI falls back to built-in defaults. Validation still reports config errors so agents can repair them.

`dotdotgod config <root>` exposes the same resolved policy without refreshing the graph cache. `dotdotgod config init <root>` and project initialization write `dotdotgod.config.json` through the same canonical default serializer. Generated adapter fallback templates come from that serializer as well. Config remains root-scoped; there is no global, user-level, or package-cascading config lookup.

## Default Compatibility

The default config is equivalent to the previous hard-coded behavior:

- shared fresh areas for agent rules, agent entrypoints, project overview, docs index, specs, architecture, and tests
- local fresh area for active plans
- local stale archive map included by default
- local stale archive bodies excluded by default
- a final shared fresh `docs/**` catch-all for concept, report, and project-defined documentation areas

Specific areas keep first-match precedence over the catch-all.

## Path Matching

Each area has ordered `paths` and optional `excludePaths`.

Supported patterns are intentionally small:

- exact repository-relative paths, such as `docs/archive/README.md`
- subtree patterns ending in `/**`, such as `docs/spec/**`
- suffix patterns starting with `**/`, such as `**/README.md`, for traceability exclusions

All configurable path fields are arrays. Scalar strings are validation errors.

The first matching area classifies a path after exclusions are applied. The default order places `archive-map` before `archive-body` so the archive README stays visible while the rest of the archive remains excluded.

## Indexing Policy

File discovery still respects gitignore and the supported text/source/config file filter.

After generic exclusions for secrets, generated files, dependencies, and build outputs, memory-area policy can exclude matched files when `includeBodiesByDefault` is `false`. This is how archive bodies remain outside the default graph and vector indexes.

Ignored local-memory recovery is derived from configured local areas whose bodies are enabled. Exact paths and `/**` subtree roots are walked directly under a hard cap, then every candidate passes the normal index safety and area-inclusion checks. Broad `**/suffix` patterns do not trigger repository-wide local walks. The archive map remains discoverable while the archive-body area's disabled body policy prevents recursive archive indexing.

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

The graph also creates `memory_area:*` nodes with area label, role, scope, freshness, priority, and inclusion policy. `belongs_to_area` edges carry the same scope and freshness metadata. Optional document-clarity metadata is preserved in resolved config output rather than changing graph ranking semantics.

Impact ranking uses this metadata as a bounded memory-policy score. Curated traceability remains higher-confidence than deterministic semantic edges, while memory priority only adjusts retrieval order without replacing explicit docs/code/test links.

## Load Documentation Summary Policy

`load.documentationSummary.exclude` is separate from `memory.areas` on purpose. Memory areas classify retrieval roles and index inclusion, while the documentation-summary policy controls only which discovered docs directories Pi renders in the load prompt's book-like table of contents. Both built-in and materialized workspace defaults exclude `docs/plan` and `docs/archive`, but neither policy is derived from local-memory scope. An explicit empty exclusion list opts both directories into the summary without changing their memory classification or archive-body policy.

The CLI owns validation, normalization, fallback defaults, and config display. The Pi adapter reads the root config directly, discovers included Markdown recursively, and renders a prefix-compressed documentation tree. CLI query applies the same exclusion policy before vector indexing.

## Legacy Load Pinned Fields

`load.pinnedPaths` and `load.pinnedBodies` remain validated and serialized for config compatibility, but no longer affect Load after removal of the snapshot command. New projects should use the maintained documentation map, README routing, and focused query instead of pinned Load bodies. Secret-like values remain invalid so legacy config cannot silently preserve unsafe paths.

## Validation Policy

Validation owns schema checks for the optional config. Projects may omit the config file. Memory scope and git tracking are related but separate: local-memory defaults still require `docs/plan`, `docs/archive`, and `.dotdotgod` to be ignored. Custom memory scopes do not automatically create gitignore rules.

Optional `description` and `clarify` fields are metadata for humans and agent skills. They must be valid strings/arrays when present, but they do not affect path matching, inclusion policy, traceability enforcement, impact ranking weights, or default config initialization. Load documentation-summary exclusions are validated independently and do not reclassify memory areas.

The same config file can define `traceability.required` and `traceability.exclude` arrays. When absent, the default traceability policy requires `docs/spec/**` and excludes `**/README.md`. Custom required arrays replace the default list, which lets projects move behavior-traceability enforcement to other shared documentation areas while keeping the traceability block schema unchanged.

## Related Behavior and Verification

- Behavior spec: [`docs/spec/MEMORY_AREA_CONFIG.md`](../spec/MEMORY_AREA_CONFIG.md).
- Verification doc: [`docs/test/MEMORY_AREA_CONFIG.md`](../test/MEMORY_AREA_CONFIG.md).
- Neighboring config specs: [`docs/spec/TRACEABILITY_CONFIG.md`](../spec/TRACEABILITY_CONFIG.md), [`docs/spec/VALIDATION_CONFIG.md`](../spec/VALIDATION_CONFIG.md), and [`docs/spec/CONFIG_COMMAND.md`](../spec/CONFIG_COMMAND.md).

## Future Extension Points

Possible later additions:

- a load policy enum such as `eager`, `indexed`, `targeted`, or `excluded`
- per-command memory profiles
- explicit archive-body opt-in command flags
