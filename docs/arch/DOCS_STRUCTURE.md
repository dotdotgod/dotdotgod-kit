# Docs Structure

## Purpose

This document defines the long-term documentation structure used by `project-memory-kit` and projects initialized with it.

## Top-Level Areas

- `docs/spec/`: product behavior, API contracts, user-facing requirements, and feature contracts.
- `docs/test/`: test strategy, coverage notes, regression cases, and manual verification records.
- `docs/arch/`: architecture decisions, code conventions, module boundaries, data flow, infrastructure/runtime dependencies, integration boundaries, and migration design.
- `docs/plan/`: local active implementation plans.
- `docs/archive/`: local completed plans, historical notes, payload captures, and investigation notes.

## Naming

- Directories under `docs/` use kebab-case.
- Markdown files under `docs/` use UPPER_SNAKE_CASE.
- `README.md` is the only mixed-case markdown filename exception and is required for index/overview files.

## File Size Guideline

Prefer keeping individual markdown files under:

- 200 lines
- 10,000 characters

When either guideline is exceeded, split the document into focused UPPER_SNAKE_CASE files and keep `README.md` as the index/overview.

## README as Local Table of Contents

Each docs subdirectory `README.md` acts as the local table of contents.

It should list important files, task directories, status, and a one-line purpose for each entry.

When adding, renaming, splitting, moving, or archiving docs, update the nearest relevant `README.md` in the same change.

## Domain Directory Promotion

Start small with one focused markdown file.

When one domain grows into multiple docs, promote it to:

```text
docs/<area>/<domain>/README.md
```

and place related UPPER_SNAKE_CASE markdown files in that directory.

Examples:

```text
docs/spec/payment/README.md
docs/spec/payment/LIST_API.md
docs/spec/payment/SUMMARY_API.md
```

```text
docs/arch/conventions/README.md
docs/arch/conventions/COMPONENT_STRUCTURE.md
docs/arch/conventions/DATA_LOADING.md
```

## Code Convention Documents

Code conventions may start as:

```text
docs/arch/CODE_CONVENTIONS.md
```

When they grow across multiple topics, promote them to:

```text
docs/arch/conventions/README.md
```

with supporting UPPER_SNAKE_CASE files in the same directory.

## Plan and Archive Directories

Active task plans use:

```text
docs/plan/<task-slug>/README.md
```

Completed or superseded plan task directories move to:

```text
docs/archive/plan/<task-slug>/
```

Temporary investigations, reports, payload captures, and historical notes move to:

```text
docs/archive/report/<report-slug>/
```

`docs/plan` and `docs/archive` are ignored by git by default.
