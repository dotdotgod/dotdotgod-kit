# Architecture

Use this area for architecture decisions, code conventions, module boundaries, data flow notes, infrastructure/runtime dependencies, integration boundaries, and migration design.

## Index

- `README.md`: architecture documentation scope and local table of contents.
- `CONTEXT_EXECUTION_ARCHITECTURE.md`: shared execution/retrieval runtime, FTS5 storage, MCP `roots/list` and `sessionBound` boundaries, `impact.sqlite` v2 modular hooks, and adapter packaging.
- `CODE_CONVENTIONS.md`: dotdot code conventions, including abstraction boundaries, package `verify` contracts, and when to split long code. If conventions grow across multiple topics, promote them to `conventions/README.md` with supporting UPPER_SNAKE_CASE files.
- `CONFIG_TEMPLATE_ARCHITECTURE.md`: initialization template registry, global/custom resolution boundary, skill selection, and POSIX fallback.
- `EMBEDDING_PROVIDERS.md`: runtime embedding resolution, provider boundaries, cache identity, and remote safety.
- `INCREMENTAL_INDEX_ENGINE.md`: SQLite WAL, incremental detection, FTS5, and adaptive HNSW retrieval.
- `DEVELOPMENT_PRINCIPLES.md`: Code Complete-inspired development philosophy for construction, trade-offs, complexity management, defect prevention, diagnostics, integration, and practical quality.
- `DOCS_STRUCTURE.md`: documentation layout, naming, README index, size guideline, spec current-state writing contract, and domain directory promotion rules.
- `NATURAL_LANGUAGE_BOUNDARIES.md`: architecture decision that code validates structured markers and safety rules while LLMs own qualitative prose interpretation.
- `EXTENSION_ARCHITECTURE.md`: Pi package resource boundaries, plan/load extension responsibilities, prompt layer, and local query architecture.
- `CROSS_AGENT_ARCHITECTURE.md`: six-adapter workspace architecture (Pi, OpenCode, Claude Code, Codex, Hermes, Antigravity), shared generator/bundler, and unified non-blocking advisory impact.
- `NATIVE_PLAN_INTEGRATION.md`: native planning settings, permission boundaries, and Antigravity Option C-2 artifact-to-workspace sync flow.
- `VALIDATION_ARCHITECTURE.md`: compatibility route for validation architecture docs.
- `validation/README.md`: CLI validation, graph/cache policy, dependency policy, and workspace verification strategy.
- `post/README.md`: tracked project-post structure, editorial conventions, publishing assets, and load-summary boundaries.
- `MEMORY_AREA_CONFIG.md`: config discovery, path matching, graph metadata, and separate graph/Load-query policies for shared/local and fresh/stale memory areas.
- `IMPACT_GRAPH_EXPLORER.md`: standalone traceability graph delivery, shared Obsidian/browser policy, D3/Canvas rendering, and runtime boundaries.
- `IMPACT_RANKING_CONFIG.md`: fixed graph-impact score architecture, weighted PPR, memory policy, configurable traceability relations, and request-local vector overlay boundaries.
