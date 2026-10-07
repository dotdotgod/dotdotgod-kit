import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { LANGUAGE_EXTENSIONS } from './languages.mjs';

const require = createRequire(import.meta.url);
export function parserEntry() {
  const bundled = fileURLToPath(new URL('./parsers/tree-sitter.cjs', import.meta.url));
  return existsSync(bundled) ? bundled : require.resolve('@vscode/tree-sitter-wasm');
}
let identity;
export function parserIdentity() {
  if (!identity) {
    const entry = parserEntry();
    const hash = createHash('sha256').update(readFileSync(entry));
    for (const name of ['tree-sitter.wasm', ...Object.keys(LANGUAGE_EXTENSIONS).map((language) => `tree-sitter-${language}.wasm`)]) hash.update(name).update(readFileSync(join(dirname(entry), name)));
    identity = hash.digest('hex');
  }
  return identity;
}
export function loadParserApi() { return require(parserEntry()); }
