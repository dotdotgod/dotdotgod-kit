import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

function assertWithinRoot(base, target, candidate) {
  const rel = relative(base, target);
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error(`Path escapes project root: ${candidate}`);
  }
}

export function resolveWithinRoot(root, candidate = '.') {
  const base = resolve(root || process.cwd());
  const target = resolve(base, candidate);
  assertWithinRoot(base, target, candidate);
  return target;
}

export function resolveExistingWithinRoot(root, candidate = '.') {
  const base = realpathSync(resolve(root || process.cwd()));
  const target = realpathSync(resolveWithinRoot(base, candidate));
  assertWithinRoot(base, target, candidate);
  return target;
}
