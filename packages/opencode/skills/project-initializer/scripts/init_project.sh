#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
TEMPLATES_DIR="$SCRIPT_DIR/../templates"

usage() {
  cat <<'EOF'
Usage: init_project.sh <project-root> [--project-name NAME] [--template NAME] [--documentation-root PATH] [--dry-run]

Initializes:
  AGENTS.md, CLAUDE.md, CODEX.md
  dotdotgod.config.json
  docs/README.md
  Template-specific domain indexes (spec/arch/test only for software and research)
  docs/plan/README.md
  docs/archive/README.md
  .gitignore entries for docs/plan, docs/archive, and .dotdotgod
EOF
}

PROJECT_ROOT=""
PROJECT_NAME=""
DRY_RUN=0
TEMPLATE_NAME="software"
DOCUMENTATION_ROOT="docs"

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
    --template)
      [ "$#" -ge 2 ] || {
        echo "error: --template requires a value" >&2
        exit 2
      }
      TEMPLATE_NAME=$2
      shift 2
      ;;
    --documentation-root)
      [ "$#" -ge 2 ] || { echo "error: --documentation-root requires a value" >&2; exit 2; }
      DOCUMENTATION_ROOT=$2
      shift 2
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

case "$DOCUMENTATION_ROOT" in
  ''|/*|*\\*|*'..'*|*'*'*|*'?'*|*'['*|*']'*|*'{'*|*'}'*|.dotdotgod*|dotdotgod.config.json*)
    echo "error: invalid documentation root: $DOCUMENTATION_ROOT" >&2
    exit 2
    ;;
esac
DOCUMENTATION_ROOT=$(printf '%s' "$DOCUMENTATION_ROOT" | sed 's#^\./##; s#//*#/#g; s#/$##')

if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME=$(basename "$PROJECT_ROOT")
fi

CONFIG_PATH="$PROJECT_ROOT/dotdotgod.config.json"
case "$TEMPLATE_NAME" in
  *[!a-z0-9-]*|'')
    echo "error: template name must be kebab-case: $TEMPLATE_NAME" >&2
    exit 2
    ;;
esac
CONFIG_TEMPLATE="$TEMPLATES_DIR/$TEMPLATE_NAME.json"
if [ ! -e "$CONFIG_PATH" ] && [ ! -f "$CONFIG_TEMPLATE" ]; then
  echo "error: bundled template not found: $TEMPLATE_NAME; custom templates require the dotdotgod CLI" >&2
  exit 2
fi

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

  if [ -e "$path" ]; then
    print_result "skipped" "$path"
    return
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    print_result "would_create" "$path"
    return
  fi

  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  print_result "created" "$path"
}

ensure_directory() {
  path=$1
  if [ -e "$path" ]; then
    print_result "skipped" "$path"
    return
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    print_result "would_create" "$path"
    return
  fi
  mkdir -p "$path"
  print_result "created" "$path"
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

DOMAIN_MAP=""
if [ ! -e "$CONFIG_PATH" ]; then
  DOMAIN_MAP=$(cat "$TEMPLATES_DIR/$TEMPLATE_NAME.map.md")
fi
DOMAIN_MAP=$(printf '%s' "$DOMAIN_MAP" | sed "s#\`docs/#\`$DOCUMENTATION_ROOT/#g")

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
- When using the dotdotgod CLI, run \`dotdotgod validate\` after docs changes and follow its traceability guidance.

## dotdotgod

dotdotgod is a project memory CLI for AI agents.

Use \`dotdotgod --help\` to discover available project-memory commands and their usage.

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

$DOMAIN_MAP
- \`$DOCUMENTATION_ROOT/\`: all directories use kebab-case; all markdown file names use UPPER_SNAKE_CASE, including \`README.md\`.
- \`$DOCUMENTATION_ROOT/\`: prefer keeping individual markdown files under 200 lines and under 10,000 characters; split larger docs into focused UPPER_SNAKE_CASE files and keep \`README.md\` as the index/overview.
- \`$DOCUMENTATION_ROOT/\`: when adding, renaming, splitting, moving, or archiving docs, update the nearest relevant \`README.md\` index/table of contents in the same change.
- \`$DOCUMENTATION_ROOT/\`: each docs subdirectory \`README.md\` acts as the local table of contents; list important files, task directories, status, and a one-line purpose for each entry.
- \`$DOCUMENTATION_ROOT/\`: start small with a single focused markdown file; when one domain grows into multiple docs, promote it to \`$DOCUMENTATION_ROOT/<area>/<domain>/README.md\` plus related UPPER_SNAKE_CASE files in that directory.
- \`$DOCUMENTATION_ROOT/plan/\`: local active implementation plans. Create one kebab-case directory per task (\`$DOCUMENTATION_ROOT/plan/<task-slug>/\`), keep the task overview/index in that directory's \`README.md\`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- \`$DOCUMENTATION_ROOT/archive/\`: local completed plans, temporary reports, historical notes, payload captures. Move completed plan task directories to \`$DOCUMENTATION_ROOT/archive/plan/<task-slug>/\`; put temporary reports and investigations under \`$DOCUMENTATION_ROOT/archive/report/<report-slug>/\`. Ignored by git by default.

## Agent-Specific Entrypoints

- \`CLAUDE.md\` imports this file with \`@AGENTS.md\`.
- \`CODEX.md\` points users to this file.

Keep long-lived instructions here so agent-specific files do not drift."

write_file "$PROJECT_ROOT/CLAUDE.md" "# CLAUDE.md

@AGENTS.md"

write_file "$PROJECT_ROOT/CODEX.md" "# CODEX.md

See [AGENTS.md](./AGENTS.md)."

write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/README.md" "# Docs

This directory keeps project knowledge close to the code.

## Naming

- All directories under \`$DOCUMENTATION_ROOT/\` use kebab-case.
- All markdown file names under \`$DOCUMENTATION_ROOT/\` use UPPER_SNAKE_CASE, including \`README.md\`.
- Prefer keeping individual markdown files under 200 lines and under 10,000 characters; split larger docs into focused UPPER_SNAKE_CASE files and keep \`README.md\` as the index/overview.

## Indexing

- When adding, renaming, splitting, moving, or archiving docs, update the nearest relevant \`README.md\` index/table of contents in the same change.
- Each docs subdirectory \`README.md\` acts as the local table of contents; list important files, task directories, status, and a one-line purpose for each entry.
- Start small with a single focused markdown file; when one domain grows into multiple docs, promote it to \`$DOCUMENTATION_ROOT/<area>/<domain>/README.md\` plus related UPPER_SNAKE_CASE files in that directory.

## Map

$(printf '%s' "$DOMAIN_MAP" | sed "s#\`$DOCUMENTATION_ROOT/#\`#g")
- \`plan/\`: local active implementation plans. Create one kebab-case directory per task (\`plan/<task-slug>/\`), keep the task overview/index in that directory's \`README.md\`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- \`archive/\`: local completed plans, temporary reports, historical notes, payload captures. Move completed plan task directories to \`archive/plan/<task-slug>/\`; put temporary reports and investigations under \`archive/report/<report-slug>/\`. Ignored by git by default."

write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/plan/README.md" "# Plans

Use this area for active implementation plans.

## Naming

- Task directories use kebab-case: \`$DOCUMENTATION_ROOT/plan/<task-slug>/\`.
- Markdown file names use UPPER_SNAKE_CASE: \`README.md\`, \`RESEARCH_NOTES.md\`, \`VERIFICATION.md\`.

## Structure

- Create one directory per task: \`$DOCUMENTATION_ROOT/plan/<task-slug>/\`.
- Put the task overview, index, scope, status, and main plan in \`$DOCUMENTATION_ROOT/plan/<task-slug>/README.md\`.
- Add supporting research, checklists, payload captures, or verification notes as additional UPPER_SNAKE_CASE markdown files in the same task directory.
- Move completed or superseded task directories to \`$DOCUMENTATION_ROOT/archive/plan/<task-slug>/\`.

This directory is local-only and ignored by git by default."

write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/archive/README.md" "# Archive

Use this area for local completed plans, temporary reports, historical notes, payload captures, and investigation notes.

## Naming

- Archived plan task directories preserve their kebab-case task slug.
- Archived report directories use a focused kebab-case report slug.
- Markdown file names use UPPER_SNAKE_CASE, including \`README.md\`.

## Structure

- Move completed plan task directories from \`$DOCUMENTATION_ROOT/plan/<task-slug>/\` to \`$DOCUMENTATION_ROOT/archive/plan/<task-slug>/\`.
- Put temporary investigations, reports, payload captures, and historical notes under \`$DOCUMENTATION_ROOT/archive/report/<report-slug>/\`.
- Preserve each archive directory's \`README.md\` overview/index and supporting UPPER_SNAKE_CASE markdown files.
- Additional archive categories can be added later as focused kebab-case subdirectories when needed.

This directory is local-only and ignored by git by default."

if [ ! -e "$CONFIG_PATH" ]; then
case "$TEMPLATE_NAME" in
  software|research)
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/spec/README.md" "# Specs

Use this area for behavior specs, API contracts, and requirements. Follow \`dotdotgod validate\` traceability guidance for applicable documents."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/arch/README.md" "# Architecture

Use this area for architecture decisions, design rationale, conventions, and integration boundaries."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/test/README.md" "# Verification

Use this area for test strategy, evaluation methods, regression cases, and verification records."
    ;;
esac
case "$TEMPLATE_NAME" in
  software)
    ;;
  research)
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/research/README.md" "# Research

Use this area for research notes, sources, and findings."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/record/README.md" "# Research Records

Use this area for dated measurements, experiments, and execution records."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/report/README.md" "# Reports

Use this area for research diagnoses, analyses, results, and performance reports."
    ensure_directory "$PROJECT_ROOT/outputs"
    ;;
  case-and-evidence)
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/case/README.md" "# Case Records

Use this area for canonical case facts, questions, and decisions."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/evidence/README.md" "# Evidence

Use this area for factual, legal, and other supporting evidence."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/outputs/README.md" "# Case Outputs

Use this area for maintained case outputs."
    ;;
  publication)
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/outline/README.md" "# Publication Outline

Use this area for publication structure and outlines."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/chapters/README.md" "# Chapter Plans

Use this area for chapter plans and direction."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/claims/README.md" "# Claims

Use this area for maintained claims and their support."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/research/README.md" "# Research Sources

Use this area for research sources and supporting notes."
    ensure_directory "$PROJECT_ROOT/book"
    ;;
  portfolio)
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/strategy/README.md" "# Portfolio Strategy

Use this area for portfolio strategy and risk rules."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/positions/README.md" "# Position Theses

Use this area for position theses and investment conclusions."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/journal/README.md" "# Decision Journal

Use this area for dated investment decisions and reviews."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/report/README.md" "# Market Research

Use this area for maintained market research and analysis."
    ensure_directory "$PROJECT_ROOT/data"
    ;;
  policy)
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/policy/README.md" "# Policy Documents

Use this area for integrated policy proposals and outputs."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/sections/README.md" "# Policy Sections

Use this area for source policy sections."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/evidence/README.md" "# Policy Evidence

Use this area for evidence supporting policy proposals."
    write_file "$PROJECT_ROOT/$DOCUMENTATION_ROOT/outputs/README.md" "# Submission Outputs

Use this area for maintained policy submission outputs."
    ;;
esac
fi

if [ -e "$CONFIG_PATH" ]; then
  print_result "skipped" "$CONFIG_PATH"
else
  write_file "$CONFIG_PATH" "$(sed 's#"root": "docs"#"root": "'$DOCUMENTATION_ROOT'"#; s#"docs/#"'$DOCUMENTATION_ROOT'/#g' "$CONFIG_TEMPLATE")"
fi

ensure_gitignore_entry "$DOCUMENTATION_ROOT/plan"
ensure_gitignore_entry "$DOCUMENTATION_ROOT/archive"
ensure_gitignore_entry ".dotdotgod"
