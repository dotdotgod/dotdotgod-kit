import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

function utcTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function action(status, path, extra = {}) {
  return { status, path, ...extra };
}

function formatAction(item) {
  const extras = [];
  if (item.backup) extras.push(`backup=${item.backup}`);
  if (item.add) extras.push(`add=${item.add}`);
  return `${item.status.padEnd(13)} ${item.path}${extras.length > 0 ? ` ${extras.join(' ')}` : ''}`;
}

function normalizeRoot(root) {
  return resolve(root);
}

function parseInitOptions(argv) {
  const options = { root: null, projectName: '', dotdotSetting: false, force: false, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--dotdot-setting') options.dotdotSetting = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--project-name') {
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) throw new Error('--project-name requires a value');
      options.projectName = value;
      i += 1;
    } else if (!arg.startsWith('-') && !options.root) {
      options.root = arg;
    } else if (!arg.startsWith('-')) {
      throw new Error(`Unexpected argument: ${arg}`);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!options.root) throw new Error('Missing required argument: <root>');
  options.root = normalizeRoot(options.root);
  if (!options.projectName) options.projectName = basename(options.root);
  return options;
}

function initError(options, code, message) {
  if (options?.json) {
    console.log(JSON.stringify({ ok: false, command: 'init', root: options.root, error: { code, message } }, null, 2));
  } else {
    console.error(message);
  }
  process.exit(2);
}

