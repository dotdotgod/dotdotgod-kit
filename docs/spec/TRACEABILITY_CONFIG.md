# Traceability Config

## Purpose

The dotdotgod CLI supports configurable traceability enforcement paths so projects can decide which behavior documents must include final fenced `json dotdotgod` traceability blocks.

Without config, Markdown under `docs/spec/**` except README files requires traceability. Enforcement remains independent from memory-area classification.

## Config File

Traceability policy lives in the optional root `dotdotgod.config.json` file used by project-level CLI policy. Use `dotdotgod config <root>` to inspect the resolved policy or `dotdotgod config init <root>` to create an editable default config.

## Config Shape

```json
{
  "traceability": {
    "required": ["docs/spec/**"],
    "exclude": ["**/README.md"],
    "keys": [
      { "key": "implementedBy", "label": "Implemented by", "description": "Files that implement the behavior.", "target": "path", "relation": "implemented_by", "weight": 4 },
      { "key": "verifiedBy", "label": "Verified by", "description": "Tests or maintained verification documents.", "target": "path", "relation": "verified_by", "weight": 4 },
      { "key": "relatedDocs", "label": "Related docs", "description": "Documents needed to interpret the behavior.", "target": "path", "relation": "related_doc", "weight": 3 },
      { "key": "designDecisions", "label": "Design decisions", "description": "Maintained architecture or design decision documents that constrain the behavior.", "target": "path", "relation": "design_decision", "weight": 3 }
    ]
  }
}
```

Fields:

- `required`: array of exact repository-relative paths, `/**` subtree patterns, or `**/suffix` patterns that require traceability.
- `exclude`: optional array of exact repository-relative paths, `/**` subtree patterns, or `**/suffix` patterns excluded from enforcement.
- `keys`: optional ordered complete-list policy for traceability string-array fields. Each definition has unique `key`, display `label`, `description`, `target` (`path` or `command`), unique snake_case graph `relation`, and finite `weight` from `0` through `20`.

Missing `keys` resolves to the four defaults above: implementation paths, verification evidence paths, related documentation paths, and design-decision paths. An explicit empty array disables all traceability fields. A zero weight keeps parsing and rendering but removes that relation from PPR traversal. Keys cannot collide with `kind`, `contracts`, `id`, `title`, or `sections`, and traceability relations cannot collide with maintained non-traceability graph relations.

All path fields are arrays. Scalar string path settings are invalid and validation should report them for repair.

## Behavior

- If `traceability` is absent, the CLI uses the default policy: `required: ["docs/spec/**"]`, `exclude: ["**/README.md"]`.
- If `traceability.required` is an empty array, no files require traceability. This is allowed only through explicit config.
- Custom `required` uses complete-list semantics for the configured enforcement paths.
- Traceability block parsing, validation, generated headings, contracts, and graph extraction all iterate the resolved ordered key list. Fields omitted from that complete list are invalid at top level and in contracts.
- Invalid config is reported by `dotdotgod validate`. Read-only commands may use default fallback policy, but `traceability links --write` fails closed before changing Markdown.

## Generated Markdown Link Section

Think of the fenced `json dotdotgod` block as the source of truth. The generated Markdown links are only a reading aid for humans. `dotdotgod validate` checks that both match, `traceability links --check` runs that same drift check in focused mode, and `traceability links --write` repairs the generated view and compact JSON.

The CLI can normalize canonical blocks under the docs markdown surface to compact single-line JSON and generate human-clickable Markdown views from them with:

```bash
dotdotgod traceability links <root> [--check|--write] [--json]
```

The command scans Markdown under `docs/`; enforcement paths decide missing-block failures, while sync repairs docs that already contain canonical blocks.

The generated view is bounded by HTML comment sentinels. Labels and ordering come from the resolved key policy; path links show full repository-relative paths.

Rules:

- The sentinel pair identifies the generated region; heading text is not authoritative.
- A markdown file may contain at most one start marker and one matching end marker.
- If markers exist exactly once, `--write` replaces only the bounded region.
- If markers are absent, `--write` inserts the region inside the final `## Traceability` section before the canonical JSON block.
- `--write` also rewrites the canonical `json dotdotgod` block as compact JSON with no indentation or blank space; validation still accepts compact and pretty JSON.
- Duplicate, reversed, or incomplete markers are validation errors and write mode refuses to repair them automatically.
- Generated regions and canonical blocks are excluded from Markdown size checks; generated-region edits are overwritten on sync.

Command behavior:

- `traceability links --check` is the default focused mode. It exits non-zero when a generated section is missing, stale, or the canonical JSON block is not compact-normalized.
- `traceability links --write` updates files in place and reports changed files or marker errors in JSON output when `--json` is passed.
- `--json` output includes at least `ok`, `command`, `root`, `mode`, `changed`, `files`, and `errors` so scripts can distinguish clean checks, changed files, and marker failures.
- `dotdotgod validate` uses the same drift comparison and reports stale generated links or non-compact traceability JSON as `TRACEABILITY_LINKS_STALE` as part of the full docs/project-memory gate.

