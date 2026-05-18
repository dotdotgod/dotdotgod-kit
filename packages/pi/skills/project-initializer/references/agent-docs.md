# Shared Agent Docs

Use `AGENTS.md` as the canonical shared instruction file.

## Naming

- `AGENTS.md`: preferred shared file name. OpenAI Codex recognizes this convention, and the community `agents.md` convention uses the plural form.
- `CLAUDE.md`: Claude Code's project memory file. Keep it thin and import `AGENTS.md` with `@AGENTS.md`.
- `CODEX.md`: project-local Codex pointer. Keep it thin and link to `AGENTS.md`.
- `AGENT.md`: avoid for new projects unless an existing tool in the repo requires it.

## Content Model

Put durable, project-wide instructions in `AGENTS.md`:

- project purpose and stack
- install, test, run, and lint commands
- architecture and ownership notes
- documentation map
- coding and review expectations
- environment constraints

For projects using the dotdotgod CLI, `dotdotgod validate` is the enforcement point for machine-readable docs rules such as fenced `json dotdotgod` traceability blocks in behavior specs. Keep the detailed schema in the CLI and its validation errors.

Do not duplicate the same body in `CLAUDE.md` and `CODEX.md`; duplication causes drift.
