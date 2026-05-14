# @dotdotgod/docs-validator

Zero-dependency CLI for validating dotdotgod documentation scaffolds. It keeps AI-agent project memory usable by checking the docs structure agents depend on: README indexes, local links, heading anchors, plan/archive shapes, and naming rules.

## Why Use It?

- Catch broken local docs links before agents follow stale context.
- Keep `docs/spec`, `docs/test`, `docs/arch`, `docs/plan`, and `docs/archive` predictable.
- Enforce the same local-memory conventions used by Pi, Claude Code, and Codex adapters.
- Validate ignored local memory during development with `--include-local-memory`.

## Usage

```bash
npx @dotdotgod/docs-validator .
```

Local workspace usage:

```bash
node packages/docs-validator/bin/dd-docs-validate.mjs . --include-local-memory
```

## Rules

- `docs/` directories use kebab-case.
- Markdown files use UPPER_SNAKE_CASE or `README.md`.
- Markdown files stay within configurable line/character budgets.
- Directories with multiple markdown files include `README.md`.
- Local markdown links point to existing files.
- Local markdown anchors point to existing headings.
- `docs/plan`, `docs/archive/plan`, and `docs/archive/report` use expected task/report shapes.
- `.gitignore` contains `docs/plan` and `docs/archive`.

## Options

```text
dd-docs-validate <root> [--include-local-memory] [--max-lines n] [--max-chars n] [--no-link-check] [--json]
```
