# Shared Agent Docs

Use `AGENTS.md` as the canonical shared instruction file.

## Naming

- `AGENTS.md`: preferred shared file name. OpenAI Codex recognizes this convention, and the community `agents.md` convention uses the plural form.
- `CLAUDE.md`: Claude Code's project memory file. Keep it thin and import `AGENTS.md` with `@AGENTS.md`.
- `CODEX.md`: project-local Codex pointer. Keep it thin and link to `AGENTS.md`.
- `.github/copilot-instructions.md`: optional Copilot surface. If present, route to `AGENTS.md`, `docs/README.md`, and project commands instead of copying the full rules body.
- `.cursor/rules/*.md`: optional Cursor path-scoped rules. If present, keep Cursor-specific scoping there and route durable project rules to shared docs.
- `llms.txt`: optional documentation discovery surface. If present, point to README indexes and bounded docs entrypoints instead of embedding large docs bodies.
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

Do not duplicate the same body in `CLAUDE.md`, `CODEX.md`, Copilot instructions, Cursor rules, or llms discovery surfaces; duplication causes drift.

## Focused Behavior Contracts

Use focused behavior contracts for user-visible rules that need clear implementation and verification links.

Good focused contracts:

- describe current behavior, not change history
- stay small enough for agents to load and reason about directly
- connect to implementation files, tests, related docs, and verification commands with a final fenced `json dotdotgod` traceability block when the project uses dotdotgod validation
- split large product areas into `docs/spec/<domain>/README.md` plus focused UPPER_SNAKE_CASE spec files

Traceability helps agents find related code and checks. It is not a semantic proof that tests cover every edge case.
