# Specs

Use this area for behavior specs, API contracts, and product requirements.

Start here when you need the behavior contract for a command, adapter workflow, config field, or validation rule. Use `docs/test/` for how behavior is verified and `docs/arch/` for why it is implemented that way.

For projects using the dotdotgod CLI, `docs/spec/**` has two default roles. It is stable shared/fresh project memory through the memory-area policy, and behavior specs under it are validated for fenced `json dotdotgod` traceability blocks as the final section. The default enforced path is `docs/spec/**` except README files, and projects can customize memory classification with `memory.areas` or override traceability enforcement paths with optional traceability config. The CLI owns the schema and prints property-level repair guidance when validation fails.

For traceability, treat the `json dotdotgod` block as the source of truth. Generated Markdown links are a reading aid. `dotdotgod validate` reports generated-link or compact-JSON drift, and `dotdotgod traceability links <root> --write` repairs generated sections and compact JSON.

## Config Overview

Project-level config is optional and lives in `dotdotgod.config.json`. Use `dotdotgod config <root>` to inspect the resolved policy and `dotdotgod config init <root>` to create an editable default file. Focused config specs:

- `MEMORY_AREA_CONFIG.md`: `memory.areas`, including shared/local scope, fresh/stale freshness, priorities, and archive-body inclusion.
- `TRACEABILITY_CONFIG.md`: `traceability.required` and `traceability.exclude` paths for validation enforcement.
- `VALIDATION_CONFIG.md`: `validation.markdown` line/character budgets and size-check excludes.
- `IMPACT_RANKING_CONFIG.md`: `impactRanking` presets, weights, PPR, routing hints, compact text output, and structured YML output.
- `REFERENCE_EXPANSION.md`: `referenceExpansion.fuzzy.lowSignal.add/remove` for fuzzy prompt matching.
- `CONFIG_COMMAND.md`: config discovery, JSON output, initialization, invalid-config fallback, and user-facing repair behavior.

## Index

- `README.md`: specs documentation scope and local table of contents.
- `PROJECT_INITIALIZER.md`: project initializer scaffold, CLI options, overwrite policy, and docs contract.
- `DOTDOT_SETTING.md`: optional project-initializer dotdot setting behavior and generated code convention contract.
- `PLAN_MODE.md`: compatibility route for Plan Mode behavior docs.
- `plan-mode/README.md`: `/dd:plan`, safe planning restrictions, context shaping, concise plan review choice, and execution tracking.
- `PLAN_MODE_TOOL_SETTINGS.md`: optional Plan Mode extra tool allowlist settings and prompt requirements.
- `LOAD_PROJECT.md`: `/load`, `/dd:load`, and `/dd:load:compact` documentation-map and focused-query behavior.
- `MEMORY_AREA_CONFIG.md`: optional config for shared/local and fresh/stale memory-area policy.
- `TRACEABILITY_CONFIG.md`: optional config for traceability enforcement paths, generated-link drift checks, and repair flow.
- `VALIDATION_CONFIG.md`: optional config for markdown validation size budgets and explicit size-check exclusions.
- `IMPACT_RANKING_CONFIG.md`: optional config for `graph impact` ranking presets, score breakdowns, compact text/YML output, PPR, and deterministic semantic links.
- `CONFIG_COMMAND.md`: CLI behavior for inspecting and initializing project-level dotdotgod config files.
- `TRELLO_DOCS_SYNC.md`: Trello card to markdown sync contract with local/PR dry-run, trusted GitHub Actions writes, `dotdotgod-view` custom field data, and Power-Up UI display.
- `cli/README.md`: focused CLI specs for discovery/help, local multilingual query and vector cache, graph impact, traceability links, and plan commands.
- `CLI_INTERFACE.md`: compatibility route for the legacy monolithic CLI interface spec; new behavior belongs under `cli/`.
- `REFERENCE_EXPANSION.md`: CLI reference resolution and prompt-time expansion from the dotdotgod graph/index.
- `CROSS_AGENT_SUPPORT.md`: cross-agent support contract for Pi, Claude Code, Codex, and shared docs workflows.
- `WORKSPACE_VERIFICATION.md`: root verification, cache, pre-push, and package verify contract behavior.
