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

Distribution metadata:

- `publishConfig.access` is `public`.
- `pack:dry-run` runs `pnpm pack --dry-run --json`.
- Keywords cover Pi packages, agent memory, documentation, skills, extensions, Plan Mode, and project/context loading.
- Tarballs contain `skills/`, `extensions/`, package metadata, and license files.
- Pi peer dependencies remain unbundled and are resolved by the host Pi installation.

## Resource Responsibilities

### `project-initializer` Skill

The initializer skill describes a safe setup workflow and delegates deterministic file creation to a bundled POSIX shell script.

The script owns scaffold generation, overwrite policy, dry-run reporting, and optional dotdot setting generation.

### `plan-mode` Extension

`plan-mode` owns runtime planning behavior:

- Entry points: `/plan`, `/todos`, and `Ctrl+Alt+P`.
- Tooling: planning/execution tool switching, optional `--plan-extra-tools`, plan/archive markdown write filters, read-only bash allowlist, auto-allowed bounded dotdotgod context/status commands, and one-command approval for other agent-requested dotdotgod CLI commands.
- State: mode flags, todos, active plan README, touched plan/archive paths, latest planning request, first-request context shaping, queued planning-load delivery, compaction debounce, and CLI planning-context summary with advisory impact results for likely target files.
- UX: concise execute/stay/refine review prompt after active plan updates, without saved-plan preview rendering.
- Context shaping: one-time planning-focused compaction/load decisions after the first planning request, plus optional validation, bounded load-snapshot refresh, and bounded multi-file `graph impact --compact --json` summaries when the CLI is available.
- Prompts: first-turn full safety/workflow prompt, later compact reminder, resolved active tool list, and current-work-directed compaction instructions that demote stale history and repeated boilerplate.

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

The shared CLI owns deterministic validation, cache/index management, bounded graph impact reports, community summaries, and environment-aware command guidance. The load extension includes compact CLI snapshot metadata in `/dd:load` without turning project loading into a full graph dump. It preserves `docs/archive/README.md` as the archive map while keeping archive bodies excluded by default.

## Prompt Layer

Extension prompts act as runtime safety and workflow layers.

They may repeat a small amount of `AGENTS.md` workflow guidance because project docs are user-editable and may be missing or customized.

Plan Mode prompts must match runtime permissions: source/code/config mutation is forbidden, plan/archive markdown updates are allowed, and optional external tools appear only when active.

Prompt content should:

- enforce runtime restrictions where needed
- point the agent to `AGENTS.md`, `docs/README.md`, and relevant docs indexes
- stay generic across project types
- avoid project-specific stack or folder assumptions

## State and Persistence

`plan-mode` persists custom session entries for mode state, todos, review-prompt eligibility, prompt tier, active plan path, touched plan/archive paths, latest planning request, queued load state, compaction measurements, and one-time CLI context-check state.

## Future Search Architecture

Future memory search features should extend the runtime `load-project` entrypoint.

Potential additions:

- `/dd:index`
- `/dd:search`
- `/dd:status`
- vector index over project docs
- graph search over entities and relationships
- LLM-callable `dd_search` tools

The initializer should remain a conservative scaffold generator.
