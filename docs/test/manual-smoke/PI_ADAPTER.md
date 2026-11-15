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

`/dd:load` without args must produce a compressed depth-5 map without query results or automatic compact wrapping. `/dd:load project memory` uses depth 3 plus at most 30 Markdown results. Plan/archive bodies stay excluded; README maps remain routing entrypoints. Remove global CLI from `PATH`: package-local CLI must precede README-only fallback.

## Packaged CLI

1. Install `@dotdotgod/pi` into a clean Pi package environment without separately installing `@dotdotgod/cli`.
2. Confirm `/dd:load` can run `dotdotgod query` for focused loads and Plan Mode context shaping can run validation and graph-impact commands through the package-local CLI dependency when no global CLI is on `PATH`.
3. Confirm no custom manager tool or `/dd:plan-child` command is registered; managed children use existing native `bash` hc commands.

## Plan Mode

Check `pi --help`: dotdotgod adds `--dd-plan`, not `--plan`. `pi --dd-plan` starts planning. With plannotator installed, its `--plan` coexists without conflicts; preserve both extensions' startup behavior.

1. Run `/dd:plan`.
2. Ask the agent to write or update `docs/plan/<task-slug>/README.md`.
3. From normal mode, run `/dd:plan add inline request support` and confirm Plan Mode is enabled before the request is handled.
4. While still in Plan Mode, run `/dd:plan refine this plan` and confirm it sends a planning request without disabling Plan Mode and without opening `Which active plan should be executed?`, even when active plans already exist or the turn updates `docs/plan/` markdown.
5. Run `/dd:plan` without args and confirm it still toggles Plan Mode off. Confirm `/plan` and `/todos` are absent from command discovery and are not compatibility aliases.
6. With no unresolved `Discussion Queue`, confirm full-page saved-plan review precedes execution. Test scrolling, action navigation (`←`/`→`, `Tab`, `Enter`), execute/stay/refine/cancel shortcuts, and iTerm2 wheel behavior.
7. Run the [Plan Decision Wizard smoke tests](PLAN_DECISION_WIZARD.md): sequential choices/custom answers, Back/Next drafts, editable batch summary, native editor IME/paste, and cancellation.
8. Confirm exactly one batch follow-up updates the plan before separate execution approval. New unresolved questions reopen the wizard; required deferred items remain blocking.
9. Verify equivalent fallback, noninteractive safety, duplicate IDs, and stale-result rejection using the focused wizard smoke tests.
12. While active plans exist, ask to design or create a plan from scratch with phrasing such as `설계부터 진행하자` or `계획을 만들어보자`; confirm Pi does not open `Which active plan should be executed?`. Then ask to execute a named existing plan and confirm the chooser/review path still works.
15. Trigger explicit execution review and choose stay/refine/cancel; confirm the same plan execution UI does not appear a second time at agent end.
16. Resize narrow/short terminals with long Korean content. Wizard wrapping, PgUp/PgDn and all keyboard actions must work; saved-plan review stays unchanged.
17. Confirm explanatory replies that do not touch `docs/plan/` do not show the action prompt or extract todos.
18. Confirm no persistent `[plan-todo-list]` widget or dedicated todo command appears; extracted todo state remains available to review and execution flows.
19. Verify external cwd reads; default-root Markdown writes succeed, while extra eligible targets require exact once/session approval. Check deny precedence and symlink escape rejection. Shell moves/deletions require execution mode everywhere.
20. Block source/config, host instruction Markdown and implementation writes; these are trusted workflow guards, not an OS sandbox.
21. Confirm high context usage does not cause Plan Mode to request compaction; Pi's own compaction settings remain unchanged.
22. Submit request B immediately after request A; confirm advisory context uses B without a synthetic compaction-resume message or replay of A. Restore an old compaction snapshot and confirm planning is not blocked.
23. With the CLI available, confirm first-turn context shaping adds bounded graph impact and reference expansion without running validate; without the CLI, Plan Mode continues.
24. Confirm bounded dotdotgod context/status commands are allowed. Unknown simple inspection commands offer deny/once/session; cancellation/headless denies. `init`, `config init`, chaining, redirects, pipes, substitutions and package-runner wrappers remain blocked.
25. Automatic load preserves initial text/images and injects only hidden `project-memory-context` (`display: false`), not user markers. After scheduling, `project_memory_load` succeeds with focused context; planning resumes once. Empty focus uses depth five. Plan Mode owns no load framing/classification.
26. Confirm later planning turns do not automatically repeat the one-shot planning advisory context refresh; global project-memory assessment remains independently owned.
27. Confirm first-turn and later-turn hidden prompts use full and compact forms respectively while source/config mutation stays blocked.
28. Confirm `pi --dd-plan --plan-extra-tools ctx_search,ctx_execute_file` adds only installed tools and renders the resolved tool list.
29. Choose execute with and without extracted todos; confirm normal tools, execution guidance, and a queued follow-up naming the plan path.
30. With extracted todos, confirm execution context includes the active plan path.
31. Ask to execute an existing active plan path and confirm the queue-first review flow opens even if the plan was not edited in that turn; choose execute after the queue is clear and confirm execution starts through an explicitly queued follow-up.
32. With multiple plans and none selected, `진행하자`, advisory questions, and `run tests` must not open the execution chooser. An explicit `실행하자` or named plan execution request must resolve the target before review.
33. Confirm advisory questions remain lightweight and implementation-looking requests become durable plans first.
34. Start without baseline docs in ordinary mode and `pi --dd-plan`. Confirm global state persists, the initial input remains unchanged, the read-only load tool is lifecycle-gated to the hidden instruction, and the original task resumes once.
35. Plans require `dotdotgod graph impact` for intended files before source edits.

