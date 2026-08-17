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
  const tree = markdownTree(root, input.maxDepth ?? (input.focus ? 3 : 5));
  let query = null;
  if (input.focus?.trim()) query = await cliJson(['query', root, input.focus.trim(), '--limit', String(Math.min(input.limit ?? 30, 30)), '--json'], root);
  return { ok: true, root, focus: input.focus?.trim() ?? '', documentationTree: tree, query };
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
