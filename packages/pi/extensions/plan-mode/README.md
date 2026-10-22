# Plan Mode Extension

A customized planning mode for Pi. Source changes are blocked during planning, while markdown plan/archive files under `docs/plan/` and `docs/archive/` may be created or updated.

## Changes

- `pi --dd-plan` starts Pi with dotdotgod Plan Mode enabled without claiming the generic `--plan` flag.
- `/dd:plan <request>` enables Plan Mode if needed and queues the request as the first or next planning turn with explicit follow-up delivery; `/dd:plan <docs/plan/<task>/README.md>` loads an existing plan and its internal todo state; `/dd:plan` without args still toggles.
- Plan Mode controllers own lifecycle, plan artifacts, context shaping, review, execution flow and progress. Shared MCP owns impact review; durable advisory records are stored separately from plan snapshots.
- Only the `Plan:` heading is parsed for step extraction.
- Plan mode can use `pi-web-access` tools when installed:
  - `web_search`
  - `code_search`
  - `fetch_content`
  - `get_search_content`
- The planning prompt stays generic across project types.
- Each Plan Mode turn adds concise latest-request framing: advisory requests stay lightweight, implementation-looking requests become durable plans first, memory-load requests use the curated load flow, and explicit execution requests use the execution path.
- A separate mode-neutral project-memory extension assesses baseline coverage and, when needed, activates `project_memory_load` before substantive work in ordinary or Plan Mode. It calls MCP `project_load` while retaining compact UI and exactly-once completion. Plan Mode itself owns only planning-specific context shaping. Its first planning request refreshes bounded advisory impact/reference context without automatic project-wide validation. Compaction remains owned by Pi and its settings.
- Active plan tasks are managed as kebab-case directories under `docs/plan/<task-slug>/` for projects initialized with `project-initializer`.
- Under `docs/`, all directories use kebab-case and all markdown file names use UPPER_SNAKE_CASE, including `README.md`.
- Interactive Plan Mode checks the active plan README for unresolved `Discussion Queue` items before execution review. If queued user-discussion items remain, Pi opens the Plan Decision Wizard first and suppresses execute/stay/refine/cancel until the queue is resolved or the user returns to planning.
- The Plan Decision Wizard shows one question at a time with options and Other / custom answer. Back/Next preserves local drafts; an editable summary confirms all answers in one batch, without agent turns between questions. Cancel discards drafts. Required deferred decisions still block review. The agent records confirmed answers and updates the plan before separate execution approval; new questions reopen the wizard. Custom-UI fallback follows the same sequential/batch flow.
- After the discussion queue is clear, interactive Plan Mode opens a full-page custom saved-plan review UI before accepting execute/stay/refine/cancel actions, so review and action selection stay in one synchronous flow. The review UI includes a cursor-selectable action bar (`←`/`→`, `Tab`, `Enter`) in addition to `e`/`s`/`r`/`c` shortcuts, and truncates rendered lines to the active terminal width.
- Extension-generated planning, refinement, discussion-queue and execution-handoff user messages are sent with explicit `deliverAs: "followUp"` delivery so hook-time messages queue safely while the agent is active.
- Explicit in-Plan-Mode execution requests such as “run this plan” or “실행하자” open the same review UI immediately when a current or mentioned active plan can be resolved; ambiguous requests ask which active plan to execute. Planning, advisory, or non-plan commands such as “run tests” do not fall back to all active plans.
- When the latest planning request contains explicit `[[...]]` refs, Plan Mode adds bounded `dotdotgod expand` results to planning context before broad search.
- When the request contains high-signal natural refs such as `PLAN_MODE`, path-like mentions, or quoted doc names, Plan Mode may add bounded `dotdotgod expand --fuzzy` results before broad search; fuzzy low-signal suppression follows the resolved dotdotgod CLI config.
- Completed task directories should be moved to `docs/archive/plan/<task-slug>/` after execution and verification.
- Plans are encouraged to include target files, risks, verification steps, and an executable graph-impact refinement step before source changes.
- Successful observed edit/write results create session-local pending impact records. MCP success clears covered unchanged revisions; failure, cancellation and concurrent re-edits retain pending. Reminders never block tests, builds, commits or publishing. Shell/external changes need explicit review paths.

