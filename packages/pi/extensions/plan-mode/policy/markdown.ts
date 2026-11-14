import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { PlanPolicy } from './storage.ts';

export function canonicalPath(cwd: string, path: string): string {
  let ancestor = resolve(cwd, path);
  const suffix: string[] = [];
  for (;;) {
    try { return resolve(realpathSync(ancestor), ...suffix); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        if (lstatSync(ancestor).isSymbolicLink()) throw new Error(`Unresolved symlink: ${ancestor}`);
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError;
      }
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      suffix.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
}

function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

function forbidden(path: string): boolean {
  return extname(path).toLowerCase() !== '.md'
    || /^(AGENTS|CLAUDE|CODEX)\.md$/i.test(basename(path))
    || path.split(sep).some(part => ['.pi', '.git', 'node_modules'].includes(part));
}

export function markdownDecision(cwd: string, path: string, roots: string[], policy: PlanPolicy): 'allow' | 'approval' | 'deny' {
  if (path.split(/[\\/]/).includes('..')) return 'deny';
  const lexical = resolve(cwd, path);
  try {
    const target = canonicalPath(cwd, path);
    if (forbidden(lexical) || forbidden(target)) return 'deny';
    let escaped = false;
    const matches = (entry: string, grant: boolean): boolean => {
      const subtree = entry.endsWith('/**');
      const root = resolve(cwd, subtree ? entry.slice(0, -3) : entry);
      const canonical = canonicalPath(cwd, root);
      const lexicalMatch = subtree ? inside(root, lexical) : root === lexical;
      const canonicalMatch = subtree ? inside(canonical, target) : canonical === target;
      if (grant && lexicalMatch && !canonicalMatch) escaped = true;
      return canonicalMatch;
    };
    if (policy.markdown.deny.some(entry => matches(entry, false))) return 'deny';
    // Evaluate every root so an escape cannot be hidden by an earlier broader grant.
    const allowed = [...roots, ...policy.markdown.allow].map(entry => matches(entry, true)).some(Boolean);
    return escaped ? 'deny' : allowed ? 'allow' : 'approval';
  } catch { return 'deny'; }
}
