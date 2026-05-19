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
  dotdotgod init <root> [--project-name NAME] [--dotdot-setting] [--force] [--dry-run] [--json]

Create AGENTS.md, agent entrypoints, docs indexes, and local memory gitignore entries.`;
    case 'index':
      return `Usage:
  dotdotgod index <root> [--json]`;
    case 'config':
      return `Usage:
  dotdotgod config <root> [--json]
  dotdotgod config init <root> [--force] [--json]

Inspect or initialize the project-level dotdotgod config file.`;
    case 'config init':
      return `Usage:
  dotdotgod config init <root> [--force] [--json]

Create dotdotgod.config.json with the built-in default memory, traceability, validation, and impact ranking policy.`;
    case 'status':
      return `Usage:
  dotdotgod status <root> [--json]`;
    case 'load-snapshot':
      return `Usage:
  dotdotgod load-snapshot <root> [--json]`;
    case 'resolve':
      return `Usage:
  dotdotgod resolve <root> <ref> [--max-results n] [--include-archive] [--json]`;
    case 'expand':
      return `Usage:
  dotdotgod expand <root> <prompt> [--max-results n] [--include-archive] [--with-impact] [--fuzzy] [--json]`;
    case 'graph':
      return `Usage:
  dotdotgod graph impact <root> --changed <path> [--compact|--json|--yml|--yaml]
  dotdotgod graph communities <root> [--json]`;
    case 'graph impact':
      return `Usage:
  dotdotgod graph impact <root> --changed <path> [--compact|--json|--yml|--yaml]

Ranks nodes related to a changed file. <root> is the project root; --changed is a project-relative file path. Use --compact for a short text summary or --yml/--yaml for structured agent-facing output.`;
    case 'graph communities':
      return `Usage:
  dotdotgod graph communities <root> [--json]`;
    default:
      return `Usage:
  dotdotgod [--help|-h]
  dotdotgod [--version|-v]
  dotdotgod help [command]
  dotdotgod validate <root> [--include-local-memory] [--check-index] [--max-lines n] [--max-chars n] [--no-link-check] [--json]
  dotdotgod init <root> [--project-name NAME] [--dotdot-setting] [--force] [--dry-run] [--json]
  dotdotgod index <root> [--json]
  dotdotgod config <root> [--json]
  dotdotgod config init <root> [--force] [--json]
  dotdotgod status <root> [--json]
  dotdotgod load-snapshot <root> [--json]
  dotdotgod resolve <root> <ref> [--max-results n] [--include-archive] [--json]
  dotdotgod expand <root> <prompt> [--max-results n] [--include-archive] [--with-impact] [--fuzzy] [--json]
  dotdotgod graph impact <root> --changed <path> [--compact|--json|--yml|--yaml]
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

export function readCliVersion() {
  try {
    const data = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return typeof data.version === 'string' ? data.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function printVersion() {
  console.log(readCliVersion());
  process.exit(0);
}

export function helpCommandFromArgs(args) {
  const nonHelp = args.filter((arg) => !isHelpToken(arg));
  if (nonHelp[0] === 'graph' && nonHelp[1]) return `graph ${nonHelp[1]}`;
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

