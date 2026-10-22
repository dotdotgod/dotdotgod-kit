import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { LANGUAGE_EXTENSIONS } from './languages.mjs';

const require = createRequire(import.meta.url);
export function languageAsset(language) {
  const patched = fileURLToPath(new URL(`./parsers/tree-sitter-${language}.wasm`, import.meta.url));
  return existsSync(patched) ? patched : join(dirname(parserEntry()), `tree-sitter-${language}.wasm`);
}
export function parserEntry() {
  const bundled = fileURLToPath(new URL('./parsers/tree-sitter.cjs', import.meta.url));
  return existsSync(bundled) ? bundled : require.resolve('@vscode/tree-sitter-wasm');
}
let identity;
export function parserIdentity() {
  if (!identity) {
    const entry = parserEntry();
    const hash = createHash('sha256').update(readFileSync(entry));
    hash.update(readFileSync(join(dirname(entry), 'tree-sitter.wasm')));
    for (const language of Object.keys(LANGUAGE_EXTENSIONS)) hash.update(language).update(readFileSync(languageAsset(language)));
    identity = hash.digest('hex');
  }
  return identity;
}
export function loadParserApi() { return require(parserEntry()); }
