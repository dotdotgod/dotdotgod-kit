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
- session state for plan mode, execution mode, todos, active plan-file touch tracking, touched plan/archive paths, latest planning request, pending first-request context shaping, and plan-compaction debounce metadata
- concise execute/stay/refine review prompt after active plan file updates, without saved-plan preview rendering
- one-time planning-focused `ctx.compact({ customInstructions })` and curated-load decisions after the first user planning request when a long or noisy session may hurt plan quality
- tiered hidden Plan Mode prompts: a full safety/workflow prompt for the first active planning turn and a compact restriction reminder for later turns
- current-work-directed compaction instructions that include the latest task focus before the durable preservation rules and explicitly demote stale history or repeated boilerplate

Plan mode injects runtime instructions because project docs can be edited by users. The prompt should stay generic and must not contain app-specific stack assumptions.

### Context Metrics Debug Utilities

The Pi adapter includes opt-in context metrics debug helpers used by `load-project` and `plan-mode`.

- `--dd-context-debug` enables local JSONL event recording.
- `--dd-context-debug-output <path>` sets the output file path.
- Default output is under `docs/archive/report/context-metrics/`, which is ignored by git.
- Events record timestamps, git state, `ctx.getContextUsage()` when available, `/dd:load` prompt metrics, Plan Mode state changes, and compaction callbacks.

The debug path is for measurement and investigation only; normal package behavior remains unchanged unless the flag is enabled.

### `load-project` Extension

`load-project` owns runtime project memory loading:

- `/load` command
- `/dd:load` namespaced alias
- direct `dotdotgod load-snapshot <cwd> --json` invocation when available
- lightweight detection of baseline memory files as a fallback and prompt scaffold
- read-only, snapshot-first loader prompt generation with compact directory summaries when the CLI snapshot is available
- command-conflict guidance for `/load`

The shared CLI owns deterministic validation, cache/index management, bounded graph impact reports, and community summaries. The load extension includes compact CLI snapshot metadata in `/dd:load` without turning project loading into a full graph dump. It preserves `docs/archive/README.md` as the archive map while keeping archive bodies excluded by default.

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
- active plan-file touch tracking for review-prompt eligibility
- pending first-request context shaping state
- Plan Mode full-prompt injection state for compact reminder selection
- latest planning request and touched plan/archive paths for current-work compaction focus
- last planning compaction entry count/reason for measurement and resume continuity

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
