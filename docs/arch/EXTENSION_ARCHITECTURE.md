# Extension Architecture

## Package Shape

`@dotdotgod/pi` is a Pi package that exposes resources through the `pi` manifest in `package.json`.

```json
{
  "pi": {
    "skills": ["./skills"],
    "extensions": ["./extensions"],
    "prompts": []
  }
}
```

Pi core packages are peer dependencies and are not bundled into the tarball. `@dotdotgod/cli` and `pi-subagents` are runtime dependencies so npm/Pi installs fetch them automatically; pnpm's isolated node linker prevents `bundledDependencies`, so the published tarball declares dependencies rather than embedding `node_modules` bodies.

## Package Distribution Metadata

The npm package is published as `@dotdotgod/pi`.

Distribution metadata:

- `publishConfig.access` is `public`.
- `pack:dry-run` runs `pnpm pack --dry-run --json`.
- Keywords cover Pi packages, agent memory, documentation, skills, extensions, Plan Mode, and project/context loading.
- Tarballs contain dotdotgod-owned `skills/`, `extensions/`, package metadata, and license files; runtime dependency bodies are installed by the package manager from declared dependencies.
- Pi peer dependencies remain unbundled and are resolved by the host Pi installation.
- `@dotdotgod/cli` is a package dependency used by Pi extensions as a source-checkout, package-local, then global CLI fallback chain.
- `pi-subagents` is a pinned package dependency whose skill and prompts are resolved by the dotdotgod wrapper through Node package resolution. The wrapper defers duplicate tool detection until `session_start`; when a standalone `subagent` tool already exists it suppresses package-local tool, skill, and prompt resources, and when dotdotgod owns registration it exposes the dependency resources during `resources_discover`. This lets hoisted, package-local, and local development installs coexist with standalone `pi-subagents` without duplicate resource warnings or runtime action calls during extension loading.


## Resource Responsibilities

### Generated vs Hand-Authored Resources

Common workflow text for generated adapter skills comes from `packages/shared/workflows/` and `scripts/generate-adapters.mjs`; edit those sources, then run `pnpm run generate` and `pnpm run verify:generated`. Examples include generated `project-initializer`, `document-clarify`, load, plan, and impact skill bodies across adapters.

Pi runtime code under `packages/pi/extensions/**` is hand-authored and owns command registration, state, tool policy, and TUI/runtime behavior. Checked-in generated resources are package artifacts for local installs and npm tarballs; do not edit them directly except when intentionally repairing generator output. See [`CROSS_AGENT_ARCHITECTURE.md`](CROSS_AGENT_ARCHITECTURE.md) for cross-adapter ownership.

### `project-initializer` Skill

The initializer skill describes a safe setup workflow and delegates deterministic file creation to a bundled POSIX shell script.

The script owns scaffold generation, overwrite policy, dry-run reporting, and optional dotdot setting generation.

### `document-clarify` Skill and Plan Clarifier Subagent


### `plan-mode` Extension

`plan-mode` owns runtime planning behavior:

- Entry points: `/dd:plan`, `/dd:plan <request>`, and `Ctrl+Alt+P`.
- Runtime state: mode flags, internal todos, active plan README, touched plan/archive paths, latest planning request including pending inline `/dd:plan <request>` delivery, request-framing classification, and pending source/config impact-check records.
- Context shaping: first-request context checks, queued planning-load delivery, queued post-compaction request resume, compaction debounce, CLI planning-context summary, baseline-doc coverage checks, single-area-only context detection, optional validation, documentation-tree refresh, and bounded multi-file advisory graph impact checks when the CLI is available.
- Impact-check integration: structured `graph impact --yml` runtime summaries, short pending-impact reminders after source/config edits, pending-path plus git source/config union checks, and stale pending-record cleanup after successful checks.
- UX: queue-first Discussion Queue Console, then saved-plan execute/stay/refine/cancel review only after queue clearance. Explicit execution requests use the same queue-first review flow. Plan Mode suppresses review for generator-authored or actively generating plans, but it does not run generator stage validation. Generator status overlays restore the underlying Plan Mode status when cleared.
- Prompt ownership: first-turn safety/workflow prompt, compact reminder, per-request framing, active tool list, impact-plan refinement and project validation guidance, discussion-queue follow-ups that update durable plan markdown, and compaction instructions that demote stale history.

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

- `/load` compatibility command
- `/dd:load` namespaced full-load command and `/dd:load:compact` compact-load command
- complete shared Markdown discovery with configured plan/archive exclusions
- prefix-compressed tree rendering through depth 5 without focus or depth 3 with focus
- local `dotdotgod query` invocation for up to 30 focused multilingual E5 results
- lightweight detection of baseline memory files and narrative loader prompt generation
- command-conflict guidance for `/load`

The shared CLI owns deterministic validation, graph cache/index management, bounded graph-impact reports, and local multilingual documentation query. The load extension builds its tree directly from the filesystem and invokes CLI query only for focused arguments, without injecting graph statistics into the Load narrative. It preserves `docs/archive/README.md` as the archive routing map while keeping archive bodies excluded by default.

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

`plan-mode` persists custom session entries for mode state, todos, review-prompt eligibility, prompt tier, active plan path, touched plan/archive paths, latest planning request, pending inline planning request delivery, queued load state, queued post-compaction resume state, compaction measurements, one-time CLI context-check state, pending impact-check files, and recent completed impact-check records. Discussion-queue state is read from the active plan artifact instead of a sidecar or opaque session object; the custom UI returns structured choices and the agent follow-up updates the plan markdown as the durable source.


## Related Behavior and Verification

- Behavior specs: [`docs/spec/PLAN_MODE.md`](../spec/PLAN_MODE.md), [`docs/spec/plan-mode/README.md`](../spec/plan-mode/README.md), [`docs/spec/LOAD_PROJECT.md`](../spec/LOAD_PROJECT.md), and [`docs/spec/CROSS_AGENT_SUPPORT.md`](../spec/CROSS_AGENT_SUPPORT.md).
- Verification docs: [`docs/test/README.md`](../test/README.md), [`docs/test/manual-smoke/PI_ADAPTER.md`](../test/manual-smoke/PI_ADAPTER.md), and [`docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md`](../test/manual-smoke/CROSS_AGENT_ADAPTERS.md).

## Search Architecture

Focused Load arguments route through `dotdotgod query`, which maintains a separate local `Xenova/multilingual-e5-small` vector cache under `.dotdotgod/vectors/`. This flat exact-scan index is derived routing data, not project truth and not part of the deterministic relationship graph.

Potential future additions include explicit search/status commands, graph-entity search, or an LLM-callable search tool. They should reuse the current query contract only when the behavior is stable rather than adding speculative provider or index abstractions.

The initializer should remain a conservative scaffold generator.
