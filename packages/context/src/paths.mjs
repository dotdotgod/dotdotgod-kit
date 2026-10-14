import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

// Legacy export names: root is a relative-path default, not an access boundary.

export function resolveWithinRoot(root, candidate = '.') {
  const base = resolve(root || process.cwd());
  const target = resolve(base, candidate);
  return target;
}

export function resolveExistingWithinRoot(root, candidate = '.') {
  const base = realpathSync(resolve(root || process.cwd()));
  const target = realpathSync(resolveWithinRoot(base, candidate));
  return target;
}
