# Dotdot Setting

## Purpose

`--dotdot-setting` is an optional `project-initializer` setting for projects that should use dotdot documentation structure and code conventions.

The default initializer output is generic. Dotdot docs-structure and code-convention docs are generated only when the option is explicitly requested.

## CLI Contract

```bash
dotdotgod init <project-root> --dotdot-setting
```

If the CLI is unavailable, adapter initializer workflows use the bundled fallback script with the same option:

```bash
sh skills/project-initializer/scripts/init_project.sh --dotdot-setting <project-root>
```

`--dotdot-setting` may be combined with initializer options such as `--project-name`, `--dry-run`, and `--force`.

## Generated Files and Changes

When `--dotdot-setting` is enabled, the initializer adds the following behavior on top of the default scaffold:

- Creates `docs/arch/DOCS_STRUCTURE.md` with general documentation layout, naming, README index, spec current-state writing, traceability, plan, and archive rules.
- Creates `docs/arch/CODE_CONVENTIONS.md` with general abstraction, file-size, impact-hotspot, extraction, and readability rules.
- Adds a short `AGENTS.md` working rule that references `docs/arch/DOCS_STRUCTURE.md` and `docs/arch/CODE_CONVENTIONS.md`.
- Adds `DOCS_STRUCTURE.md` and `CODE_CONVENTIONS.md` to the `docs/arch/README.md` index.

If the conventions grow across multiple topics, projects may promote the structure to `docs/arch/conventions/README.md` plus supporting UPPER_SNAKE_CASE markdown files. In that case, keep `docs/arch/README.md` linked to the conventions directory.

Overwrite behavior:

- Files already present are skipped by default.
- `--force` backs up replaced files as `<name>.bak.<timestamp>` before writing replacements.
- `--dry-run` reports intended actions without writing files.

## Generated Docs Structure Content

`docs/arch/DOCS_STRUCTURE.md` must include general dotdot documentation rules for:

- `docs/spec`, `docs/test`, `docs/arch`, `docs/plan`, and `docs/archive` responsibilities.
- kebab-case docs directories and UPPER_SNAKE_CASE markdown files.
- README files as local tables of contents.
- focused file size guidance and domain-directory promotion.
- behavior specs as current product contracts rather than historical change logs.
- traceability blocks as the final section for CLI-validated behavior specs.
- active plan and archive directory shapes.

## Code Convention Content

`docs/arch/CODE_CONVENTIONS.md` must include general dotdot rules for:

- avoiding unnecessary abstractions and non-reused abstractions.
- keeping reused code local until reuse is stable and not likely to diverge.
- splitting source files by behavior or responsibility when they grow beyond focused readability.
- treating repeated `dotdotgod graph impact` hotspots as a design signal to split mixed responsibilities.
- extracting pure helpers for testable behavior before adding broad framework abstractions.
- preserving plain-text readability for humans and coding agents.

## Non-Goals

- Do not include the full dotdot docs-structure or code-convention bodies directly in `AGENTS.md`.
- Do not enable dotdot conventions by default.
- Do not automatically merge dotdot conventions into files already present unless the user explicitly uses `--force` or asks for manual edits.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": [
    "packages/cli/src/init.mjs",
    "packages/shared/initializer/scripts/init_project.sh",
    "packages/pi/skills/project-initializer/scripts/init_project.sh",
    "packages/claude-code/skills/project-initializer/scripts/init_project.sh",
    "packages/codex/skills/project-initializer/scripts/init_project.sh",
    "docs/arch/DOCS_STRUCTURE.md",
    "docs/arch/CODE_CONVENTIONS.md"
  ],
  "verifiedBy": [
    "packages/cli/test/e2e.test.mjs",
    "docs/test/README.md"
  ],
  "relatedDocs": [
    "docs/spec/PROJECT_INITIALIZER.md",
    "docs/arch/DOCS_STRUCTURE.md"
  ],
  "verificationCommands": [
    "node packages/cli/bin/dotdotgod.mjs init . --dry-run --dotdot-setting --project-name fixture-name",
    "sh packages/pi/skills/project-initializer/scripts/init_project.sh --dry-run --dotdot-setting --project-name fixture-name .",
    "pnpm --filter @dotdotgod/cli test",
    "pnpm run verify:generated"
  ]
}
```
