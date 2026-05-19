# Pi Adapter Smoke Tests

## Install And Load

Install locally:

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
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
3. Confirm Pi asks `Execute the plan / Stay in plan mode / Refine the plan` without rendering the full plan markdown.
4. Confirm explanatory replies that do not touch `docs/plan/` do not show the action prompt or extract todos.
5. Confirm no persistent `[plan-todo-list]` widget appears; `/todos` shows progress on demand.
6. Confirm constrained housekeeping is allowed only under local memory.
7. Confirm source/config mutation remains blocked.
8. Confirm high-context compaction is checked after the first planning request, not immediately when `/plan` is enabled.
9. Confirm planning compaction preserves current work, active/touched plan paths, todos, verification, pending load state, and `[DONE:n]` markers.
10. With the CLI available, confirm first-turn context shaping adds validation, snapshot, and graph impact; without the CLI, Plan Mode continues.
11. Confirm bounded dotdotgod context/status commands are allowed while `init`, `config init`, shell chaining, redirects, pipes, command substitution, and package-runner wrappers remain blocked or require approval.
12. Confirm a queued project-memory load flushes after the active prompt without `Agent is already processing a prompt` errors.
13. Confirm later planning turns do not automatically repeat load/compaction decisions.
14. Confirm first-turn and later-turn hidden prompts use full and compact forms respectively while source/config mutation stays blocked.
15. Confirm `--plan-extra-tools ctx_search,ctx_execute_file` adds only installed tools and renders the resolved tool list.
16. In `/plan`, create a plan, choose execute, and confirm the follow-up names the active plan path.
17. With extracted todos, confirm execution context includes the active plan path and compaction preserves it.
18. Ask to execute an existing active plan path and confirm execution starts even if the plan was not edited in that turn.
19. Confirm advisory questions remain lightweight and implementation-looking requests become durable plans first.
20. Start without baseline docs or with only one docs area preserved, then confirm curated project-memory load is queued.
21. Confirm implementation plans include a step to run `dotdotgod graph impact` for intended changed files before source changes.

## Pending Impact Checks

1. In execution or normal mode, make a source/config edit.
2. Confirm the impact status/widget appears and hidden context reminds the agent to run `/impact-check` or `dotdotgod_graph_impact`.
3. Confirm `/impact-check` runs `dotdotgod graph impact --yml` for pending files and clears the status/widget after success.
4. With pending impact checks, confirm `git commit`, `git push`, and package publish commands are blocked.
5. Confirm successful manual `dotdotgod graph impact ... --changed <path>` clears the matching pending file.
6. After modification or coding work, confirm execution guidance requires `dotdotgod validate` before final completion.
