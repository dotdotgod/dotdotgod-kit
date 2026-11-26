import { resolve } from 'node:path';
import { buildDocumentationMap as readDocumentationMap } from '../memory/documentation-map.mjs';

export class DotdotgodServiceError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'DotdotgodServiceError';
    this.code = code;
  }

  static from(error, code) {
    if (error instanceof DotdotgodServiceError) return error;
    return new DotdotgodServiceError(error?.code ?? code, error instanceof Error ? error.message : String(error), { cause: error });
  }
}

export function buildDocumentationMap(root, { depth, signal } = {}) {
  signal?.throwIfAborted();
  const result = readDocumentationMap(root, { depth });
  if (!result.ok) throw new DotdotgodServiceError(result.error.code, result.error.message);
  return result;
}

function fail(json, code, message) {
  if (json) console.log(JSON.stringify({ ok: false, error: { code, message } }, null, 2));
  else console.error(message);
  process.exit(2);
}

function parseMapOptions(argv) {
  const options = { root: '.', depth: 5, json: false };
  let rootSet = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') continue;
    if (arg === '--depth') {
      const value = argv[index + 1];
      if (!value || !/^\d+$/.test(value) || Number(value) < 1) fail(options.json, 'INVALID_DEPTH', '--depth requires a positive integer.');
      options.depth = Number(value);
      index += 1;
    } else if (!arg.startsWith('-') && !rootSet) {
      options.root = arg;
      rootSet = true;
    } else if (!arg.startsWith('-')) fail(options.json, 'UNEXPECTED_ARGUMENT', `Unexpected argument: ${arg}`);
    else fail(options.json, 'UNKNOWN_OPTION', `Unknown option: ${arg}`);
  }
  options.root = resolve(options.root);
  return options;
}

export function runMap(argv) {
  const options = parseMapOptions(argv);
  let result;
  try { result = buildDocumentationMap(options.root, { depth: options.depth }); }
  catch (error) {
    if (!(error instanceof DotdotgodServiceError)) throw error;
    return fail(options.json, error.code, error.message);
  }
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.tree);
}
