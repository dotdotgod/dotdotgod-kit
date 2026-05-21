# Traceability Config

## Purpose

The dotdotgod CLI supports configurable traceability enforcement paths so projects can decide which behavior documents must include final fenced `json dotdotgod` traceability blocks.

Projects without config require traceability for markdown files under `docs/spec/**` except README files. This enforcement role is separate from memory-area classification: `docs/spec/**` is also shared/fresh stable memory by default, but projects can customize memory areas and traceability paths independently.

## Config File

Traceability policy lives in the optional root config file used by project-level CLI policy. Use `dotdotgod config <root>` to inspect the resolved policy or `dotdotgod config init <root>` to create an editable default config.

1. `dotdotgod.config.json`
2. `.dotdotgodrc.json`

## Config Shape

```json
{
  "traceability": {
    "required": ["docs/spec/**"],
    "exclude": ["**/README.md"]
  }
}
```

Fields:

- `required`: array of exact repository-relative paths, `/**` subtree patterns, or `**/suffix` patterns that require traceability.
- `exclude`: optional array of exact repository-relative paths, `/**` subtree patterns, or `**/suffix` patterns excluded from enforcement.

All path fields are arrays. Scalar string path settings are invalid and validation should report them for repair.

## Behavior

- If `traceability` is absent, the CLI uses the default policy: `required: ["docs/spec/**"]`, `exclude: ["**/README.md"]`.
- If `traceability.required` is an empty array, no files require traceability. This is allowed only through explicit config.
- Custom `required` uses complete-list semantics for the configured enforcement paths.
- Traceability block parsing and graph extraction work in any markdown file that contains a valid block; the config only controls which files fail validation when the block is missing or invalid.
- Invalid config is reported by `dotdotgod validate`. Runtime commands fall back to the default policy so read-only snapshot and graph commands remain usable.

## Generated Markdown Link Section

Think of the fenced `json dotdotgod` block as the source of truth. The generated Markdown links are only a reading aid for humans. `dotdotgod validate` checks that both match, `traceability links --check` runs that same drift check in focused mode, and `traceability links --write` repairs the generated view and compact JSON.

The CLI can normalize canonical blocks under the docs markdown surface to compact single-line JSON and generate human-clickable Markdown views from them with:

```bash
dotdotgod traceability links <root> [--check|--write] [--json]
```

The command scans markdown files under `docs/`. This sync scope is intentionally separate from traceability enforcement paths: enforcement config decides which files fail validation when traceability is missing or invalid, while the sync command repairs generated traceability output for docs that already contain canonical blocks.

The generated view is bounded by HTML comment sentinels. Link labels use the full repository-relative traceability path instead of only the basename so repeated names such as `README.md` and `SKILL.md` remain distinguishable:

```markdown
<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/core.mjs](../../packages/cli/src/core.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/TRACEABILITY_CONFIG.md](../test/TRACEABILITY_CONFIG.md)
- Related docs:
  - [docs/arch/VALIDATION_ARCHITECTURE.md](../arch/VALIDATION_ARCHITECTURE.md)
  - [docs/arch/DOCS_STRUCTURE.md](../arch/DOCS_STRUCTURE.md)
  - [docs/arch/MEMORY_AREA_CONFIG.md](../arch/MEMORY_AREA_CONFIG.md)
  - [docs/spec/MEMORY_AREA_CONFIG.md](MEMORY_AREA_CONFIG.md)
  - [docs/spec/CONFIG_COMMAND.md](CONFIG_COMMAND.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory`

<!-- dotdotgod:traceability-links:end -->
```

Rules:

- The sentinel pair identifies the generated region; heading text is not authoritative.
- A markdown file may contain at most one start marker and one matching end marker.
- If markers exist exactly once, `--write` replaces only the bounded region.
- If markers are absent, `--write` inserts the region inside the final `## Traceability` section before the canonical JSON block.
- `--write` also rewrites the canonical `json dotdotgod` block as compact JSON with no indentation or blank space; validation still accepts compact and pretty JSON.
- Duplicate, reversed, or incomplete markers are validation errors and write mode refuses to repair them automatically.
- The generated region and canonical `json dotdotgod` block are excluded from markdown line and character budget checks so traceability metadata and clickability do not force otherwise focused documents over size limits.
- The generated region is derived output; user edits inside it are overwritten on the next sync.

Command behavior:

- `traceability links --check` is the default focused mode. It exits non-zero when a generated section is missing, stale, or the canonical JSON block is not compact-normalized.
- `traceability links --write` updates files in place and reports changed files or marker errors in JSON output when `--json` is passed.
- `--json` output includes at least `ok`, `command`, `root`, `mode`, `changed`, `files`, and `errors` so scripts can distinguish clean checks, changed files, and marker failures.
- `dotdotgod validate` uses the same drift comparison and reports stale generated links or non-compact traceability JSON as `TRACEABILITY_LINKS_STALE` as part of the full docs/project-memory gate.

## Focused Contract Traceability

For focused behavior contracts and micro-specs, use the traceability block to make the contract actionable for agents:

- `implementedBy`: source, config, script, prompt, adapter, or generated-resource files that implement the described behavior.
- `verifiedBy`: automated test files, manual verification docs, or test strategy docs that check the behavior.
- `relatedDocs`: architecture, test, config, or neighboring spec docs needed to interpret the behavior.
- `verificationCommands`: project-local commands an agent can run to verify the behavior or its closest available coverage.

The CLI validates traceability block shape, placement, path safety, existing path targets, and command string presence. It does not validate semantic completeness, prove that tests fully cover every behavior, or require one test per focused contract.

## Example: Move Enforcement Outside Specs

```json
{
  "traceability": {
    "required": ["docs/product/**", "docs/requirements/**"],
    "exclude": ["**/README.md"]
  }
}
```

With this config, `docs/product/FEATURE.md` and `docs/requirements/REQ.md` require traceability. `docs/spec/FEATURE.md` is outside traceability enforcement unless another rule includes it.

## Example: Enforce Only Selected Specs

```json
{
  "traceability": {
    "required": ["docs/spec/api/**", "docs/spec/SECURITY.md"],
    "exclude": ["**/README.md", "docs/spec/api/DRAFTS/**"]
  }
}
```

This policy requires traceability for API specs and one exact security spec, skips README indexes, and leaves draft API notes outside enforcement. Traceability blocks can be parsed from any markdown file that contains them; these paths only decide which files fail validation when the block is missing.

## Traceability

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/TRACEABILITY_CONFIG.md"],"relatedDocs":["docs/arch/VALIDATION_ARCHITECTURE.md","docs/arch/DOCS_STRUCTURE.md","docs/arch/MEMORY_AREA_CONFIG.md","docs/spec/MEMORY_AREA_CONFIG.md","docs/spec/CONFIG_COMMAND.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"]}
```