## Policy and Child Acceptance

Not live-run evidence; record hc/Pi results. Follow [policy settings](../../spec/PLAN_MODE_TOOL_SETTINGS.md) and [tool policy](../../spec/plan-mode/TOOL_POLICY.md).

1. No `/dd:plan-policy`, `/dd:plan-child` or general policy editor. Eligible command approval supports five scopes; existing `planMode` config remains manually edited. In-context activation binds its exact project revision separately from individual grants. Reject stale approvals; preserve unrelated settings. Invalid config blocks commands/writes, not reads.
2. Verify once consumption, session reuse, policy/root/environment/executable invalidation including A/B/A; explicit env/non-default shell once-only. Denied MCP batch runs nothing; context changes during later prompts invalidate earlier entries. Test unknown/nested tool guards.
3. `pi --dd-plan` overrides restored off/executing state. Through native `bash`, run `hc run --bg pi --dd-plan [task]` with and without a task. Require user approval, audited explicit plugin and authenticated readiness BEFORE task delivery. Missing/failed plugin, forged readiness or timeout: no task, scoped cleanup.
4. `hc send/wait/get/read/interrupt/kill/rm` require owned IDs; reject unrelated IDs. `hc ls` uses generic approval, not adoption. Parent narrowing/context change/reload/disconnect cancels pending calls and later delivery. Matching persistent rules work; environment mismatch stays unavailable. No inherited once/session grants or further delegation; permitted Markdown works.
5. Observe cleanup failures visibly. In-flight cancellation is best effort, not rollback/sandboxing. Ordinary plugin-less Pi is valid but unrestricted; readiness protects managed delivery, not all external input.
6. MCP `execute`/`execute_file` stateful hc must deny with native `bash` guidance; mixed batches run nothing. Ordinary safe reads remain unchanged.
7. Remote/templates/custom launch flags must report route scope limits, not universal hc restrictions. Record actual results, not assumed acceptance.

## Remembered Command Acceptance

Use isolated projects/user home. Verify five eligible scopes, restart/two-project matching, script/interpreter changes, deny/stale/batch/save failures, child isolation, native and user_bash admission, revocation and readable keyboard previews. Follow [policy settings](../../spec/PLAN_MODE_TOOL_SETTINGS.md); report actual host results separately from units.

## Pending Impact Checks

Follow [PI_IMPACT.md](PI_IMPACT.md) for pending-path, review and clearing scenarios.
