import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { usage } from '../cli/usage.mjs';
import { rel } from '../common/paths.mjs';
import { extractDotdotgodTraceabilityBlocks, syncTraceabilityLinksInContent, validateTraceabilityLinksRegion } from '../docs/traceability.mjs';

function collectDocsMarkdownFiles(root) {
  const docs = join(root, 'docs');
  const files = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
    }
  };
  walk(docs);
  return files;
}

export function parseTraceabilityOptions(argv) {
  const sub = argv[0];
  const action = argv[1];
  if (sub !== 'links') usage(sub ? `Unknown traceability command: ${sub}` : 'Missing traceability command.', 'traceability');
  const options = { root: '.', check: false, write: false, json: false };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--write') options.write = true;
    else if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-')) options.root = arg;
    else usage(`Unknown option: ${arg}`, 'traceability links');
  }
  if (action === '--check' || action === '--write' || action === '--json') {
    // no-op: action slot is an option, not a positional subcommand.
  }
  if (options.check && options.write) usage('Choose only one traceability links mode: --check or --write.', 'traceability links');
  options.check = options.check || !options.write;
  options.root = resolve(options.root);
  return options;
}

export function runTraceability(argv) {
  const options = parseTraceabilityOptions(argv);
  const files = collectDocsMarkdownFiles(options.root);
  const results = [];
  const errors = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const error of validateTraceabilityLinksRegion(content, options.root, file)) errors.push(error);
    const blocks = extractDotdotgodTraceabilityBlocks(content).filter((block) => !block.error);
    if (blocks.length === 0) continue;
    const result = syncTraceabilityLinksInContent(content, blocks.at(-1).data, options.root, file);
    if (!result.ok) {
      for (const error of result.errors ?? []) errors.push(error);
      continue;
    }
    if (options.write && result.changed) writeFileSync(file, result.content);
    if (result.changed) results.push({ file: rel(options.root, file), changed: true });
  }
  const ok = errors.length === 0 && (!options.check || results.length === 0);
  const payload = { ok, command: 'traceability links', root: options.root, mode: options.write ? 'write' : 'check', changed: results.length, files: results, errors };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else if (errors.length > 0) {
    for (const error of errors) console.log(`${error.line ? `${error.file}:${error.line}` : error.file} [${error.code}] ${error.message}`);
    console.log(`\n❌ ${errors.length} traceability link error(s)`);
  } else if (options.check && results.length > 0) {
    for (const result of results) console.log(`${result.file} [TRACEABILITY_LINKS_STALE] generated traceability links are missing or stale.`);
    console.log(`\n❌ ${results.length} traceability link file(s) need sync`);
  } else if (options.write) console.log(`traceability links: synced ${results.length} file(s)`);
  else console.log('traceability links: all generated sections are up to date');
  process.exit(ok ? 0 : 1);
}
