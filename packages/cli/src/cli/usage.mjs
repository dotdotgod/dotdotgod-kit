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
    case 'query':
      return `Usage:
  dotdotgod query <root> <query> [--limit n] [--json]

Search shared project documentation with the local multilingual E5 vector index.`;
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
      return `dotdotgod is a project memory CLI for AI agents.

Usage:
  dotdotgod <command> [options]
  dotdotgod help <command>

Commands:
  init                  Initialize project memory files.
  config                Inspect or initialize project configuration.
  query                 Search project documentation.
  resolve               Resolve a project reference.
  expand                Expand references in a prompt.
  validate              Validate project memory and documentation.
  index                 Build or refresh the local index.
  status                Show local index status.
  traceability links    Check or write generated traceability links.
  graph impact          Find files related to changed files.
  graph communities     Find groups of related project-memory nodes.
  trello sync           Synchronize Trello cards and documentation.

Options:
  -h, --help            Show help.
  -v, --version         Show the version.

Run \`dotdotgod help <command>\` or \`dotdotgod <command> --help\`
for command usage and options.`;
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

