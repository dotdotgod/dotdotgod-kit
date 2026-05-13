# Validation Architecture

## Purpose

This document defines the validation strategy for the dotdotgod workspace.

## Packages

### `@dotdotgod/docs-validator`

Zero-dependency Node CLI for validating dotdotgod documentation scaffolds.

CLI binary:

```bash
dd-docs-validate <root>
```

Local workspace command:

```bash
node packages/docs-validator/bin/dd-docs-validate.mjs . --include-local-memory
```

## Rule Boundaries

The validator owns dotdotgod-specific structure checks:

- `docs/` directory names are kebab-case.
- Markdown files under `docs/` are UPPER_SNAKE_CASE or `README.md`.
- Markdown files stay within configurable line and character budgets.
- Directories with multiple markdown files include `README.md`.
- Local markdown links point to existing files.
- Local markdown anchors point to existing headings.
- `docs/plan`, `docs/archive/plan`, and `docs/archive/report` use expected task/report shapes.
- `.gitignore` contains `docs/plan` and `docs/archive`.

The validator does not own general markdown style formatting. Use tools such as Prettier or markdownlint separately if a project wants style linting.

## Dependency Policy

Initial implementation is dependency-free and uses Node built-ins.

Future dependencies are allowed only when the extra correctness outweighs package complexity:

- `github-slugger`: if heading anchor compatibility needs to match GitHub more exactly.
- `remark-parse`: if markdown link parsing requires AST-level accuracy.
- `markdownlint-cli`: as a companion tool, not a core dependency.
- `lychee`: as an optional external link checker, not a bundled binary.

## Workspace Verification

Root verification should run workspace package checks:

```bash
npm run verify
npm run pack:dry-run
```

Docs validation should include ignored local memory during local development:

```bash
node packages/docs-validator/bin/dd-docs-validate.mjs . --include-local-memory
```

CI may omit local memory if `docs/plan` and `docs/archive` are not tracked.
