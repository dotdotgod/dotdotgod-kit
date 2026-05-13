#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: init_project.sh <project-root> [--project-name NAME] [--force] [--dry-run]

Initializes:
  AGENTS.md, CLAUDE.md, CODEX.md
  docs/README.md
  docs/spec/README.md
  docs/test/README.md
  docs/arch/README.md
  docs/plan/README.md
  docs/archive/README.md
  .gitignore entries for docs/plan and docs/archive
EOF
}

PROJECT_ROOT=""
PROJECT_NAME=""
FORCE=0
DRY_RUN=0

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
- \`docs/arch/\`: architecture decisions, data flow, module boundaries.
- \`docs/\`: all directories use kebab-case; all markdown file names use UPPER_SNAKE_CASE, including \`README.md\`.
- \`docs/plan/\`: local active implementation plans. Create one kebab-case directory per task (\`docs/plan/<task-slug>/\`), keep the task overview/index in that directory's \`README.md\`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- \`docs/archive/\`: local completed plans, historical notes, payload captures. Move completed task directories here (\`docs/archive/<task-slug>/\`). Ignored by git by default.

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

## Map

- \`spec/\`: product behavior, API contracts, user-facing requirements.
- \`test/\`: test strategy, regression cases, manual verification notes.
- \`arch/\`: architecture decisions, data flow, module boundaries.
- \`plan/\`: local active implementation plans. Create one kebab-case directory per task (\`plan/<task-slug>/\`), keep the task overview/index in that directory's \`README.md\`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- \`archive/\`: local completed plans, historical notes, payload captures. Move completed task directories here (\`archive/<task-slug>/\`). Ignored by git by default."

write_file "$PROJECT_ROOT/docs/spec/README.md" "# Specs

Use this area for behavior specs, API contracts, and product requirements."

write_file "$PROJECT_ROOT/docs/test/README.md" "# Tests

Use this area for test strategy, coverage notes, regression cases, and manual verification records."

write_file "$PROJECT_ROOT/docs/arch/README.md" "# Architecture

Use this area for architecture decisions, data flow notes, integration boundaries, and migration design."

write_file "$PROJECT_ROOT/docs/plan/README.md" "# Plans

Use this area for active implementation plans.

## Naming

- Task directories use kebab-case: \`docs/plan/<task-slug>/\`.
- Markdown file names use UPPER_SNAKE_CASE: \`README.md\`, \`RESEARCH_NOTES.md\`, \`VERIFICATION.md\`.

## Structure

- Create one directory per task: \`docs/plan/<task-slug>/\`.
- Put the task overview, index, scope, status, and main plan in \`docs/plan/<task-slug>/README.md\`.
- Add supporting research, checklists, payload captures, or verification notes as additional UPPER_SNAKE_CASE markdown files in the same task directory.
- Move completed or superseded task directories to \`docs/archive/<task-slug>/\`.

This directory is local-only and ignored by git by default."

write_file "$PROJECT_ROOT/docs/archive/README.md" "# Archive

Use this area for completed plans, historical decisions, payload captures, and investigation notes.

## Naming

- Archived task directories preserve their kebab-case task slug.
- Markdown file names use UPPER_SNAKE_CASE, including \`README.md\`.

## Structure

- Move completed task directories from \`docs/plan/<task-slug>/\` to \`docs/archive/<task-slug>/\`.
- Preserve each task directory's \`README.md\` overview/index and supporting UPPER_SNAKE_CASE markdown files.

This directory is local-only and ignored by git by default."

ensure_gitignore_entry "docs/plan"
ensure_gitignore_entry "docs/archive"
