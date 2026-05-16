# Specs

Use this area for behavior specs, API contracts, and product requirements.

For projects using the dotdotgod CLI, behavior specs are validated for fenced `json dotdotgod` traceability blocks as the final section. The default enforced path is `docs/spec/**` except README files, and projects can override that path list with optional traceability config. The CLI owns the schema and prints property-level repair guidance when validation fails.

## Index

- `README.md`: specs documentation scope and local table of contents.
- `PROJECT_INITIALIZER.md`: project initializer scaffold, CLI options, overwrite policy, and docs contract.
- `DOTDOT_SETTING.md`: optional project-initializer dotdot setting behavior and generated code convention contract.
- `PLAN_MODE.md`: `/plan`, `/todos`, safe planning restrictions, concise plan review choice, and execution tracking.
- `PLAN_MODE_TOOL_SETTINGS.md`: optional Plan Mode extra tool allowlist settings and prompt requirements.
- `LOAD_PROJECT.md`: `/load` and `/dd:load` read-only project memory loading behavior.
- `MEMORY_AREA_CONFIG.md`: optional config for shared/local and fresh/stale memory-area policy.
- `TRACEABILITY_CONFIG.md`: optional config for traceability enforcement paths.
- `IMPACT_RANKING_CONFIG.md`: optional config for `graph impact` ranking presets, score breakdowns, PPR, and deterministic semantic links.
- `CLI_INTERFACE.md`: baseline CLI help, version, subcommand help, and missing `graph impact --changed` behavior.
- `CROSS_AGENT_SUPPORT.md`: cross-agent support contract for Pi, Claude Code, Codex, and shared docs workflows.
