import { resolve } from 'node:path';
import { buildDocumentationMap } from '../memory/documentation-map.mjs';

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
  const result = buildDocumentationMap(options.root, { depth: options.depth });
  if (!result.ok) fail(options.json, result.error.code, result.error.message);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.tree);
}
