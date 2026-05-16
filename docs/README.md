# Docs

This directory keeps project knowledge close to the code.

## Language

- Write all documents under `docs/` in English.

## Naming

- All directories under `docs/` use kebab-case.
- All markdown file names under `docs/` use UPPER_SNAKE_CASE, including `README.md`.
- Prefer keeping individual markdown files under 200 lines and under 10,000 characters; split larger docs into focused UPPER_SNAKE_CASE files and keep `README.md` as the index/overview.

## Indexing

- When adding, renaming, splitting, moving, or archiving docs, update the nearest relevant `README.md` index/table of contents in the same change.
- Each docs subdirectory `README.md` acts as the local table of contents; list important files, task directories, status, and a one-line purpose for each entry.
- Start small with a single focused markdown file; when one domain grows into multiple docs, promote it to `docs/<area>/<domain>/README.md` plus related UPPER_SNAKE_CASE files in that directory.

## Map

- `concept/`: core ideas behind dotdotgod, including context curation and why the docs structure improves AI-agent work.
- `spec/`: product behavior, API contracts, user-facing requirements. Current specs include `PROJECT_INITIALIZER.md`, `DOTDOT_SETTING.md`, `PLAN_MODE.md`, `PLAN_MODE_TOOL_SETTINGS.md`, `LOAD_PROJECT.md`, `MEMORY_AREA_CONFIG.md`, `TRACEABILITY_CONFIG.md`, and `CROSS_AGENT_SUPPORT.md`.
- `test/`: test strategy, coverage notes, regression cases, and manual verification records.
- `arch/`: architecture decisions, code conventions, module boundaries, data flow, infrastructure/runtime dependencies, integration boundaries, and migration design. Current architecture docs include `CODE_CONVENTIONS.md`, `DOCS_STRUCTURE.md`, `EXTENSION_ARCHITECTURE.md`, `CROSS_AGENT_ARCHITECTURE.md`, `VALIDATION_ARCHITECTURE.md`, and `MEMORY_AREA_CONFIG.md`.
- `plan/`: local active implementation plans. Create one kebab-case directory per task (`plan/<task-slug>/`), keep the task overview/index in that directory's `README.md`, and add supporting UPPER_SNAKE_CASE plan files alongside it. See `plan/README.md` for the current local active plan index. Ignored by git by default.
- `archive/`: local completed plans, temporary reports, historical notes, payload captures, and investigation notes. Move completed plan task directories to `archive/plan/<task-slug>/`; put temporary reports and investigations under `archive/report/<report-slug>/`. See `archive/README.md` for the local archive index. Ignored by git by default.
