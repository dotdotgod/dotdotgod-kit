# Docs

This directory keeps project knowledge close to the code.

## Naming

- All directories under `docs/` use kebab-case.
- All markdown file names under `docs/` use UPPER_SNAKE_CASE, including `README.md`.

## Map

- `spec/`: product behavior, API contracts, user-facing requirements.
- `test/`: test strategy, coverage notes, regression cases, and manual verification records.
- `arch/`: architecture decisions, data flow notes, integration boundaries, and migration design.
- `plan/`: local active implementation plans. Create one kebab-case directory per task (`plan/<task-slug>/`), keep the task overview/index in that directory's `README.md`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- `archive/`: local completed plans, historical notes, payload captures, and investigation notes. Move completed task directories here (`archive/<task-slug>/`). Ignored by git by default.
