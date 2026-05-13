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
- The planning prompt includes React Native / TypeScript project conventions.
- Active plan tasks are managed as kebab-case directories under `docs/plan/<task-slug>/` for projects initialized with `project-initializer`.
- Under `docs/`, all directories use kebab-case and all markdown file names use UPPER_SNAKE_CASE, including `README.md`.
- Each task directory keeps its overview and index in `README.md`; supporting plan files such as `RESEARCH_NOTES.md` or `VERIFICATION.md` live alongside it.
- Completed task directories should be moved to `docs/archive/<task-slug>/` after execution and verification.
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
6. The agent should write a numbered plan in the task `README.md` and final response with this format:

```md
Plan:
1. Target files and rationale
2. Implementation steps
3. Verification method
```

7. Choose `Execute the plan` in the UI to switch into implementation mode.
8. During execution, the agent marks completed steps with `[DONE:n]` tags.
9. After implementation and verification, the agent moves the completed task directory to `docs/archive/<task-slug>/`.
10. Use `/todos` to inspect progress.

## Plan Mode Restrictions

Allowed:

- File/code reading: `read`, `grep`, `find`, `ls`
- Plan/archive markdown updates under `docs/plan/` and `docs/archive/`: `edit`, `write`
- Directory names under `docs/` must be kebab-case; markdown file names must be UPPER_SNAKE_CASE.md
- Read-only bash commands: `rg`, `git status`, `git diff`, `yarn info`, `npm view`, etc.
- Web/document research: `web_search`, `code_search`, `fetch_content`, `get_search_content`

Blocked:

- `edit`, `write` outside `docs/plan/` and `docs/archive/`
- `rm`, `mv`, `cp`, `mkdir`, `touch`
- `git add`, `git commit`, `git push`, `git reset`, etc.
- `npm install`, `yarn add`, `pnpm add`, etc.
- `sudo`, `kill`, editor launches, etc.
