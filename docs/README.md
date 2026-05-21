# Docs

This directory keeps project knowledge close to the code.

## Language

- Write all documents under `docs/` in English.

## Naming

- All directories under `docs/` use kebab-case.
- All markdown file names under `docs/` use UPPER_SNAKE_CASE, including `README.md`.
- Prefer keeping individual markdown files under the configured markdown validation budgets (default 200 lines and 10,000 characters); split larger docs into focused UPPER_SNAKE_CASE files and keep `README.md` as the index/overview unless a narrow size-check exception is configured.

## Indexing

- When adding, renaming, splitting, moving, or archiving docs, update the nearest relevant `README.md` index/table of contents in the same change.
- Each docs subdirectory `README.md` acts as the local table of contents; list important files, task directories, status, and a one-line purpose for each entry.
- Start small with a single focused markdown file; when one domain grows into multiple docs, promote it to `docs/<area>/<domain>/README.md` plus related UPPER_SNAKE_CASE files in that directory.

## Map

| Area | Use for | Start at |
| --- | --- | --- |
| `concept/` | Core ideas behind dotdotgod: context curation, Graphify comparison, measurement, and why the docs structure improves AI-agent work. | `concept/README.md` |
| `spec/` | Product behavior, API contracts, user-facing requirements, and CLI command contracts. | `spec/README.md` |
| `test/` | Test strategy, coverage notes, regression cases, command checks, and manual verification records. | `test/README.md` |
| `arch/` | Architecture decisions, code conventions, module boundaries, data flow, runtime dependencies, and integration boundaries. | `arch/README.md` |
| `plan/` | Local active implementation plans. Create one kebab-case directory per task and keep the task overview in that directory's `README.md`. | `plan/README.md` |
| `report/` | Local analysis reports and measurement summaries. | `report/README.md` |
| `archive/` | Local completed plans, temporary reports, historical notes, payload captures, and investigation notes. Read the map first, then open archived bodies only when targeted. | `archive/README.md` |

`docs/plan/` and `docs/archive/` are ignored by git by default.
