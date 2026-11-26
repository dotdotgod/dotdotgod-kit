import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { buildDecisionDocsMap } from '@dotdotgod/cli/src/memory/documentation-map.mjs';

const require = createRequire(import.meta.url);
const cli = require.resolve('@dotdotgod/cli/bin/dotdotgod.mjs');

async function cliText(args, cwd, signal) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8');
      if (code !== 0) return reject(new Error(Buffer.concat(stderr).toString('utf8') || out || `dotdotgod exited ${code}`));
      resolvePromise(out);
    });
  });
}

async function cliJson(args, cwd, signal) {
  const out = await cliText(args, cwd, signal);
  try { return JSON.parse(out); } catch { throw new Error(`Expected JSON from dotdotgod: ${out.slice(0, 500)}`); }
}

function embeddingRuntimeRecovery() {
  return {
    code: 'EMBEDDING_RUNTIME_MISSING',
    message: 'Semantic vectors need an optional runtime; continue with keyword/map retrieval or ask before installation.',
    recovery: { kind: 'embedding-runtime-install', requiresConfirmation: true, statusTool: 'embedding_status', installTool: 'embedding_install', cliCommand: 'dotdotgod embedding install --confirm' },
  };
}

export async function projectLoad(input) {
  const root = resolve(input.root || process.cwd());
  const focus = input.focus?.trim() ?? '';
  const { readOnly, signal, refs } = input;
  signal?.throwIfAborted();
  let documentationMap;
  try {
    documentationMap = readOnly ? buildDecisionDocsMap(root)
      : await cliJson(['map', root, '--depth', String(input.maxDepth ?? (focus ? 3 : 5)), '--json'], root, signal);
    if (!documentationMap.ok) throw new Error('MAP_UNAVAILABLE');
  } catch {
    signal?.throwIfAborted();
    return { ok: false, root, focus, documentationTree: [], query: null,
      mapUnavailable: { code: 'MAP_UNAVAILABLE', message: 'Configured documentation map is unavailable; inspect project settings and README indexes with host tools. Do not treat this as an empty project map.' } };
  }
  const tree = documentationMap.paths?.length ? documentationMap.tree.split('\n') : [];
  let query = null;
  let queryUnavailable;
  let vectorUnavailable;
  if (focus) {
    try {
      const args = ['query', root, '--limit', String(Math.min(input.limit ?? 30, 30)), '--json'];
      if (readOnly) args.push('--no-write', '--search', 'keyword', '--scope', 'shared');
      query = await cliJson([...args, '--', focus], root, signal);
      if (query.warnings?.some((warning) => warning.includes('Optional local embedding runtime is not installed'))) vectorUnavailable = embeddingRuntimeRecovery();
    } catch (error) {
      signal?.throwIfAborted();
      if (readOnly) throw error;
      const missingRuntime = String(error?.message ?? error).includes('Optional local embedding runtime is not installed');
      queryUnavailable = missingRuntime ? embeddingRuntimeRecovery() : {
        code: 'QUERY_UNAVAILABLE',
        message: 'Semantic project query is unavailable; continue with the documentation map and targeted reads.',
      };
    }
  }
  let references;
  if (readOnly && refs?.length) {
    const expanded = await cliJson(['expand', root, '--json', '--no-write', '--scope', 'shared', '--', refs.map((ref) => `[[${ref}]]`).join(' ')], root, signal);
    if (!expanded.ok) throw new Error('Reference expansion failed.');
    references = expanded.refs;
  }
  signal?.throwIfAborted();
  return { ok: true, root, focus, documentationTree: tree, documentationRoot: documentationMap.documentationRoot, query, ...(references ? { references } : {}), ...(queryUnavailable ? { queryUnavailable } : {}), ...(vectorUnavailable ? { vectorUnavailable } : {}) };
}

export async function projectEmbeddingStatus(input = {}) {
  const root = resolve(input.root || process.cwd());
  const result = await cliJson(['embedding', 'status', root, '--json'], root);
  return { ...result, ...(result.location ? { location: '~/.dotdotgod/runtime/embedding' } : {}) };
}

export async function projectEmbeddingInstall(input = {}) {
  if (input.confirm !== true) throw new Error('confirm: true is required after explicit user approval.');
  const root = resolve(input.root || process.cwd());
  const result = await cliJson(['embedding', 'install', root, '--confirm', '--json'], root);
  return { ...result, ...(result.location ? { location: '~/.dotdotgod/runtime/embedding' } : {}) };
}

export async function projectImpact(input) {
  const root = resolve(input.root || process.cwd());
  const paths = [...new Set(input.paths ?? [])];
  if (paths.length === 0) throw new Error('paths must contain at least one changed path');
  if (paths.length > 20) throw new Error('paths is limited to 20 entries per call');
  const args = ['graph', 'impact', root];
  for (const path of paths) args.push('--changed', path);
  args.push('--compact');
  return { ok: true, summary: (await cliText(args, root, input.signal)).trim() };
}

export async function projectInitialize(input) {
  const root = resolve(input.root || process.cwd());
  const dryRun = input.dryRun !== false;
  if (!dryRun && input.confirmWrite !== true) throw new Error('confirmWrite: true is required when dryRun is false');
  const args = ['init', root, '--json'];
  if (dryRun) args.push('--dry-run');
  if (input.projectName) args.push('--project-name', input.projectName);
  if (input.template) args.push('--template', input.template);
  return await cliJson(args, root);
}
