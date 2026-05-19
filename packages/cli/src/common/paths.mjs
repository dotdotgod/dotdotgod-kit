import { relative } from 'node:path';

export function rel(root, file) {
  return relative(root, file).replaceAll('\\', '/');
}

