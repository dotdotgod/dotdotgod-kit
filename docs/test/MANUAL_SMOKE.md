# Manual Smoke Tests

## Pi Adapter

Install locally:

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
```

Load aliases:

```text
/load
/dd:load
```

Check that the loader prompt includes a compact `Load snapshot:` section with cache status, refresh metadata, graph counts, bounded memory-area/community summaries, and `fullGraphIncluded=false`. `docs/archive/README.md` should remain visible as the archive map; other archive bodies should stay out of the prompt. Temporarily remove the CLI from `PATH` to verify the lightweight fallback.

## Plan Mode

1. Run `/plan`.
2. Ask the agent to write or update `docs/plan/<task-slug>/README.md`.
3. Confirm Pi asks `Execute the plan / Stay in plan mode / Refine the plan` without rendering the full plan markdown.
4. Confirm explanatory replies that do not touch `docs/plan/` do not show the action prompt or extract todos.
5. Confirm no persistent `[plan-todo-list]` widget appears; `/todos` shows progress on demand.
6. Confirm constrained housekeeping is allowed only under local memory, for example `mkdir -p docs/archive/plan` or `mv docs/plan/<task-slug> docs/archive/plan/<task-slug>`.
7. Confirm source/config mutation remains blocked, for example `rm package.json` or `mv packages/pi docs/archive/plan/pi`.
8. In a high-context session, confirm compaction is checked after the first planning request, not immediately when `/plan` is enabled.
9. Confirm planning compaction preserves current work, active/touched plan paths, todos, verification, pending load state, and `[DONE:n]` markers.
10. With the CLI available, confirm first-turn context shaping adds validation, snapshot, and graph impact; without the CLI, Plan Mode continues.
11. Confirm a queued project-memory load flushes after the active prompt without `Agent is already processing a prompt` errors.
12. Confirm later planning turns do not automatically repeat load/compaction decisions.
13. Confirm the first active planning turn receives the full hidden prompt, later turns receive the compact reminder, and both keep source/config mutation blocked.
14. Confirm `--plan-extra-tools ctx_search,ctx_execute_file` adds only installed extra tools and the prompt renders the resolved tool list without contradicting allowed plan/archive markdown updates.
15. In `/plan`, create a plan, choose execute, and confirm the follow-up names the active plan path.
16. With extracted todos, confirm execution context includes `Active plan: docs/plan/<task-slug>/README.md`; after resume or planning compaction, `Current work focus:` preserves that path.

## Claude Code Adapter

Run locally:

```bash
claude --plugin-dir /Users/dotdot/Workspace/dotdotgod/packages/claude-code
```

Confirm these commands are discoverable or invokable:

```text
/dd:load
/dd:plan
/dd:init
```

For `/dd:load`, generated guidance should prefer `dotdotgod load-snapshot <root> --json`, treat the snapshot as the first-pass project-memory map, keep `docs/archive/README.md` as the archive map, and fall back to README-index reads when the CLI is unavailable.

## Codex Adapter

Install or add `/Users/dotdot/Workspace/dotdotgod/packages/codex` with the current local plugin workflow.

Confirm `project-load`, `doc-first-planning`, and `project-initializer` skills are discoverable. Trigger phrases `dd:load`, `dd:plan`, and `dd:init` should activate the expected workflows. For `dd:load`, use the same snapshot/archive/fallback expectations as Claude Code.

## Cross-Agent Planning Parity

- Claude Code `/dd:plan` and `doc-first-planning` guidance mention the written plan file as the durable review artifact and do not reference saved-plan preview UI.
- Codex `doc-first-planning` guidance has the same planning workflow, archive housekeeping, and package-manager-aware verification guidance.
- `pnpm run verify:generated` confirms generated resources match `packages/shared/workflows/plan.md`.

## Initializer Parity

```bash
sh packages/pi/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
sh packages/claude-code/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
sh packages/codex/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
```

## Published Pi Adapter Install

```bash
pi install npm:@dotdotgod/pi
pi uninstall npm:@dotdotgod/pi
```

The first public `0.1.0` publish confirmed install and uninstall worked.

## README Landing Review

Root and package READMEs should lead with dotdotgod value and avoid implying Pi-style runtime enforcement for Claude Code or Codex adapters.