## Focused Contract Traceability

For focused behavior contracts and micro-specs, use the resolved keys to make the contract actionable for agents. The four zero-config defaults represent implementation paths, verification evidence paths, related documentation paths, and maintained design-decision paths. `designDecisions` records architecture or design decisions that constrain the behavior, while `relatedDocs` records broader context needed to interpret it. Avoid placing the same target in both fields because parallel graph edges would overstate its ranking evidence. Runnable commands belong in verification documents or project command guidance. Custom path and command keys, including an explicitly configured `verificationCommands` key, continue to use their configured descriptions and validation targets.

The CLI validates traceability block shape, placement, path safety, memory-area scope, existing path targets, and command string presence. Path fields must point to shared durable files; they must not reference local-memory areas such as `docs/plan/**`, `docs/archive/**`, or custom `memory.areas[]` entries with `scope: "local"`. It does not validate semantic completeness, prove that tests fully cover every behavior, or require one test per focused contract.

Large specs may add optional JSON-only `contracts[]` entries inside the same canonical block:

```json
{
  "kind": "spec",
  "implementedBy": ["packages/cli/src/core.mjs"],
  "verifiedBy": ["packages/cli/test/core.test.mjs"],
  "relatedDocs": ["docs/arch/VALIDATION_ARCHITECTURE.md"],
  "designDecisions": ["docs/arch/VALIDATION_ARCHITECTURE.md"],
  "contracts": [{
    "id": "TRACEABILITY-CONTRACTS-001",
    "title": "Contract entries refine traceability",
    "sections": ["Focused Contract Traceability"],
    "implementedBy": ["packages/cli/src/docs/traceability.mjs"],
    "verifiedBy": ["packages/cli/test/core.test.mjs"],
    "relatedDocs": ["docs/test/TRACEABILITY_CONFIG.md"],
    "designDecisions": ["docs/arch/VALIDATION_ARCHITECTURE.md"]
  }]
}
```

Contract rules:

- `contracts` is optional; `contracts: []` is valid and renders no contract details.
- Each contract requires non-empty string `id` and `title`; IDs must be unique only within the current traceability block/file.
- `sections` is an optional string array of same-file navigation hints. Heading existence is not a hard validation rule in the initial version.
- Configured traceability keys are optional within each contract, but when present they use the same target-specific validation as top-level fields.
- Unknown contract and top-level traceability fields are validation errors under complete-list semantics.
- Markdown comment anchors, strict heading validation, symbol references, and line references are deferred non-goals.
- Generated Markdown adds concise contract summaries with IDs, titles, and counts rather than verbose full target lists. Contract graph nodes use file-scoped IDs such as `contract:docs/spec/TRACEABILITY_CONFIG.md#TRACEABILITY-CONTRACTS-001`, and detailed JSON/YML impact output includes contract identity while compact output stays bounded.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/memory/config.mjs](../../packages/cli/src/memory/config.mjs)
  - [packages/cli/src/docs/traceability.mjs](../../packages/cli/src/docs/traceability.mjs)
  - [packages/cli/src/commands/traceability.mjs](../../packages/cli/src/commands/traceability.mjs)
  - [packages/cli/src/validate/run.mjs](../../packages/cli/src/validate/run.mjs)
  - [packages/cli/src/graph/metadata.mjs](../../packages/cli/src/graph/metadata.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/TRACEABILITY_CONFIG.md](../test/TRACEABILITY_CONFIG.md)
- Related docs:
  - [docs/spec/MEMORY_AREA_CONFIG.md](MEMORY_AREA_CONFIG.md)
  - [docs/spec/CONFIG_COMMAND.md](CONFIG_COMMAND.md)
- Design decisions:
  - [docs/arch/VALIDATION_ARCHITECTURE.md](../arch/VALIDATION_ARCHITECTURE.md)
  - [docs/arch/DOCS_STRUCTURE.md](../arch/DOCS_STRUCTURE.md)
  - [docs/arch/MEMORY_AREA_CONFIG.md](../arch/MEMORY_AREA_CONFIG.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/memory/config.mjs","packages/cli/src/docs/traceability.mjs","packages/cli/src/commands/traceability.mjs","packages/cli/src/validate/run.mjs","packages/cli/src/graph/metadata.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/TRACEABILITY_CONFIG.md"],"relatedDocs":["docs/spec/MEMORY_AREA_CONFIG.md","docs/spec/CONFIG_COMMAND.md"],"designDecisions":["docs/arch/VALIDATION_ARCHITECTURE.md","docs/arch/DOCS_STRUCTURE.md","docs/arch/MEMORY_AREA_CONFIG.md"]}
```
