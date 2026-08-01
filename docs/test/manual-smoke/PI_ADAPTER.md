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

Run `/dd:load` without arguments and confirm the prompt contains a prefix-compressed documentation map through directory depth 5 without query results. Run `/dd:load project memory` and confirm it contains a depth-3 map plus at most 30 distinct Markdown-file results. `docs/plan/**` and `docs/archive/**` bodies should remain excluded by default while their README maps remain targeted routing entrypoints. Temporarily remove the global CLI from `PATH` to verify the package-local `@dotdotgod/cli` dependency is tried before README-only fallback.

## Packaged CLI And Subagents

1. Install `@dotdotgod/pi` into a clean Pi package environment without separately installing `@dotdotgod/cli` or `pi-subagents`.
2. Confirm `/dd:load` can run `dotdotgod query` for focused loads and Plan Mode context shaping can run validation and graph-impact commands through the package-local CLI dependency when no global CLI is on `PATH`.
3. Confirm the `subagent` tool is available.
4. Confirm builtin agents include `scout`, `researcher`, `planner`, `worker`, `reviewer`, `context-builder`, `oracle`, and `delegate`.
5. Confirm package agents include `dotdotgod.plan-doc-clarifier`, and inspect it to verify `defaultContext: fresh`, `inheritProjectContext: false`, and `inheritSkills: false`.
6. Run a simple read-only subagent task, such as listing available agents or asking `scout` to inspect one README.
7. Confirm the plan-doc clarifier can be launched with `context: "fresh"` and explicit `reads` containing one plan README, and that its prompt refuses broad project-memory reads unless explicitly named.
8. Confirm subagent prompts are discoverable if prompt templates are enabled in the active Pi runtime.
7. If standalone `pi-subagents` is also installed, confirm `@dotdotgod/pi` does not raise a duplicate `subagent` tool error, skill/prompt conflict warnings, or `Extension runtime not initialized` startup error, and leaves the existing standalone tool, skill, and prompts registered.

## Plan Mode

1. Run `/dd:plan`.
2. Ask the agent to write or update `docs/plan/<task-slug>/README.md`.
3. From normal mode, run `/dd:plan add inline request support` and confirm Plan Mode is enabled before the request is handled.
4. While still in Plan Mode, run `/dd:plan refine this plan` and confirm it sends a planning request without disabling Plan Mode and without opening `Which active plan should be executed?`, even when active plans already exist or the turn updates `docs/plan/` markdown.
5. Run `/dd:plan` without args and confirm it still toggles Plan Mode off. Confirm `/plan` and `/todos` are absent from command discovery and are not compatibility aliases.
6. Confirm Pi opens a full-page custom saved-plan review UI before execution can be selected when the plan has no unresolved `Discussion Queue`; test keyboard scrolling, action-bar navigation with `←`/`→`, `Tab`, and `Enter`, shortcut keys for execute/stay/refine/cancel, and in iTerm2 with wheel-to-terminal-scroll enabled observe whether the wheel scrolls review content, terminal scrollback, or neither.
7. Add a `## Discussion Queue` section with at least two unresolved items and confirm Pi opens the Discussion Queue Console before the saved-plan review UI. Confirm items appear FIFO, `←`/`→` or `Tab` changes options, `Enter` returns an answer, `a` opens custom answer entry, `d` opens a defer-rationale entry, `r` sends a bounded research follow-up, `p` requests plan revision, and `q`/Esc cancels back to planning.
8. Confirm unresolved queue items suppress execute/stay/refine/cancel until the plan queue is updated to resolved states, and then the normal saved-plan review UI appears unchanged.
9. Temporarily force the custom queue UI to throw or run in an environment without custom UI support and confirm fallback `select`/`editor` prompts show the first unresolved item without enabling unsafe execution.
12. While active plans exist, ask to design or create a plan from scratch with phrasing such as `설계부터 진행하자` or `계획을 만들어보자`; confirm Pi does not open `Which active plan should be executed?`. Then ask to execute a named existing plan and confirm the chooser/review path still works.
15. Trigger explicit execution review and choose stay/refine/cancel; confirm the same plan execution UI does not appear a second time at agent end.
16. In a narrow terminal, confirm the saved-plan review UI and queue console remain usable with truncated text, no rendered line wider than the terminal, and visible footer controls.
17. Confirm explanatory replies that do not touch `docs/plan/` do not show the action prompt or extract todos.
18. Confirm no persistent `[plan-todo-list]` widget or dedicated todo command appears; extracted todo state remains available to review, execution, and compaction flows.
19. Confirm constrained housekeeping is allowed only under local memory.
20. Confirm source/config mutation remains blocked.
21. Confirm high-context compaction is checked after the first planning request, not immediately when `/dd:plan` is enabled.
22. Confirm planning compaction preserves current work, active/touched plan paths, todos, verification, pending load state, and `[DONE:n]` markers.
23. With the CLI available, confirm first-turn context shaping adds validation, documentation query, and graph impact; without the CLI, Plan Mode continues.
24. Confirm bounded dotdotgod context/status commands are allowed while `init`, `config init`, shell chaining, redirects, pipes, command substitution, and package-runner wrappers remain blocked or require approval.
25. Confirm a queued project-memory load flushes after the active prompt without `Agent is already processing a prompt` or `Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.` errors.
26. Confirm later planning turns do not automatically repeat load/compaction decisions.
27. Confirm first-turn and later-turn hidden prompts use full and compact forms respectively while source/config mutation stays blocked.
28. Confirm `--plan-extra-tools ctx_search,ctx_execute_file` adds only installed tools and renders the resolved tool list.
29. In `/dd:plan`, create a plan, choose execute, and confirm the explicitly queued follow-up names the active plan path and does not raise an already-processing runtime error.
30. With extracted todos, confirm execution context includes the active plan path and compaction preserves it.
31. Ask to execute an existing active plan path and confirm the queue-first review flow opens even if the plan was not edited in that turn; choose execute after the queue is clear and confirm execution starts through an explicitly queued follow-up.
32. While multiple active plans exist and no current plan is selected, send a planning/proceed phrase such as `진행하자`, an advisory selector-policy request, and a non-plan command such as `run tests`; confirm Pi does not ask which active plan to execute. Then send an explicit plan execution request such as `실행하자` or mention a specific existing plan and confirm Pi asks or resolves the target before review.
33. Confirm advisory questions remain lightweight and implementation-looking requests become durable plans first.
34. Start without baseline docs or with only one docs area preserved, then confirm curated project-memory load is queued.
35. Confirm implementation plans include a step to run `dotdotgod graph impact` for intended changed files before source changes.

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
