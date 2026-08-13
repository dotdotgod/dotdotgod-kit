# Config Command

## Purpose

The `dotdotgod config` command makes project-level config policy discoverable from the CLI.

The CLI resolves the optional `dotdotgod.config.json` file from the project root. When the file does not exist, normal commands use built-in defaults. User-level template settings affect initialization, while user-level `embedding` supplies a runtime default that a complete project embedding profile may replace; see [`CONFIG_TEMPLATES.md`](CONFIG_TEMPLATES.md) and [`EMBEDDING_CONFIG.md`](EMBEDDING_CONFIG.md). Monorepo cascading config is not supported.

## Show Command

```bash
dotdotgod config <root> [--json]
```

The show command is read-only. It MUST NOT create or refresh `.dotdotgod/`, and it MUST NOT write a config file.

Human output summarizes:

- config source
- config path when a file is present
- memory-area count
- traceability required/exclude patterns and ordered key definitions
- markdown validation line and character budgets
- markdown validation size-check exclude patterns
- fixed impact ranking diagnostics, including the internal PPR reference
- load documentation-summary exclusions and pinned path/body lists
- Plan Mode writable documentation paths
- fuzzy reference expansion low-signal policy
- config validation errors, when present

JSON output includes:

- `ok`
- `command: "config"`
- `root`
- `source`
- `path`
- `config`
- `errors`

If the project config is invalid, `ok` is `false`, errors use the same validation shape as `dotdotgod validate`, and the displayed `config` is the default fallback policy. The command exits non-zero for invalid config, but it must not crash.

## Policy Families

The config command surfaces the same policy families that validation, Load/query routing, reference expansion, and graph impact use. It also reports the sanitized effective embedding provider, model, and source. Existing project policy output includes:

- `memory.areas`: ordered path classifiers for shared/local and fresh/stale project memory, including optional `description` and `clarify` metadata when a project defines document-area guidance.
- `traceability.required`, `traceability.exclude`, and `traceability.keys`: enforcement paths plus the ordered complete-list definition of traceability string arrays, targets, graph relations, and PPR weights.
- `validation.markdown`: line/character budgets and narrow size-check exclusions.
- `impactRanking.semantic`: request-local vector-candidate controls. The complete `impactRanking` namespace is non-blocking; valid semantic values apply, malformed values fall back to defaults, and retired or unknown fields are ignored. Fixed PPR 80/memory 20 policy and internal reference `0.4` appear only in read-only diagnostics.
- `referenceExpansion.fuzzy.lowSignal`: `add`/`remove` term lists that tune low-signal fuzzy prompt matching without replacing built-in defaults.
- `load.documentationSummary.exclude`: docs directories omitted from the Pi load prompt's documentation summary, independently from memory-area scope.
- `load.pinnedPaths` and `load.pinnedBodies`: legacy non-blocking compatibility fields that no longer alter Load output.
- `planMode.writablePaths`: fail-closed documentation subtrees where Plan Mode may create or modify valid Markdown and perform constrained directory operations.

## Init Command

```bash
dotdotgod config init <root> [--template NAME] [--json]
```

The init command creates `dotdotgod.config.json` from the explicitly selected template, the global `defaultTemplate`, or bundled `software`, in that order. The `software` template contains the current built-in defaults for:

- `memory.areas`
- `traceability`
- `validation.markdown`
- `impactRanking.semantic` only; fixed scoring policy is not serialized
- `referenceExpansion.fuzzy.lowSignal.add/remove`
- `load.documentationSummary.exclude` with `docs/plan` and `docs/archive`, plus empty `load.pinnedPaths` and `load.pinnedBodies` arrays
- `planMode.writablePaths` with `docs/plan/**` and `docs/archive/**`

The generated file must validate with `dotdotgod validate`. It includes the four default `traceability.keys` definitions. Any existing `impactRanking` value is non-blocking; retired and unknown fields are accepted but ignored and omitted from show/init serialization. Legacy `load.pinnedPaths` and `load.pinnedBodies` values are also non-blocking. `dotdotgod init` and generated adapter fallback templates use the same serializer, so their config data is structurally identical to `config init`. The generated memory areas omit optional `description` and `clarify` metadata so the template stays concise; projects can add those fields when custom document areas need role or clarity guidance. The generated reference-expansion section uses empty `add` and `remove` arrays; the resolved defaults remain visible in `dotdotgod config <root> --json` output.

Existing-file behavior:

- If `dotdotgod.config.json` already exists, init refuses to overwrite it.
- Replacing an existing config requires the user to remove or rename it first.

JSON output for successful init includes:

- `ok: true`
- `command: "config init"`
- `root`
- `path`
- `created`

JSON output for init errors includes `ok: false`, `command: "config init"`, `root`, `path` when known, `created: false`, and `error.code`.

## Non-Goals

- Do not require a config file for zero-config projects.
- Do not use initialization templates as runtime fallback policy.
- Do not change runtime fallback behavior for invalid project config.
- Do not add interactive prompts or template-management commands.
- Do not infer package-level configs in workspaces.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/core.mjs](../../packages/cli/src/core.mjs)
  - [packages/cli/src/init.mjs](../../packages/cli/src/init.mjs)
  - [packages/cli/src/memory/config.mjs](../../packages/cli/src/memory/config.mjs)
  - [packages/cli/src/config/templates.mjs](../../packages/cli/src/config/templates.mjs)
  - [packages/shared/initializer/templates/dotdotgod.config.json](../../packages/shared/initializer/templates/dotdotgod.config.json)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/CONFIG_COMMAND.md](../test/CONFIG_COMMAND.md)
  - [docs/test/CONFIG_TEMPLATES.md](../test/CONFIG_TEMPLATES.md)
- Related docs:
  - [docs/spec/CONFIG_TEMPLATES.md](CONFIG_TEMPLATES.md)
  - [docs/spec/PROJECT_INITIALIZER.md](PROJECT_INITIALIZER.md)
  - [docs/spec/MEMORY_AREA_CONFIG.md](MEMORY_AREA_CONFIG.md)
  - [docs/spec/TRACEABILITY_CONFIG.md](TRACEABILITY_CONFIG.md)
  - [docs/spec/VALIDATION_CONFIG.md](VALIDATION_CONFIG.md)
  - [docs/spec/IMPACT_RANKING_CONFIG.md](IMPACT_RANKING_CONFIG.md)
  - [docs/spec/CLI_INTERFACE.md](CLI_INTERFACE.md)
- Design decisions:
  - [docs/arch/MEMORY_AREA_CONFIG.md](../arch/MEMORY_AREA_CONFIG.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs","packages/cli/src/init.mjs","packages/cli/src/memory/config.mjs","packages/cli/src/config/templates.mjs","packages/shared/initializer/templates/dotdotgod.config.json","scripts/generate-adapters.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/CONFIG_COMMAND.md","docs/test/CONFIG_TEMPLATES.md"],"relatedDocs":["docs/spec/CONFIG_TEMPLATES.md","docs/spec/PROJECT_INITIALIZER.md","docs/spec/MEMORY_AREA_CONFIG.md","docs/spec/TRACEABILITY_CONFIG.md","docs/spec/VALIDATION_CONFIG.md","docs/spec/IMPACT_RANKING_CONFIG.md","docs/spec/CLI_INTERFACE.md"],"designDecisions":["docs/arch/MEMORY_AREA_CONFIG.md"]}
```