function writeInitFile(options, relativePath, content, actions) {
  const target = join(options.root, relativePath);
  if (existsSync(target) && !options.force) {
    actions.push(action('skipped', target));
    return;
  }

  let backup = '';
  if (existsSync(target) && options.force) {
    backup = `${target}.bak.${utcTimestamp()}`;
    if (!options.dryRun) renameSync(target, backup);
  }

  if (options.dryRun) {
    actions.push(action(backup ? 'would_replace' : 'would_create', target, backup ? { backup } : {}));
    return;
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${content}\n`);
  actions.push(action(backup ? 'replaced' : 'created', target, backup ? { backup } : {}));
}

function ensureGitignoreEntry(options, entry, actions) {
  const target = join(options.root, '.gitignore');
  const existed = existsSync(target);
  let current = existed ? readFileSync(target, 'utf8') : '';
  if (current.split(/\r?\n/).includes(entry)) return;

  if (options.dryRun) {
    actions.push(action(existed ? 'would_update' : 'would_create', target, { add: entry }));
    return;
  }

  mkdirSync(options.root, { recursive: true });
  if (current.length > 0 && !current.endsWith('\n')) current = `${current}\n`;
  writeFileSync(target, `${current}${entry}\n`);
  actions.push(action(existed ? 'updated' : 'created', target, { add: entry }));
}

function agentContent(projectName, dotdotSetting) {
  const dotdotAgentRule = dotdotSetting ? '\n- Follow the project code conventions in `docs/arch/CODE_CONVENTIONS.md`.' : '';
  return `# AGENTS.md

Canonical instructions for AI coding agents working in this repository.

## Project

- Name: ${projectName}
- Purpose: TODO: describe the product, service, or library.
- Primary stack: TODO: list runtime, framework, database, and package manager.

## Working Rules

- Read existing code and docs before changing behavior.
- Keep changes scoped to the user's request.
- Preserve user edits and unrelated dirty worktree changes.
- Prefer existing local patterns over introducing new abstractions.
- Update docs when behavior, architecture, or test strategy changes.
- When using the dotdotgod CLI, run \`dotdotgod validate\` after docs changes and follow its traceability guidance for behavior specs.${dotdotAgentRule}

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
- \`docs/\`: prefer keeping individual markdown files under the configured markdown validation budgets (default 200 lines and 10,000 characters); split larger docs into focused UPPER_SNAKE_CASE files and keep \`README.md\` as the index/overview unless a narrow size-check exception is configured.
- \`docs/\`: when adding, renaming, splitting, moving, or archiving docs, update the nearest relevant \`README.md\` index/table of contents in the same change.
- \`docs/\`: each docs subdirectory \`README.md\` acts as the local table of contents; list important files, task directories, status, and a one-line purpose for each entry.
- \`docs/\`: start small with a single focused markdown file; when one domain grows into multiple docs, promote it to \`docs/<area>/<domain>/README.md\` plus related UPPER_SNAKE_CASE files in that directory.
- \`docs/arch/\`: code conventions may start as \`CODE_CONVENTIONS.md\`; when they grow across multiple topics, use \`docs/arch/conventions/README.md\` as the index with supporting UPPER_SNAKE_CASE files.
- \`docs/plan/\`: local active implementation plans. Create one kebab-case directory per task (\`docs/plan/<task-slug>/\`), keep the task overview/index in that directory's \`README.md\`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- \`docs/archive/\`: local completed plans, temporary reports, historical notes, payload captures. Move completed plan task directories to \`docs/archive/plan/<task-slug>/\`; put temporary reports and investigations under \`docs/archive/report/<report-slug>/\`. Ignored by git by default.

## Agent-Specific Entrypoints

- \`CLAUDE.md\` imports this file with \`@AGENTS.md\`.
- \`CODEX.md\` points users to this file.

Keep long-lived instructions here so agent-specific files do not drift.`;
}

function docsReadmeContent() {
  return `# Docs

This directory keeps project knowledge close to the code.

## Naming

- All directories under \`docs/\` use kebab-case.
- All markdown file names under \`docs/\` use UPPER_SNAKE_CASE, including \`README.md\`.
- Prefer keeping individual markdown files under the configured markdown validation budgets (default 200 lines and 10,000 characters); split larger docs into focused UPPER_SNAKE_CASE files and keep \`README.md\` as the index/overview unless a narrow size-check exception is configured.

## Indexing

- When adding, renaming, splitting, moving, or archiving docs, update the nearest relevant \`README.md\` index/table of contents in the same change.
- Each docs subdirectory \`README.md\` acts as the local table of contents; list important files, task directories, status, and a one-line purpose for each entry.
- Start small with a single focused markdown file; when one domain grows into multiple docs, promote it to \`docs/<area>/<domain>/README.md\` plus related UPPER_SNAKE_CASE files in that directory.

## Map

- \`spec/\`: product behavior, API contracts, user-facing requirements.
- \`test/\`: test strategy, regression cases, manual verification notes.
- \`arch/\`: architecture decisions, code conventions, module boundaries, data flow, infrastructure/runtime dependencies, integration boundaries, and migration design.
- \`plan/\`: local active implementation plans. Create one kebab-case directory per task (\`plan/<task-slug>/\`), keep the task overview/index in that directory's \`README.md\`, and add supporting UPPER_SNAKE_CASE plan files alongside it. Ignored by git by default.
- \`archive/\`: local completed plans, temporary reports, historical notes, payload captures. Move completed plan task directories to \`archive/plan/<task-slug>/\`; put temporary reports and investigations under \`archive/report/<report-slug>/\`. Ignored by git by default.`;
}

function codeConventionsContent() {
  return `# Code Conventions

Dotdot code conventions for keeping implementation simple and maintainable.

## Abstraction Boundaries

- Do not introduce unnecessary abstractions.
- Do not abstract code that is not reused.
- If code grows beyond 150 lines, consider splitting or extracting focused units even when it is not reused.
- Review files approaching 250 lines for focused extraction by responsibility.
- Treat repeated \`dotdotgod graph impact\` results that collapse onto one large file as a design signal to split mixed responsibilities by behavior.
- Dotdotgod impact reveals hotspots but does not replace focused module boundaries.
- Prefer extracting pure helpers when behavior can be tested without runtime dependencies.
- Keep runtime integration explicit and local until a stable reuse pattern appears.
- Do not abstract reused code when the reused behavior is likely to split into separate features or flows later.
- Keep source files readable as plain text for humans and coding agents.`;
}

function initFiles(options) {
  const archReadmeExtra = options.dotdotSetting ? '\n\n## Index\n\n- `CODE_CONVENTIONS.md`: dotdot code conventions, including abstraction boundaries and when to split long code. If conventions grow across multiple topics, promote them to `conventions/README.md` with supporting UPPER_SNAKE_CASE files.' : '';
  const files = [
    ['AGENTS.md', agentContent(options.projectName, options.dotdotSetting)],
    ['CLAUDE.md', '# CLAUDE.md\n\n@AGENTS.md'],
    ['CODEX.md', '# CODEX.md\n\nSee [AGENTS.md](./AGENTS.md).'],
    ['docs/README.md', docsReadmeContent()],
    ['docs/spec/README.md', '# Specs\n\nUse this area for behavior specs, API contracts, and product requirements.\n\nFor projects using the dotdotgod CLI, behavior specs may be required by `dotdotgod validate` to include fenced `json dotdotgod` traceability blocks as the final section. The CLI owns the schema and prints property-level repair guidance when validation fails.'],
    ['docs/test/README.md', '# Tests\n\nUse this area for test strategy, coverage notes, regression cases, and manual verification records.'],
    ['docs/arch/README.md', `# Architecture\n\nUse this area for architecture decisions, code conventions, module boundaries, data flow notes, infrastructure/runtime dependencies, integration boundaries, and migration design.${archReadmeExtra}`],
    ['docs/plan/README.md', '# Plans\n\nUse this area for active implementation plans.\n\n## Naming\n\n- Task directories use kebab-case: `docs/plan/<task-slug>/`.\n- Markdown file names use UPPER_SNAKE_CASE: `README.md`, `RESEARCH_NOTES.md`, `VERIFICATION.md`.\n\n## Structure\n\n- Create one directory per task: `docs/plan/<task-slug>/`.\n- Put the task overview, index, scope, status, and main plan in `docs/plan/<task-slug>/README.md`.\n- Add supporting research, checklists, payload captures, or verification notes as additional UPPER_SNAKE_CASE markdown files in the same task directory.\n- Move completed or superseded task directories to `docs/archive/plan/<task-slug>/`.\n\nThis directory is local-only and ignored by git by default.'],
    ['docs/archive/README.md', '# Archive\n\nUse this area for local completed plans, temporary reports, historical notes, payload captures, and investigation notes.\n\n## Naming\n\n- Archived plan task directories preserve their kebab-case task slug.\n- Archived report directories use a focused kebab-case report slug.\n- Markdown file names use UPPER_SNAKE_CASE, including `README.md`.\n\n## Structure\n\n- Move completed plan task directories from `docs/plan/<task-slug>/` to `docs/archive/plan/<task-slug>/`.\n- Put temporary investigations, reports, payload captures, and historical notes under `docs/archive/report/<report-slug>/`.\n- Preserve each archive directory\'s `README.md` overview/index and supporting UPPER_SNAKE_CASE markdown files.\n- Additional archive categories can be added later as focused kebab-case subdirectories when needed.\n\nThis directory is local-only and ignored by git by default.'],
  ];
  if (options.dotdotSetting) files.push(['docs/arch/CODE_CONVENTIONS.md', codeConventionsContent()]);
  return files;
}

export function runInit(argv, usage) {
  let options;
  try {
    options = parseInitOptions(argv);
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error), 'init');
    return;
  }

  if (!options.dryRun && existsSync(options.root)) {
    try {
      if (!statSync(options.root).isDirectory()) initError(options, 'ROOT_NOT_DIRECTORY', `Project root is not a directory: ${options.root}`);
    } catch {
      initError(options, 'ROOT_NOT_FOUND', `Project root not found: ${options.root}`);
    }
  }

  if (!options.dryRun) mkdirSync(options.root, { recursive: true });

  const actions = [];
  for (const [relativePath, content] of initFiles(options)) writeInitFile(options, relativePath, content, actions);
  for (const entry of ['docs/plan', 'docs/archive', '.dotdotgod']) ensureGitignoreEntry(options, entry, actions);

  const payload = { ok: true, command: 'init', root: options.root, projectName: options.projectName, dryRun: options.dryRun, force: options.force, dotdotSetting: options.dotdotSetting, actions };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else for (const item of actions) console.log(formatAction(item));
}
