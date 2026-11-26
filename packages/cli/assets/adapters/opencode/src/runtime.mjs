import { accessSync, closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const unsafePath = /[\u0000-\u001f\u007f-\u009f]/u;

function readBinding() {
  const file = new URL('../runtime.json', import.meta.url);
  const original = lstatSync(file);
  if (!original.isFile()) return null;
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.dev !== original.dev || stat.ino !== original.ino) return null;
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}

function pathCli() {
  for (const part of (process.env.PATH ?? '').split(delimiter)) {
    if (!part) continue;
    const candidate = resolve(part, 'dotdotgod');
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Keep looking only until the first executable candidate.
    }
  }
  return null;
}

function absoluteSafe(path) {
  return typeof path === 'string' && isAbsolute(path) && !unsafePath.test(path);
}

function resolveRuntime() {
  try {
    const binding = readBinding();
    let candidate;
    let node;
    if (binding?.mode === 'pinned' && Object.keys(binding).length === 3
      && absoluteSafe(binding.nodePath) && absoluteSafe(binding.cliEntry)) {
      node = realpathSync(binding.nodePath);
      accessSync(node, constants.X_OK);
      if (!absoluteSafe(node) || !statSync(node).isFile()) return null;
      candidate = binding.cliEntry;
    } else if (binding?.mode === 'path' && Object.keys(binding).length === 2 && binding.command === 'dotdotgod') {
      candidate = pathCli();
    }
    if (!absoluteSafe(candidate)) return null;
    const cli = realpathSync(candidate);
    if (!absoluteSafe(cli) || basename(cli) !== 'dotdotgod.mjs' || basename(dirname(cli)) !== 'bin' || !statSync(cli).isFile()) return null;
    const root = dirname(dirname(cli));
    const manifest = join(root, 'package.json');
    const module = join(root, 'src/context/opencode-runtime.mjs');
    if (realpathSync(manifest) !== manifest || !statSync(manifest).isFile()
      || JSON.parse(readFileSync(manifest, 'utf8')).name !== '@dotdotgod/cli'
      || realpathSync(module) !== module || !statSync(module).isFile()) return null;
    return { module: pathToFileURL(module).href, argv: node ? [node, cli] : [cli] };
  } catch {
    return null;
  }
}

export async function loadRuntime() {
  const binding = resolveRuntime();
  if (!binding) return { argv: null, advisory: null };
  const { argv, module } = binding;
  try {
    const { ImpactState, impactReminder, isInitializedProject, validateSessionId, evaluateLoadDecision,
      formatDecisionError, formatDecisionInjection } = await import(module);
    const runtime = { ImpactState, impactReminder, isInitializedProject, validateSessionId, evaluateLoadDecision,
      formatDecisionError, formatDecisionInjection };
    return { argv, advisory: Object.values(runtime).every((fn) => typeof fn === 'function') ? runtime : null };
  } catch {
    return { argv, advisory: null };
  }
}
