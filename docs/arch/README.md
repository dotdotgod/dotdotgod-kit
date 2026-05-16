# Architecture

Use this area for architecture decisions, code conventions, module boundaries, data flow notes, infrastructure/runtime dependencies, integration boundaries, and migration design.

## Index

- `README.md`: architecture documentation scope and local table of contents.
- `CODE_CONVENTIONS.md`: dotdot code conventions, including abstraction boundaries and when to split long code. If conventions grow across multiple topics, promote them to `conventions/README.md` with supporting UPPER_SNAKE_CASE files.
- `DOCS_STRUCTURE.md`: documentation layout, naming, README index, size guideline, and domain directory promotion rules.
- `EXTENSION_ARCHITECTURE.md`: Pi package resource boundaries, plan/load extension responsibilities, prompt layer, and future search architecture.
- `CROSS_AGENT_ARCHITECTURE.md`: pnpm workspace package boundaries for Pi, CLI validation, Claude Code, and Codex adapters.
- `VALIDATION_ARCHITECTURE.md`: CLI validation, graph/cache policy, dependency policy, and workspace verification strategy.
- `MEMORY_AREA_CONFIG.md`: config discovery, path matching, graph metadata, and snapshot policy for shared/local and fresh/stale memory areas.
- `IMPACT_RANKING_CONFIG.md`: graph impact ranking architecture, score components, PPR policy, and deterministic semantic edge generation.
