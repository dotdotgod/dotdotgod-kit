# Plan Mode Extension

A customized planning mode for Pi. Source changes are blocked during planning, while markdown plan/archive files under `docs/plan/` and `docs/archive/` may be created or updated.

## Changes

- Plan progress uses the `/todos` command.
- Only the `Plan:` heading is parsed for step extraction.
- Plan mode can use `pi-web-access` tools when installed:
  - `web_search`
  - `code_search`
  - `fetch_content`
  - `get_search_content`
- The planning prompt stays generic across project types.
- If the session is long or noisy, Plan Mode automatically requests planning-focused compaction with `customInstructions` that preserve decisions, active plan status, relevant docs, verification results, risks, next steps, and `[DONE:n]` markers.
- Active plan tasks are managed as kebab-case directories under `docs/plan/<task-slug>/` for projects initialized with `project-initializer`.
- Under `docs/`, all directories use kebab-case and all markdown file names use UPPER_SNAKE_CASE, including `README.md`.
- Each task directory keeps its overview and index in `README.md`; supporting plan files such as `RESEARCH_NOTES.md` or `VERIFICATION.md` live alongside it.
- Plan mode does not render saved-plan file previews in the TUI; users review the durable markdown plan file when needed.
- Execute/stay/refine choices are shown after every active plan markdown file under `docs/plan/` is created or updated.
- When the latest planning request contains explicit `[[...]]` refs, Plan Mode adds bounded `dotdotgod expand` results to planning context before broad search.
- When the request contains high-signal natural refs such as `PLAN_MODE`, path-like mentions, or quoted doc names, Plan Mode may add bounded `dotdotgod expand --fuzzy` results before broad search; fuzzy low-signal suppression follows the resolved dotdotgod CLI config.
- Completed task directories should be moved to `docs/archive/plan/<task-slug>/` after execution and verification.
- Plans are encouraged to include target files, risks, and verification steps.

## Commands

- `/plan` - Toggle plan mode
- `/todos` - Show current plan progress
- `Ctrl+Alt+P` - Toggle plan mode

## Usage

1. Enable plan mode with `/plan`.
2. Ask the agent to analyze the task and create a plan.
3. The agent should create or update a focused kebab-case task directory under `docs/plan/<task-slug>/`.
4. The task overview, index, scope, and status belong in `docs/plan/<task-slug>/README.md`.
5. Supporting research, checklists, or verification notes can be added as UPPER_SNAKE_CASE markdown files in the same directory.
6. If the session is long or noisy, Plan Mode automatically compacts with planning-focused instructions before continuing.
7. After the agent creates or updates a plan file, Pi asks whether to execute, stay in plan mode, or refine the plan.
8. The agent should write concrete executable steps in the final `Plan:` section. Generic section labels such as `Target files and rationale`, `Implementation steps`, and `Verification method` are ignored for todo extraction.
9. Choose `Execute the plan` in the UI to switch into implementation mode.
10. During execution, the agent must mark every completed step in the same response with `[DONE:n]` tags.
11. After implementation and verification, the agent moves the completed task directory to `docs/archive/plan/<task-slug>/` and includes that step's `[DONE:n]` tag.
12. Use `/todos` to inspect progress.

## Plan Mode Restrictions

Allowed:

- File/code reading: `read`, `grep`, `find`, `ls`
- Plan/archive markdown updates under `docs/plan/` and `docs/archive/`: `edit`, `write`
- Directory names under `docs/` must be kebab-case; markdown file names must be UPPER_SNAKE_CASE.md
- Read-only bash commands: `rg`, `git status`, `git diff`, `yarn info`, `npm view`, etc.
- Bounded dotdotgod context/status commands: `dotdotgod --version`, `dotdotgod --help`, `dotdotgod status ...`, `dotdotgod load-snapshot ...`, `dotdotgod resolve ...`, `dotdotgod expand ...`, `dotdotgod graph impact ...`, `dotdotgod graph communities ...`, `dotdotgod config ...`, and `dotdotgod index ...`. The equivalent local source form `node /path/to/packages/cli/bin/dotdotgod.mjs ...` is also recognized for development installs.
- Plan/archive housekeeping bash commands when every affected path stays under `docs/plan/` or `docs/archive/`: `mkdir -p docs/archive/plan`, `mv docs/plan/<task-slug> docs/archive/plan/<task-slug>`, `rm -r docs/plan/<task-slug>`
- Web/document research: `web_search`, `code_search`, `fetch_content`, `get_search_content`

Blocked:

- `edit`, `write` outside `docs/plan/` and `docs/archive/`
- `rm`, `mv`, `cp`, `mkdir`, `touch` outside the constrained plan/archive housekeeping allowance
- `git add`, `git commit`, `git push`, `git reset`, etc.
- `npm install`, `yarn add`, `pnpm add`, etc.
- `sudo`, `kill`, editor launches, etc.
