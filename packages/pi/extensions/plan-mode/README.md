# Plan Mode Extension

A customized planning mode for Pi. Source changes are blocked during planning, while markdown plan/archive files under `docs/plan/` and `docs/archive/` may be created or updated.

## Changes

- `pi --dd-plan` starts Pi with dotdotgod Plan Mode enabled without claiming the generic `--plan` flag.
- `/dd:plan <request>` enables Plan Mode if needed and queues the request as the first or next planning turn with explicit follow-up delivery; `/dd:plan <docs/plan/<task>/README.md>` loads an existing plan and its internal todo state; `/dd:plan` without args still toggles.
- Plan Mode runtime state and orchestration are split into domain controllers for lifecycle, plan artifacts, context shaping, review gates, impact gates, execution flow, and execution progress.
- Only the `Plan:` heading is parsed for step extraction.
- Plan mode can use `pi-web-access` tools when installed:
  - `web_search`
  - `code_search`
  - `fetch_content`
  - `get_search_content`
- The planning prompt stays generic across project types.
- Each Plan Mode turn adds concise latest-request framing: advisory requests stay lightweight, implementation-looking requests become durable plans first, memory-load requests use the curated load flow, and explicit execution requests use the execution path.
- A separate mode-neutral project-memory extension assesses baseline coverage and, when needed, activates `dotdotgod_project_load` before substantive work in ordinary or Plan Mode. Plan Mode itself owns only planning-specific context shaping. Long or noisy sessions request planning-focused compaction with `customInstructions` that preserve decisions, active plan status, relevant docs, verification results, risks, next steps, and `[DONE:n]` markers.
- Active plan tasks are managed as kebab-case directories under `docs/plan/<task-slug>/` for projects initialized with `project-initializer`.
- Under `docs/`, all directories use kebab-case and all markdown file names use UPPER_SNAKE_CASE, including `README.md`.
- Interactive Plan Mode checks the active plan README for unresolved `Discussion Queue` items before execution review. If queued user-discussion items remain, Pi opens the Discussion Queue Console first and suppresses execute/stay/refine/cancel until the queue is resolved or the user returns to planning.
- The Discussion Queue Console shows queued items in FIFO order and lets users choose an option, enter a custom answer, defer, request research, request plan revision, or cancel. The plan file remains the durable source; the UI returns structured choices and the agent updates the markdown.
- After the discussion queue is clear, interactive Plan Mode opens a full-page custom saved-plan review UI before accepting execute/stay/refine/cancel actions, so review and action selection stay in one synchronous flow. The review UI includes a cursor-selectable action bar (`←`/`→`, `Tab`, `Enter`) in addition to `e`/`s`/`r`/`c` shortcuts, and truncates rendered lines to the active terminal width.
- Extension-generated planning, refinement, discussion-queue, compaction-resume, and execution-handoff user messages are sent with explicit `deliverAs: "followUp"` delivery so hook-time messages queue safely while the agent is active.
- Explicit in-Plan-Mode execution requests such as “run this plan” or “실행하자” open the same review UI immediately when a current or mentioned active plan can be resolved; ambiguous requests ask which active plan to execute. Planning, advisory, or non-plan commands such as “run tests” do not fall back to all active plans.
- When the latest planning request contains explicit `[[...]]` refs, Plan Mode adds bounded `dotdotgod expand` results to planning context before broad search.
- When the request contains high-signal natural refs such as `PLAN_MODE`, path-like mentions, or quoted doc names, Plan Mode may add bounded `dotdotgod expand --fuzzy` results before broad search; fuzzy low-signal suppression follows the resolved dotdotgod CLI config.
- Completed task directories should be moved to `docs/archive/plan/<task-slug>/` after execution and verification.
- Plans are encouraged to include target files, risks, verification steps, and an executable graph-impact refinement step before source changes.
- During execution and normal mode, successful source/config `edit` and `write` tool results create pending dotdotgod impact checks. Pi reminds the agent to run impact, exposes `/impact-check`, includes current git unstaged/staged/untracked source/config files, and blocks commit/push/publish bash commands until pending files are checked.

