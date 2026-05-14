# Extension Architecture

## Package Shape

`@dotdotgod/pi` is a Pi package that exposes resources through the `pi` manifest in `package.json`.

```json
{
  "pi": {
    "skills": ["./skills"],
    "extensions": ["./extensions"]
  }
}
```

Pi core packages are peer dependencies and are not bundled into the tarball.

## Package Distribution Metadata

The npm package is published as `@dotdotgod/pi`.

Distribution metadata is intentionally explicit:

- `publishConfig.access` is `public`.
- `pack:dry-run` runs `pnpm pack --dry-run --json` for package verification.
- Keywords cover Pi packages, agent memory, documentation, skills, extensions, plan mode, and project/context loading.
- The tarball should contain package resources under `skills/` and `extensions/`, plus package metadata and license files.
- Pi peer dependencies remain unbundled and are resolved by the host Pi installation.

## Resource Responsibilities

### `project-initializer` Skill

The initializer skill describes a safe setup workflow and delegates deterministic file creation to a bundled POSIX shell script.

The script owns scaffold generation, overwrite policy, dry-run reporting, and optional dotdot setting generation.

### `plan-mode` Extension

`plan-mode` owns runtime planning behavior:

- `/plan` command
- `/todos` command
- `Ctrl+Alt+P` shortcut
- active tool selection for planning/execution
- write/edit filtering for plan/archive markdown files
- read-only bash allowlist enforcement
- session state for plan mode, execution mode, todos, and active plan-file touch tracking
- concise execute/stay/refine review prompt after active plan file updates, without saved-plan preview rendering
- planning-focused `/compact <instructions>` suggestions when a long or noisy session may hurt plan quality

Plan mode injects runtime instructions because project docs can be edited by users. The prompt should stay generic and must not contain app-specific stack assumptions.

### `load-project` Extension

`load-project` owns runtime project memory loading:

- `/load` command
- `/dd:load` namespaced alias
- lightweight detection of baseline memory files
- read-only loader prompt generation
- command-conflict guidance for `/load`

The extension is intentionally thin today, but it is the planned runtime entrypoint for future memory indexing, vector search, graph search, and LLM-callable project-memory tools.

## Prompt Layer

Extension prompts act as runtime safety and workflow layers.

They may repeat a small amount of docs workflow guidance from `AGENTS.md` because project docs are user-editable and may be missing or customized.

Prompt content should:

- enforce runtime restrictions where needed
- point the agent to `AGENTS.md`, `docs/README.md`, and relevant docs indexes
- stay generic across project types
- avoid project-specific stack or folder assumptions

## State and Persistence

`plan-mode` persists state through custom session entries:

- enabled/disabled plan mode
- todo items
- execution mode
- last shown plan preview metadata

The saved plan preview uses content hash and mtime metadata to avoid repeating the same preview.

## Future Search Architecture

Future memory search features should extend `load-project` rather than the initializer skill.

Potential additions:

- `/dd:index`
- `/dd:search`
- `/dd:status`
- vector index over project docs
- graph search over entities and relationships
- LLM-callable `dd_search` tools

The initializer should remain a conservative scaffold generator.