## Commands

- `pi --dd-plan` - Start Pi with dotdotgod Plan Mode enabled
- `/dd:plan` - Toggle plan mode
- `/dd:plan <request>` - Enable Plan Mode if needed and send `<request>` as a planning request without toggling off an active Plan Mode session
- `/dd:plan <path>` - Load an existing `docs/plan/<task>/README.md` or `docs/plan/<task>` as the active plan and restore its internal todo state
- `/impact-check` - Request shared MCP impact review of pending and git-changed source/config paths in batches of twenty
- `Ctrl+Alt+P` - Toggle plan mode

## Usage

1. Enable plan mode with `/dd:plan`, run `/dd:plan <request>` to enable Plan Mode and send the first planning request in one command, or run `/dd:plan docs/plan/<task>/README.md` to load an existing plan.
2. Ask the agent to analyze the task and create a plan.
3. The agent should create or update a focused kebab-case task directory under `docs/plan/<task-slug>/`.
4. The task overview, index, scope, and status belong in `docs/plan/<task-slug>/README.md`.
5. Plan Mode refreshes focused advisory context; run explicit documentation validation when the work requires it.
6. If the plan contains unresolved `Discussion Queue` items, answer them in the decision wizard: `↑`/`↓` or Tab selects a control, Enter applies it, `←`/`→` goes Back/Next, and PgUp/PgDn scrolls long text. Other opens the native multiline editor. Review/edit all answers and choose Confirm answers, or Esc/Cancel to return to planning without submission.
7. After the queue is clear, or when no queue exists, Pi opens a full-page saved-plan review UI and asks whether to execute, stay in plan mode, refine the plan, or cancel; choose with the action bar or shortcut keys. Follow-up prompts generated from those choices are queued explicitly and should not raise already-processing runtime errors.
8. The agent should write concrete executable steps in the final `Plan:` section. Generic section labels such as `Target files and rationale`, `Implementation steps`, and `Verification method` are ignored for todo extraction.
9. Choose execute in the review UI to switch into implementation mode; if you later ask to execute a resolvable active plan, the same queue-first review flow opens immediately. If no plan is selected or mentioned, ordinary planning/advisory requests remain in Plan Mode instead of opening the active-plan execution chooser.
10. During execution, the agent must mark every completed step in the same response with `[DONE:n]` tags.
11. Before source changes for implementation tasks, run the plan's `dotdotgod graph impact` refinement step and update target files, risks, or verification if needed.
12. After source/config edits, run `/impact-check` or MCP `project_impact` and review related docs/tests/files before broad verification or commit. Pending reminders are advisory, not command gates.
13. After modification or coding work, run `dotdotgod validate` for the project before final completion.
14. After implementation and verification, the agent moves the completed task directory to `docs/archive/plan/<task-slug>/` and includes that step's `[DONE:n]` tag.

## Plan Mode Restrictions

Allowed:

- File/code reading: `read`, `grep`, `find`, `ls`
- Plan/archive markdown updates under `docs/plan/` and `docs/archive/`: `edit`, `write`
- Directory names under `docs/` must be kebab-case; markdown file names must be UPPER_SNAKE_CASE.md
- Read-only bash commands: `rg`, `git status`, `git diff`, `yarn info`, `npm view`, etc.
- Persistent impact widgets are disabled. Read-only MCP `impact_status` exposes bounded session records without reviewing or clearing them. Reminders remain advisory; planning/user permission checks remain independent.
- MCP `project_impact` reviews up to twenty paths per call. Successful reviews clear only covered unchanged revisions. No native impact/status wrapper or custom ten-line impact renderer remains; inspect the MCP envelope and host-rendered output.
- Web/document research: `web_search`, `code_search`, `fetch_content`, `get_search_content`

Blocked:

- Source/config edit and write; only Markdown planning documents are allowed, regardless of location
- Shell rm, mv, cp, mkdir and touch at any location, including plan/archive housekeeping
- `git add`, `git commit`, `git push`, `git reset`, etc.
- `npm install`, `yarn add`, `pnpm add`, etc.
- `sudo`, `kill`, editor launches, etc.
