# Dotdot Setting

## Purpose

`--dotdot-setting` is an optional `project-initializer` setting for projects that should use dotdot code conventions.

The default initializer output must remain generic. Dotdot conventions are generated only when the option is explicitly requested.

## CLI Contract

```bash
dotdotgod init <project-root> --dotdot-setting
```

If the CLI is unavailable, adapter initializer workflows use the bundled fallback script with the same option:

```bash
sh skills/project-initializer/scripts/init_project.sh --dotdot-setting <project-root>
```

`--dotdot-setting` may be combined with existing initializer options such as `--project-name`, `--dry-run`, and `--force`.

## Generated Files and Changes

When `--dotdot-setting` is enabled, the initializer adds the following behavior on top of the default scaffold:

- Creates `docs/arch/CODE_CONVENTIONS.md`.
- Adds a short `AGENTS.md` working rule that references `docs/arch/CODE_CONVENTIONS.md`.
- Adds `CODE_CONVENTIONS.md` to the `docs/arch/README.md` index.

If the conventions grow across multiple topics, projects may promote the structure to `docs/arch/conventions/README.md` plus supporting UPPER_SNAKE_CASE markdown files. In that case, keep `docs/arch/README.md` linked to the conventions directory.

Existing overwrite behavior remains unchanged:

- Existing files are skipped by default.
- `--force` backs up replaced files as `<name>.bak.<timestamp>` before writing replacements.
- `--dry-run` reports intended actions without writing files.

## Code Convention Content

`docs/arch/CODE_CONVENTIONS.md` must include these dotdot abstraction rules:

- Do not introduce unnecessary abstractions.
- Do not abstract code that is not reused.
- If code grows beyond 150 lines, consider splitting or extracting focused units even when it is not reused.
- Treat repeated `dotdotgod graph impact` results that collapse onto one large file as a design signal to split mixed responsibilities by behavior.
- Dotdotgod impact reveals hotspots but does not replace focused module boundaries.
- Do not abstract reused code when the reused behavior is likely to split into separate features or flows later.
- Prefer local, explicit code until a stable reuse pattern appears.

## Non-Goals

- Do not include the full dotdot code convention body directly in `AGENTS.md`.
- Do not enable dotdot conventions by default.
- Do not automatically merge dotdot conventions into existing project files unless the user explicitly uses `--force` or asks for manual migration.

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
