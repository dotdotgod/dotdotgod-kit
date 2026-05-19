# Pi Adapter Smoke Tests

## Install And Load

Install locally:

```bash
pi install /path/to/dotdotgod/packages/pi
```

Load aliases:

```text
/load
/dd:load
```

Confirm the loader prompt includes a compact `Load snapshot:` section with cache status, refresh metadata, graph counts, bounded memory-area/community summaries, and `fullGraphIncluded=false`. `docs/archive/README.md` should remain visible as the archive map; other archive bodies should stay out of the prompt. Temporarily remove the CLI from `PATH` to verify the lightweight fallback.

## Plan Mode

1. Run `/plan`.
2. Ask the agent to write or update `docs/plan/<task-slug>/README.md`.
3. From normal mode, run `/plan add inline request support` and confirm Plan Mode is enabled before the request is handled.
4. While still in Plan Mode, run `/plan refine this plan` and confirm it sends a planning request without disabling Plan Mode.
5. Run `/plan` without args and confirm it still toggles Plan Mode off.
6. Confirm Pi asks `Execute the plan / Stay in plan mode / Refine the plan` without rendering the full plan markdown.
7. Confirm explanatory replies that do not touch `docs/plan/` do not show the action prompt or extract todos.
8. Confirm no persistent `[plan-todo-list]` widget appears; `/todos` shows progress on demand.
9. Confirm constrained housekeeping is allowed only under local memory.
10. Confirm source/config mutation remains blocked.
11. Confirm high-context compaction is checked after the first planning request, not immediately when `/plan` is enabled.
12. Confirm planning compaction preserves current work, active/touched plan paths, todos, verification, pending load state, and `[DONE:n]` markers.
13. With the CLI available, confirm first-turn context shaping adds validation, snapshot, and graph impact; without the CLI, Plan Mode continues.
14. Confirm bounded dotdotgod context/status commands are allowed while `init`, `config init`, shell chaining, redirects, pipes, command substitution, and package-runner wrappers remain blocked or require approval.
15. Confirm a queued project-memory load flushes after the active prompt without `Agent is already processing a prompt` errors.
16. Confirm later planning turns do not automatically repeat load/compaction decisions.
17. Confirm first-turn and later-turn hidden prompts use full and compact forms respectively while source/config mutation stays blocked.
18. Confirm `--plan-extra-tools ctx_search,ctx_execute_file` adds only installed tools and renders the resolved tool list.
19. In `/plan`, create a plan, choose execute, and confirm the follow-up names the active plan path.
20. With extracted todos, confirm execution context includes the active plan path and compaction preserves it.
21. Ask to execute an existing active plan path and confirm execution starts even if the plan was not edited in that turn.
22. Confirm advisory questions remain lightweight and implementation-looking requests become durable plans first.
23. Start without baseline docs or with only one docs area preserved, then confirm curated project-memory load is queued.
24. Confirm implementation plans include a step to run `dotdotgod graph impact` for intended changed files before source changes.

## Pending Impact Checks

1. In execution or normal mode, make a source/config edit.
2. Confirm the impact status/widget appears and hidden context reminds the agent to run `/impact-check` or `dotdotgod_graph_impact`.
3. Confirm `/impact-check` runs `dotdotgod graph impact --yml` for pending files plus current git unstaged, staged, and untracked source/config files, then clears the status/widget after success.
4. Change a pending file again before impact and confirm a successful `/impact-check` clears the stale pending record for that path.
5. Stage a source/config file without an unstaged diff and confirm `/impact-check` includes it.
6. With pending impact checks, confirm `git commit`, `git push`, and package publish commands are blocked.
7. Confirm successful manual `dotdotgod graph impact ... --changed <path>` clears the matching pending file.
8. Run `dotdotgod_graph_impact` for enough paths to produce more than 10 lines, confirm the collapsed TUI result shows 10 lines plus `... (<n> more lines, ctrl+o to expand)` or the configured keybinding equivalent, then press `ctrl+o` and confirm the full output appears.
9. After modification or coding work, confirm execution guidance requires `dotdotgod validate` before final completion.
