import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const cli = require.resolve('@dotdotgod/cli/bin/dotdotgod.mjs');

function markdownTree(root, maxDepth = 5) {
  const docs = resolve(root, 'docs');
  if (!existsSync(docs)) return [];
  const output = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) { output.push(`${'  '.repeat(depth - 1)}- ${relative(root, path)}/`); walk(path, depth + 1); }
      else if (entry.isFile() && entry.name.endsWith('.md')) output.push(`${'  '.repeat(depth - 1)}- ${relative(root, path)}`);
    }
  }
  walk(docs, 1);
  return output;
}

async function cliJson(args, cwd) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8');
      if (code !== 0) return reject(new Error(Buffer.concat(stderr).toString('utf8') || out || `dotdotgod exited ${code}`));
      try { resolvePromise(JSON.parse(out)); } catch { reject(new Error(`Expected JSON from dotdotgod: ${out.slice(0, 500)}`)); }
    });
  });
}

export async function projectLoad(input) {
  const root = resolve(input.root || process.cwd());
  const focus = input.focus?.trim() ?? '';
  const tree = markdownTree(root, input.maxDepth ?? (focus ? 3 : 5));
  let query = null;
  let queryUnavailable;
  if (focus) {
    try {
      query = await cliJson(['query', root, focus, '--limit', String(Math.min(input.limit ?? 30, 30)), '--json'], root);
    } catch (error) {
      const missingRuntime = String(error?.message ?? error).includes('Optional local embedding runtime is not installed');
      queryUnavailable = missingRuntime ? {
        code: 'EMBEDDING_RUNTIME_MISSING',
        message: 'Local semantic search requires an optional embedding runtime; continue with the documentation map or ask the user before installation.',
        recovery: { kind: 'embedding-runtime-install', requiresConfirmation: true, statusTool: 'dotdotgod_embedding_status', installTool: 'dotdotgod_embedding_install', cliCommand: 'dotdotgod embedding install --confirm' },
      } : {
        code: 'QUERY_UNAVAILABLE',
        message: 'Semantic project query is unavailable; continue with the documentation map and targeted reads.',
      };
    }
  }
  return { ok: true, root, focus, documentationTree: tree, query, ...(queryUnavailable ? { queryUnavailable } : {}) };
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
  args.push('--json');
  return await cliJson(args, root);
}

export async function projectInitialize(input) {
  const root = resolve(input.root || process.cwd());
  const dryRun = input.dryRun !== false;
  if (!dryRun && input.confirmWrite !== true) throw new Error('confirmWrite: true is required when dryRun is false');
  const args = ['init', root, '--json'];
  if (dryRun) args.push('--dry-run');
  if (input.projectName) args.push('--project-name', input.projectName);
  if (input.template) args.push('--template', input.template);
  if (input.dotdotSetting) args.push('--dotdot-setting');
  return await cliJson(args, root);
}
