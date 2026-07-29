import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { usage } from '../cli/usage.mjs';
import { defaultDotdotgodConfigText, memoryConfigSummary, readMemoryConfig } from '../memory/config.mjs';

function parseConfigOptions(argv, usageKey = 'config') {
  const options = { root: '.', json: false };
  let rootSet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-') && !rootSet) {
      options.root = arg;
      rootSet = true;
    } else if (!arg.startsWith('-')) usage(`Unexpected argument: ${arg}`, usageKey);
    else usage(`Unknown option: ${arg}`, usageKey);
  }
  options.root = resolve(options.root);
  return options;
}

function configInitError(options, code, message, path = null) {
  const payload = { ok: false, command: 'config init', root: options.root, path, created: false, error: { code, message } };
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(2);
  }
  console.error(message);
  process.exit(2);
}

function formatConfigOutput(payload) {
  const errors = payload.errors ?? [];
  const lines = [`dotdotgod config: ${payload.source}${errors.length > 0 ? ' (invalid; using defaults)' : ''}`];
  lines.push(`- path: ${payload.path ?? 'none'}`);
  lines.push(`- memory areas: ${payload.config.areas.length}`);
  lines.push(`- traceability required: ${(payload.config.traceability.required ?? []).join(', ') || 'none'}`);
  lines.push(`- traceability exclude: ${(payload.config.traceability.exclude ?? []).join(', ') || 'none'}`);
  lines.push(`- validation markdown: maxLines=${payload.config.validation.markdown.maxLines}, maxChars=${payload.config.validation.markdown.maxChars}`);
  lines.push(`- validation markdown exclude: ${(payload.config.validation.markdown.exclude ?? []).join(', ') || 'none'}`);
  lines.push(`- impact ranking preset: ${payload.config.impactRanking.preset}`);
  lines.push(`- load pinned paths: ${(payload.config.load?.pinnedPaths ?? []).join(', ') || 'none'}`);
  lines.push(`- load pinned bodies: ${(payload.config.load?.pinnedBodies ?? []).join(', ') || 'none'}`);
  lines.push(`- load documentation summary exclude: ${(payload.config.load?.documentationSummary?.exclude ?? []).join(', ') || 'none'}`);
  lines.push(`- plan mode writable paths: ${(payload.config.planMode?.writablePaths ?? []).join(', ') || 'none'}`);
  lines.push(`- trello sync paths: ${(payload.config.integrations?.trello?.syncPaths ?? []).join(', ') || 'none'}`);
  const lowSignal = payload.config.referenceExpansion?.fuzzy?.lowSignal ?? { terms: [], add: [], remove: [] };
  lines.push(`- fuzzy low-signal terms: ${(lowSignal.terms ?? []).join(', ') || 'none'} (add: ${(lowSignal.add ?? []).join(', ') || 'none'}; remove: ${(lowSignal.remove ?? []).join(', ') || 'none'})`);
  if (errors.length > 0) {
    lines.push('- errors:');
    for (const error of errors) lines.push(`  - ${error.code} ${error.file}: ${error.message}`);
  }
  return lines.join('\n');
}

export function runConfig(argv) {
  const isInit = argv[0] === 'init';
  const options = parseConfigOptions(isInit ? argv.slice(1) : argv, isInit ? 'config init' : 'config');
  if (isInit) {
    if (!existsSync(options.root)) configInitError(options, 'ROOT_NOT_FOUND', `Project root not found: ${options.root}`);
    try {
      if (!statSync(options.root).isDirectory()) configInitError(options, 'ROOT_NOT_DIRECTORY', `Project root is not a directory: ${options.root}`);
    } catch {
      configInitError(options, 'ROOT_NOT_FOUND', `Project root not found: ${options.root}`);
    }
    const target = join(options.root, 'dotdotgod.config.json');
    if (existsSync(target)) configInitError(options, 'CONFIG_EXISTS', 'dotdotgod.config.json already exists.', target);
    writeFileSync(target, defaultDotdotgodConfigText());
    const payload = { ok: true, command: 'config init', root: options.root, path: target, created: true };
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else console.log(`dotdotgod config init: created ${target}`);
    return;
  }

  const config = readMemoryConfig(options.root);
  const errors = config.errors ?? [];
  const payload = { ok: errors.length === 0, command: 'config', root: options.root, source: config.source ?? 'default', path: config.source && config.source !== 'default' ? join(options.root, config.source) : null, config: memoryConfigSummary(config), errors };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(formatConfigOutput(payload));
  if (errors.length > 0) process.exit(1);
}
