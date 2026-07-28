import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HELP_TOKENS = new Set(['help', '--help', '-h']);
const VERSION_TOKENS = new Set(['version', '--version', '-v']);

export function commandUsage(command = 'root') {
  switch (command) {
    case 'validate':
      return `Usage:
  dotdotgod validate <root> [--include-local-memory] [--check-index] [--max-lines n] [--max-chars n] [--no-link-check] [--json]`;
    case 'init':
      return `Usage:
  dotdotgod init <root> [--project-name NAME] [--dotdot-setting] [--dry-run] [--json]

Create AGENTS.md, agent entrypoints, docs indexes, and local memory gitignore entries.`;
    case 'index':
      return `Usage:
  dotdotgod index <root> [--json]`;
    case 'config':
      return `Usage:
  dotdotgod config <root> [--json]
  dotdotgod config init <root> [--json]

Inspect or initialize the project-level dotdotgod config file.`;
    case 'config init':
      return `Usage:
  dotdotgod config init <root> [--json]

Create dotdotgod.config.json with the built-in default memory, traceability, validation, and impact ranking policy.`;
    case 'status':
      return `Usage:
  dotdotgod status <root> [--json]`;
    case 'load-snapshot':
      return `Usage:
  dotdotgod load-snapshot <root> [--json]`;
    case 'plan':
      return `Usage:
  dotdotgod plan validate docs/plan/<task-slug>/README.md [--stage stage] [--json]
  dotdotgod plan stage create <stage> [docs/plan/<task-slug>/README.md] [--json]`;
    case 'plan validate':
      return `Usage:
  dotdotgod plan validate docs/plan/<task-slug>/README.md [--stage stage] [--json]

Validates an active plan artifact before execution. Supports simplified Plan Generator stages and optional .dotdotgod-plan/NN_STAGE_NAME.md workspaces. Use --stage with a stage name or numeric prefix such as 04 or 05 to validate only that stage.`;
    case 'plan stage':
      return `Usage:
  dotdotgod plan stage create <stage> [docs/plan/<task-slug>/README.md] [--json]`;
    case 'plan stage create':
      return `Usage:
  dotdotgod plan stage create <stage> [docs/plan/<task-slug>/README.md] [--json]

Creates the matching .dotdotgod-plan/NN_STAGE_NAME.md internal stage checkpoint for a simplified Plan Generator stage. <stage> accepts a numeric prefix such as 02 or a canonical stage name such as 02-context-load. If the plan path is omitted, exactly one active docs/plan/<task-slug>/README.md candidate must exist.`;
    case 'resolve':
      return `Usage:
  dotdotgod resolve <root> <ref> [--max-results n] [--include-archive] [--json]`;
    case 'expand':
      return `Usage:
  dotdotgod expand <root> <prompt> [--max-results n] [--include-archive] [--with-impact] [--fuzzy] [--json]`;
    case 'trello':
      return `Usage:
  dotdotgod trello sync <root> [--dry-run]`;
    case 'trello sync':
      return `Usage:
  dotdotgod trello sync <root> [--dry-run]

Options:
  --dry-run  Preview planned Trello updates without calling Trello APIs.

Write mode:
  Omit --dry-run only in the trusted GitHub Actions default-branch push workflow.
  Requires TRELLO_API_KEY and TRELLO_TOKEN in the trusted workflow environment.
  Local/manual and pull request usage should run --dry-run.`;
    case 'traceability':
      return `Usage:
  dotdotgod traceability links <root> [--check|--write] [--json]`;
    case 'traceability links':
      return `Usage:
  dotdotgod traceability links <root> [--check|--write] [--json]

Checks or writes generated Markdown traceability link sections from canonical fenced json dotdotgod blocks.`;
    case 'graph':
      return `Usage:
  dotdotgod graph impact <root> --changed <path> [--changed <path> ...] [--compact|--json|--yml|--yaml]
  dotdotgod graph communities <root> [--json]`;
    case 'graph impact':
      return `Usage:
  dotdotgod graph impact <root> --changed <path> [--changed <path> ...] [--compact|--json|--yml|--yaml]

Ranks nodes related to one or more changed files. <root> is the project root; repeat --changed with project-relative file paths. Results include a combined ranking and the top five related nodes for each changed file. Use --compact for a short text summary or --yml/--yaml for structured agent-facing output.`;
    case 'graph communities':
      return `Usage:
  dotdotgod graph communities <root> [--json]`;
    default:
      return `Usage:
  dotdotgod [--help|-h]
  dotdotgod [--version|-v]
  dotdotgod help [command]
  dotdotgod validate <root> [--include-local-memory] [--check-index] [--max-lines n] [--max-chars n] [--no-link-check] [--json]
  dotdotgod init <root> [--project-name NAME] [--dotdot-setting] [--dry-run] [--json]
  dotdotgod index <root> [--json]
  dotdotgod config <root> [--json]
  dotdotgod config init <root> [--json]
  dotdotgod status <root> [--json]
  dotdotgod load-snapshot <root> [--json]
  dotdotgod resolve <root> <ref> [--max-results n] [--include-archive] [--json]
  dotdotgod expand <root> <prompt> [--max-results n] [--include-archive] [--with-impact] [--fuzzy] [--json]
  dotdotgod traceability links <root> [--check|--write] [--json]
  dotdotgod plan validate docs/plan/<task-slug>/README.md [--stage stage] [--json]
  dotdotgod plan stage create <stage> [docs/plan/<task-slug>/README.md] [--json]
  dotdotgod trello sync <root> [--dry-run]
  dotdotgod graph impact <root> --changed <path> [--changed <path> ...] [--compact|--json|--yml|--yaml]
  dotdotgod graph communities <root> [--json]`;
  }
}

export function usage(message, command = 'root') {
  const text = commandUsage(command);
  if (message) {
    console.error(message);
    console.error(text);
    process.exit(2);
  }
  console.log(text);
  process.exit(0);
}

export function isHelpToken(value) {
  return HELP_TOKENS.has(value);
}

export function hasHelpToken(argv) {
  return argv.some((arg) => isHelpToken(arg));
}

export function isVersionToken(value) {
  return VERSION_TOKENS.has(value);
}

export function printVersion() {
  let version = 'unknown';
  try {
    const data = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    if (typeof data.version === 'string') version = data.version;
  } catch {
    // keep 'unknown'
  }
  console.log(version);
  process.exit(0);
}

export function helpCommandFromArgs(args) {
  const nonHelp = args.filter((arg) => !isHelpToken(arg));
  if (nonHelp[0] === 'graph' && nonHelp[1]) return `graph ${nonHelp[1]}`;
  if (nonHelp[0] === 'trello' && nonHelp[1]) return `trello ${nonHelp[1]}`;
  if (nonHelp[0] === 'traceability' && nonHelp[1]) return `traceability ${nonHelp[1]}`;
  if (nonHelp[0] === 'plan' && nonHelp[1] === 'stage' && nonHelp[2] === 'create') return 'plan stage create';
  if (nonHelp[0] === 'plan' && nonHelp[1] === 'stage') return 'plan stage';
  if (nonHelp[0] === 'plan' && nonHelp[1]) return `plan ${nonHelp[1]}`;
  if (nonHelp[0] === 'config' && nonHelp[1] === 'init') return 'config init';
  return nonHelp[0] ?? 'root';
}

export function parseCommon(argv) {
  const options = { root: '.', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-') && options.root === '.') options.root = arg;
  }
  options.root = resolve(options.root);
  return options;
}