## Commands

- `pi --dd-plan` - Start Pi with dotdotgod Plan Mode enabled
- `/dd:plan` - Toggle plan mode
- `/dd:plan <request>` - Enable Plan Mode if needed and send `<request>` as a planning request without toggling off an active Plan Mode session
- `/dd:plan <path>` - Load an existing `docs/plan/<task>/README.md` or `docs/plan/<task>` as the active plan and restore its internal todo state
- `/impact-check` - Run `dotdotgod graph impact --yml` for pending source/config files plus current git unstaged, staged, and untracked source/config files
- `Ctrl+Alt+P` - Toggle plan mode

## Usage

1. Enable plan mode with `/dd:plan`, run `/dd:plan <request>` to enable Plan Mode and send the first planning request in one command, or run `/dd:plan docs/plan/<task>/README.md` to load an existing plan.
2. Ask the agent to analyze the task and create a plan.
3. The agent should create or update a focused kebab-case task directory under `docs/plan/<task-slug>/`.
4. The task overview, index, scope, and status belong in `docs/plan/<task-slug>/README.md`.
6. If the session is long or noisy, Plan Mode automatically compacts with planning-focused instructions before continuing.
7. If the plan contains unresolved `Discussion Queue` items, Pi opens the queue console before execution review; answer, defer, request research, request plan revision, or cancel back to planning.
8. After the queue is clear, or when no queue exists, Pi opens a full-page saved-plan review UI and asks whether to execute, stay in plan mode, refine the plan, or cancel; choose with the action bar or shortcut keys. Follow-up prompts generated from those choices are queued explicitly and should not raise already-processing runtime errors.
9. The agent should write concrete executable steps in the final `Plan:` section. Generic section labels such as `Target files and rationale`, `Implementation steps`, and `Verification method` are ignored for todo extraction.
10. Choose execute in the review UI to switch into implementation mode; if you later ask to execute a resolvable active plan, the same queue-first review flow opens immediately. If no plan is selected or mentioned, ordinary planning/advisory requests remain in Plan Mode instead of opening the active-plan execution chooser.
11. During execution, the agent must mark every completed step in the same response with `[DONE:n]` tags.
12. Before source changes for implementation tasks, run the plan's `dotdotgod graph impact` refinement step and update target files, risks, or verification if needed.
13. After source/config edits, run `/impact-check` or the `dotdotgod_graph_impact` tool and review related docs/tests/files before broad verification or commit.
14. After modification or coding work, run `dotdotgod validate` for the project before final completion.
15. After implementation and verification, the agent moves the completed task directory to `docs/archive/plan/<task-slug>/` and includes that step's `[DONE:n]` tag.

## Plan Mode Restrictions

Allowed:

- File/code reading: `read`, `grep`, `find`, `ls`
- Plan/archive markdown updates under `docs/plan/` and `docs/archive/`: `edit`, `write`
- Directory names under `docs/` must be kebab-case; markdown file names must be UPPER_SNAKE_CASE.md
- Read-only bash commands: `rg`, `git status`, `git diff`, `yarn info`, `npm view`, etc.
- `dotdotgod_graph_impact` is available as an LLM-callable tool for changed-file impact checks and returns structured YML summaries by default. In the Pi TUI, outputs longer than 10 lines collapse to the first 10 lines with a remaining-line count and expand via the tool-output keybinding.
- Plan/archive housekeeping bash commands when every affected path stays under `docs/plan/` or `docs/archive/`: `mkdir -p docs/archive/plan`, `mv docs/plan/<task-slug> docs/archive/plan/<task-slug>`, `rm -r docs/plan/<task-slug>`
- Web/document research: `web_search`, `code_search`, `fetch_content`, `get_search_content`

Blocked:

- `edit`, `write` outside `docs/plan/` and `docs/archive/`
- `rm`, `mv`, `cp`, `mkdir`, `touch` outside the constrained plan/archive housekeeping allowance
- `git add`, `git commit`, `git push`, `git reset`, etc.
- `npm install`, `yarn add`, `pnpm add`, etc.
- `sudo`, `kill`, editor launches, etc.
