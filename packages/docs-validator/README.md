# @dotdotgod/docs-validator

Zero-dependency CLI for validating dotdotgod documentation scaffolds.

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
