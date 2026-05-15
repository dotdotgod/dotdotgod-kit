# Docs Structure

## Purpose

This document defines the long-term documentation structure used by dotdotgod and projects initialized with it.

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

## Traceability Blocks

Behavior specs may include fenced `json dotdotgod` traceability blocks as the final section to connect specs to source, tests, related docs, and verification commands.

The dotdotgod CLI owns the schema and validation behavior. Docs may describe examples, but they are not the enforcement source. Architecture docs should stay focused on decisions, rules, rationale, and change guidance rather than forced one-to-one source mappings.

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

## Memory Scope Vocabulary

The default docs structure separates shared and local memory:

- Shared memory is durable project memory intended to be committed and used by every agent. By default this includes `docs/spec/`, `docs/arch/`, and `docs/test/`.
- Local memory is ignored project-local working memory. By default this includes `docs/plan/` and `docs/archive/`.
- Fresh memory is current or active memory that should be surfaced early, such as active plans.
- Stale memory is historical or completed memory that should be available through an index or targeted lookup, such as archive bodies.
- The archive map is `docs/archive/README.md`; it is stale local memory but stays visible by default.
- Archive bodies are the rest of `docs/archive/**`; they are stale local memory and are not loaded indiscriminately.

Projects can keep these defaults or define explicit memory-area policy with the optional config described in `MEMORY_AREA_CONFIG.md`.

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
