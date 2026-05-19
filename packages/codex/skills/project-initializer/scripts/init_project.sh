#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: init_project.sh <project-root> [--project-name NAME] [--dotdot-setting] [--force] [--dry-run]

Initializes:
  AGENTS.md, CLAUDE.md, CODEX.md
  docs/README.md
  docs/spec/README.md
  docs/test/README.md
  docs/arch/README.md
  docs/plan/README.md
  docs/archive/README.md
  .gitignore entries for docs/plan, docs/archive, and .dotdotgod
EOF
}

PROJECT_ROOT=""
PROJECT_NAME=""
FORCE=0
DRY_RUN=0
DOTDOT_SETTING=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-name)
      [ "$#" -ge 2 ] || {
        echo "error: --project-name requires a value" >&2
        exit 2
      }
      PROJECT_NAME=$2
      shift 2
      ;;
    --dotdot-setting)
      DOTDOT_SETTING=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [ -n "$PROJECT_ROOT" ]; then
        echo "error: unexpected argument: $1" >&2
        usage >&2
        exit 2
      fi
      PROJECT_ROOT=$1
      shift
      ;;
  esac
done

[ -n "$PROJECT_ROOT" ] || {
  usage >&2
  exit 2
}

case "$PROJECT_ROOT" in
  /*) ;;
  *) PROJECT_ROOT="$(pwd)/$PROJECT_ROOT" ;;
esac

if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME=$(basename "$PROJECT_ROOT")
fi

timestamp() {
  date -u "+%Y%m%d%H%M%S"
}

print_result() {
  status=$1
  path=$2
  extra=${3:-}
  if [ -n "$extra" ]; then
    printf '%-13s %s %s\n' "$status" "$path" "$extra"
  else
    printf '%-13s %s\n' "$status" "$path"
  fi
}

write_file() {
  path=$1
  content=$2

  if [ -e "$path" ] && [ "$FORCE" -ne 1 ]; then
    print_result "skipped" "$path"
    return
  fi

  backup=""
  if [ -e "$path" ] && [ "$FORCE" -eq 1 ]; then
    backup="$path.bak.$(timestamp)"
    if [ "$DRY_RUN" -ne 1 ]; then
      mv "$path" "$backup"
    fi
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    if [ -n "$backup" ]; then
      print_result "would_replace" "$path" "backup=$backup"
    else
      print_result "would_create" "$path"
    fi
    return
  fi

  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  if [ -n "$backup" ]; then
    print_result "replaced" "$path" "backup=$backup"
  else
    print_result "created" "$path"
  fi
}

ensure_gitignore_entry() {
  entry=$1
  path="$PROJECT_ROOT/.gitignore"
  existed=0
  [ -f "$path" ] && existed=1

  if [ -f "$path" ] && grep -Fxq "$entry" "$path"; then
    return
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    if [ -f "$path" ]; then
      print_result "would_update" "$path" "add=$entry"
    else
      print_result "would_create" "$path" "add=$entry"
    fi
    return
  fi

  mkdir -p "$PROJECT_ROOT"
  if [ -f "$path" ] && [ -s "$path" ]; then
    last_char=$(tail -c 1 "$path" || true)
    [ "$last_char" = "" ] || printf '\n' >> "$path"
  fi
  printf '%s\n' "$entry" >> "$path"
  if [ "$existed" -eq 1 ]; then
    print_result "updated" "$path" "add=$entry"
  else
    print_result "created" "$path" "add=$entry"
  fi
}

if [ "$DRY_RUN" -ne 1 ]; then
  mkdir -p "$PROJECT_ROOT"
fi

DOTDOT_AGENT_RULE=""
if [ "$DOTDOT_SETTING" -eq 1 ]; then
  DOTDOT_AGENT_RULE='
- Follow the project documentation structure in `docs/arch/DOCS_STRUCTURE.md` and code conventions in `docs/arch/CODE_CONVENTIONS.md`.'
fi

ARCH_README_EXTRA=""
if [ "$DOTDOT_SETTING" -eq 1 ]; then
  ARCH_README_EXTRA='

## Index

- `DOCS_STRUCTURE.md`: documentation layout, naming, README index, spec current-state writing contract, and domain directory promotion rules.
- `CODE_CONVENTIONS.md`: dotdot code conventions, including abstraction boundaries, source file size guidance, impact hotspot handling, and extraction/testability rules. If conventions grow across multiple topics, promote them to `conventions/README.md` with supporting UPPER_SNAKE_CASE files.'
fi

write_file "$PROJECT_ROOT/AGENTS.md" "# AGENTS.md

Canonical instructions for AI coding agents working in this repository.

## Project

- Name: $PROJECT_NAME
- Purpose: TODO: describe the product, service, or library.
- Primary stack: TODO: list runtime, framework, database, and package manager.

## Working Rules

- Read existing code and docs before changing behavior.
- Keep changes scoped to the user's request.
- Preserve user edits and unrelated dirty worktree changes.
- Prefer existing local patterns over introducing new abstractions.
- Update docs when behavior, architecture, or test strategy changes.
- When using the dotdotgod CLI, run \`dotdotgod validate\` after docs changes and follow its traceability guidance for behavior specs.$DOTDOT_AGENT_RULE

## Commands

Document the project-specific commands here:

\`\`\`bash
# Install dependencies
TODO

# Run tests
TODO

# Run the app
TODO
\`\`\`

## Documentation Map

- \`docs/spec/\`: product behavior, API contracts, user-facing requirements.
- \`docs/test/\`: test strategy, regression cases, manual verification notes.
- \`docs/arch/\`: architecture decisions, code conventions, module boundaries, data flow, infrastructure/runtime dependencies, integration boundaries, and migration design.
- \`docs/\`: all directories use kebab-case; all markdown file names use UPPER_SNAKE_CASE, including \`README.md\`.
- \`docs/\`: prefer keeping individual markdown files under 200 lines and under 10,000 characters; split larger docs into focused UPPER_SNAKE_CASE files and keep \`README.md\` as the index/overview.
- \`docs/\`: when adding, renaming, splitting, moving, or archiving docs, update the nearest relevant \`README.md\` index/table of contents in the same change.
- \`docs/\`: each docs subdirectory \`README.md\` acts as the local table of contents; list important files, task directories, status, and a one-line purpose for each entry.
- \`docs/\`: start small with a single focused markdown file; when one domain grows into multiple docs, promote it to \`docs/<area>/<domain>/README.md\` plus related UPPER_SNAKE_CASE files in that directory.
- \`docs/arch/\`: code conventions may start as \`CODE_CONVENTIONS.md\`; when they grow across multiple topics, use \`docs/arch/conventions/README.md\` as the index with supporting UPPER_SNAKE_CASE files.
- \`docs/plan/\`: local active implementation plans. Create one kebab-case directory per task (\`docs/plan/<task-slug>/\`), keep the task overview/index in that directory's \`README.md\`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- \`docs/archive/\`: local completed plans, temporary reports, historical notes, payload captures. Move completed plan task directories to \`docs/archive/plan/<task-slug>/\`; put temporary reports and investigations under \`docs/archive/report/<report-slug>/\`. Ignored by git by default.

## Agent-Specific Entrypoints

- \`CLAUDE.md\` imports this file with \`@AGENTS.md\`.
- \`CODEX.md\` points users to this file.

Keep long-lived instructions here so agent-specific files do not drift."

write_file "$PROJECT_ROOT/CLAUDE.md" "# CLAUDE.md

@AGENTS.md"

write_file "$PROJECT_ROOT/CODEX.md" "# CODEX.md

See [AGENTS.md](./AGENTS.md)."

write_file "$PROJECT_ROOT/docs/README.md" "# Docs

This directory keeps project knowledge close to the code.

## Naming

- All directories under \`docs/\` use kebab-case.
- All markdown file names under \`docs/\` use UPPER_SNAKE_CASE, including \`README.md\`.
- Prefer keeping individual markdown files under 200 lines and under 10,000 characters; split larger docs into focused UPPER_SNAKE_CASE files and keep \`README.md\` as the index/overview.

## Indexing

- When adding, renaming, splitting, moving, or archiving docs, update the nearest relevant \`README.md\` index/table of contents in the same change.
- Each docs subdirectory \`README.md\` acts as the local table of contents; list important files, task directories, status, and a one-line purpose for each entry.
- Start small with a single focused markdown file; when one domain grows into multiple docs, promote it to \`docs/<area>/<domain>/README.md\` plus related UPPER_SNAKE_CASE files in that directory.

## Map

- \`spec/\`: product behavior, API contracts, user-facing requirements.
- \`test/\`: test strategy, regression cases, manual verification notes.
- \`arch/\`: architecture decisions, code conventions, module boundaries, data flow, infrastructure/runtime dependencies, integration boundaries, and migration design.
- \`plan/\`: local active implementation plans. Create one kebab-case directory per task (\`plan/<task-slug>/\`), keep the task overview/index in that directory's \`README.md\`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- \`archive/\`: local completed plans, temporary reports, historical notes, payload captures. Move completed plan task directories to \`archive/plan/<task-slug>/\`; put temporary reports and investigations under \`archive/report/<report-slug>/\`. Ignored by git by default."

write_file "$PROJECT_ROOT/docs/spec/README.md" "# Specs

Use this area for behavior specs, API contracts, and product requirements.

For projects using the dotdotgod CLI, behavior specs may be required by \`dotdotgod validate\` to include fenced \`json dotdotgod\` traceability blocks as the final section. The CLI owns the schema and prints property-level repair guidance when validation fails."

write_file "$PROJECT_ROOT/docs/test/README.md" "# Tests

Use this area for test strategy, coverage notes, regression cases, and manual verification records."

write_file "$PROJECT_ROOT/docs/arch/README.md" "# Architecture

Use this area for architecture decisions, code conventions, module boundaries, data flow notes, infrastructure/runtime dependencies, integration boundaries, and migration design.$ARCH_README_EXTRA"

if [ "$DOTDOT_SETTING" -eq 1 ]; then
  write_file "$PROJECT_ROOT/docs/arch/DOCS_STRUCTURE.md" "# Docs Structure

Long-term documentation structure for this project.

## Top-Level Areas

- \`docs/spec/\`: product behavior, API contracts, user-facing requirements, and feature contracts.
- \`docs/test/\`: test strategy, coverage notes, regression cases, and manual verification records.
- \`docs/arch/\`: architecture decisions, code conventions, module boundaries, data flow, infrastructure/runtime dependencies, integration boundaries, and migration design.
- \`docs/plan/\`: local active implementation plans.
- \`docs/archive/\`: local completed plans, historical notes, payload captures, and investigation notes.

## Naming

- Directories under \`docs/\` use kebab-case.
- Markdown files under \`docs/\` use UPPER_SNAKE_CASE.
- \`README.md\` is the only mixed-case markdown filename exception and is required for index/overview files.

## File Size Guideline

Prefer keeping individual markdown files under 200 lines and 10,000 characters. When either guideline is exceeded, split the document into focused UPPER_SNAKE_CASE files and keep \`README.md\` as the index/overview. Configured validation exceptions should stay narrow and intentional.

## README Indexes

Each docs subdirectory \`README.md\` acts as the local table of contents. It should list important files, task directories, status, and a one-line purpose for each entry.

When adding, renaming, splitting, moving, or archiving docs, update the nearest relevant \`README.md\` in the same change.

## Domain Directory Promotion

Start small with one focused markdown file. When one domain grows into multiple docs, promote it to \`docs/<area>/<domain>/README.md\` and place related UPPER_SNAKE_CASE markdown files in that directory.

## Spec Writing Contract

Behavior specs describe the current product contract: supported commands, API shapes, user-visible behavior, defaults, constraints, and validation outcomes.

Specs should not describe how behavior changed over time. Rewrite historical-change wording into direct current-state rules. Historical context, migration rationale, future extension ideas, and completed-plan notes belong in \`docs/arch/\`, \`docs/test/\`, \`docs/archive/\`, or active \`docs/plan/\` files rather than behavior specs. If compatibility behavior is still user-visible, keep it in the spec but phrase it as a current supported or unsupported rule.

Config/action terms such as \`remove\`, \`exclude\`, \`fallback\`, and \`replacement semantics\` are allowed when they name current behavior precisely.

## Traceability Blocks

Behavior specs may include fenced \`json dotdotgod\` traceability blocks as the final section to connect specs to source, tests, related docs, and verification commands. The dotdotgod CLI owns the schema and validation behavior.

## Plan and Archive Directories

Active task plans use \`docs/plan/<task-slug>/README.md\`. Completed or superseded plan task directories move to \`docs/archive/plan/<task-slug>/\`. Temporary investigations, reports, payload captures, and historical notes move to \`docs/archive/report/<report-slug>/\`.

\`docs/plan\` and \`docs/archive\` are ignored by git by default.
"

  write_file "$PROJECT_ROOT/docs/arch/CODE_CONVENTIONS.md" "# Code Conventions

Dotdot code conventions for keeping implementation simple and maintainable.

## Abstraction Boundaries

- Do not introduce unnecessary abstractions.
- Do not abstract code that is not reused.
- Do not abstract reused code when the reused behavior is likely to split into separate features or flows later.
- Prefer local, explicit code until a stable reuse pattern appears.

## Source File Size

- Keep source files small enough to read in one focused pass by humans and coding agents.
- If code grows beyond 150 lines, consider splitting or extracting focused units even when it is not reused.
- Review files approaching 250 lines for focused extraction by responsibility.
- Split by behavior or responsibility, not by arbitrary layers.

## Dotdotgod Impact Hotspots

- Treat repeated \`dotdotgod graph impact\` results that collapse onto one large file as a design signal, not as normal precision.
- Dotdotgod impact reveals mixed-responsibility hotspots; it does not replace focused module boundaries.
- When unrelated changes keep pointing to the same source file, split the file by behavior so impact results, tests, and docs can map to narrower responsibilities.

## Extraction and Testability

- Prefer extracting pure helpers when behavior can be tested without runtime dependencies.
- Keep runtime integration explicit and local until reuse is stable.
- Put testable logic in focused modules before adding broad framework abstractions.
- Preserve plain-text readability: avoid dense clever code, hidden control flow, and large mixed-responsibility files.
"
fi

write_file "$PROJECT_ROOT/docs/plan/README.md" "# Plans

Use this area for active implementation plans.

## Naming

- Task directories use kebab-case: \`docs/plan/<task-slug>/\`.
- Markdown file names use UPPER_SNAKE_CASE: \`README.md\`, \`RESEARCH_NOTES.md\`, \`VERIFICATION.md\`.

## Structure

- Create one directory per task: \`docs/plan/<task-slug>/\`.
- Put the task overview, index, scope, status, and main plan in \`docs/plan/<task-slug>/README.md\`.
- Add supporting research, checklists, payload captures, or verification notes as additional UPPER_SNAKE_CASE markdown files in the same task directory.
- Move completed or superseded task directories to \`docs/archive/plan/<task-slug>/\`.

This directory is local-only and ignored by git by default."

write_file "$PROJECT_ROOT/docs/archive/README.md" "# Archive

Use this area for local completed plans, temporary reports, historical notes, payload captures, and investigation notes.

## Naming

- Archived plan task directories preserve their kebab-case task slug.
- Archived report directories use a focused kebab-case report slug.
- Markdown file names use UPPER_SNAKE_CASE, including \`README.md\`.

## Structure

- Move completed plan task directories from \`docs/plan/<task-slug>/\` to \`docs/archive/plan/<task-slug>/\`.
- Put temporary investigations, reports, payload captures, and historical notes under \`docs/archive/report/<report-slug>/\`.
- Preserve each archive directory's \`README.md\` overview/index and supporting UPPER_SNAKE_CASE markdown files.
- Additional archive categories can be added later as focused kebab-case subdirectories when needed.

This directory is local-only and ignored by git by default."

ensure_gitignore_entry "docs/plan"
ensure_gitignore_entry "docs/archive"
ensure_gitignore_entry ".dotdotgod"
