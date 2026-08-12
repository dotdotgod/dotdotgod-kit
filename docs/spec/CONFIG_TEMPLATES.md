# Config Templates

## Purpose

Config templates are initialization sources for creating `dotdotgod.config.json`. They do not participate in normal runtime config resolution.

## Runtime Boundary

- When `dotdotgod.config.json` exists, commands use that project config.
- When it does not exist, commands use the built-in zero-config policy.
- Templates do not replace zero-config runtime policy.
- A generated project config is an independent snapshot; later template changes do not update it.

## User Files

User-level template state lives under the home directory:

```text
~/.dotdotgod/
  config.json
  templates/
    <template-name>.json
```

`config.json` supports:

```json
{"defaultTemplate":"software"}
```

The setting selects the template used by initialization when `--template` is omitted. Missing global settings select `software`. User files are managed by direct file editing in the initial release.

## Built-in Templates

The CLI provides:

- `software`
- `research`
- `case-and-evidence`
- `publication`
- `portfolio`
- `policy`

`software` is structurally equivalent to the previous canonical generated config.

Each bundled template also owns an explicit initialization scaffold for its directory-based domain areas. Initialization combines that scaffold with the common agent, docs, plan, and archive baseline. The scaffold is maintained explicitly rather than inferred from memory-area globs, because configured paths may identify files, optional areas, generated artifacts, or non-document data.

Custom templates affect config creation only and receive the common scaffold. The CLI does not interpret custom path patterns as filesystem creation instructions.

## Selection and Shadowing

```bash
dotdotgod config init <root> [--template NAME] [--json]
dotdotgod init <root> [--template NAME] [--json]
```

Resolution rules:

1. An explicit `--template` selects that name.
2. Otherwise, initialization reads global `defaultTemplate`.
3. Otherwise, it selects `software`.
4. A valid `~/.dotdotgod/templates/<name>.json` completely replaces a same-name built-in template.
5. There is no deep merge.

Template names are kebab-case. Custom template files use the complete project config schema.

## Failure Behavior

- Unknown templates fail without creating `dotdotgod.config.json`.
- Invalid global JSON or `defaultTemplate` fails initialization.
- Invalid selected custom JSON or config schema fails initialization and does not fall through to a same-name built-in template.
- Existing project configs preserve existing skip/refuse-to-overwrite behavior.
- Read-only commands do not create or update user-level files.

## Initializer Skill

Generated project-initializer skills inspect project instructions, README files, docs maps, and major directories. They choose an appropriate available template from project evidence, ask when materially ambiguous, and pass the selected name explicitly to `dotdotgod init`.

When evidence is insufficient, the skill leaves selection to the global default and then `software`. It reports its selection and reason.

## POSIX Fallback

The CLI-independent POSIX fallback packages all built-in templates and accepts `--template NAME` for those templates. It does not parse global settings or custom templates. Custom selection requires the CLI and must not silently fall back to `software`.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/config/templates.mjs](../../packages/cli/src/config/templates.mjs)
  - [packages/cli/src/commands/config.mjs](../../packages/cli/src/commands/config.mjs)
  - [packages/cli/src/init.mjs](../../packages/cli/src/init.mjs)
  - [packages/shared/initializer/scripts/init_project.sh](../../packages/shared/initializer/scripts/init_project.sh)
  - [packages/shared/workflows/init.md](../../packages/shared/workflows/init.md)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/CONFIG_TEMPLATES.md](../test/CONFIG_TEMPLATES.md)
- Related docs:
  - [docs/spec/CONFIG_COMMAND.md](CONFIG_COMMAND.md)
  - [docs/spec/PROJECT_INITIALIZER.md](PROJECT_INITIALIZER.md)
  - [docs/arch/CONFIG_TEMPLATE_ARCHITECTURE.md](../arch/CONFIG_TEMPLATE_ARCHITECTURE.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/cli test`
  - `pnpm run verify:generated`
  - `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/config/templates.mjs","packages/cli/src/commands/config.mjs","packages/cli/src/init.mjs","packages/shared/initializer/scripts/init_project.sh","packages/shared/workflows/init.md","scripts/generate-adapters.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/CONFIG_TEMPLATES.md"],"relatedDocs":["docs/spec/CONFIG_COMMAND.md","docs/spec/PROJECT_INITIALIZER.md","docs/arch/CONFIG_TEMPLATE_ARCHITECTURE.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","pnpm run verify:generated","node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"]}
```
