# Architecture

Use this area for architecture decisions, code conventions, module boundaries, data flow notes, infrastructure/runtime dependencies, integration boundaries, and migration design.

## Index

- `README.md`: architecture documentation scope and local table of contents.
- `CODE_CONVENTIONS.md`: dotdot code conventions, including abstraction boundaries, package `verify` contracts, and when to split long code. If conventions grow across multiple topics, promote them to `conventions/README.md` with supporting UPPER_SNAKE_CASE files.
- `DEVELOPMENT_PRINCIPLES.md`: Code Complete-inspired development philosophy for construction, trade-offs, complexity management, defect prevention, diagnostics, integration, and practical quality.
- `DOCS_STRUCTURE.md`: documentation layout, naming, README index, size guideline, spec current-state writing contract, and domain directory promotion rules.
- `NATURAL_LANGUAGE_BOUNDARIES.md`: architecture decision that code validates structured markers and safety rules while LLMs own qualitative prose interpretation.
- `EXTENSION_ARCHITECTURE.md`: Pi package resource boundaries, plan/load extension responsibilities, prompt layer, and future search architecture.
- `CROSS_AGENT_ARCHITECTURE.md`: pnpm workspace package boundaries for Pi, CLI validation, Claude Code, and Codex adapters.
- `VALIDATION_ARCHITECTURE.md`: compatibility route for validation architecture docs.
- `validation/README.md`: CLI validation, graph/cache policy, dependency policy, and workspace verification strategy.
- `post/README.md`: tracked project-post structure, editorial conventions, publishing assets, and load-summary boundaries.
- `MEMORY_AREA_CONFIG.md`: config discovery, path matching, graph metadata, and snapshot policy for shared/local and fresh/stale memory areas.
- `IMPACT_RANKING_CONFIG.md`: graph impact ranking architecture, score components, PPR policy, and deterministic semantic edge generation.
- `TRELLO_DOCS_SYNC.md`: Trello card to markdown sync architecture for offline dry-run, trusted GitHub Actions writes, `dotdotgod-view` custom field data, and Power-Up UI boundaries.
