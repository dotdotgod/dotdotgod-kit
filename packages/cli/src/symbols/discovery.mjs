import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { extname, join, relative, isAbsolute } from 'node:path';
import ignore from 'ignore';
import { collectIndexFiles, fingerprint } from '../index/files.mjs';
import { readMemoryConfig, isSecretLikePathPattern } from '../memory/config.mjs';
import { textFingerprint } from '../query/chunks.mjs';
import { EXTRACTOR_ID, DECLARATIONS, LANGUAGE_EXTENSIONS, languageForPath, SOURCE_EXTENSIONS } from './languages.mjs';
import { parserIdentity } from './runtime.mjs';

function inside(root, file) {
  if (!lstatSync(file).isFile()) return false;
  const path = relative(realpathSync(root), realpathSync(file));
  return !path.startsWith('..') && !isAbsolute(path);
}
function ignoreRules(root, directory, cache) {
  if (!cache.has(directory)) {
    const file = join(root, directory, '.gitignore');
    cache.set(directory, ignore().add(existsSync(file) && inside(root, file) ? readFileSync(file, 'utf8') : ''));
  }
  return cache.get(directory);
}
function ignored(root, path, cache) {
  const parts = path.split('/');
  let excluded = false;
  for (let depth = 0; depth < parts.length; depth += 1) {
    const directory = parts.slice(0, depth).join('/');
    const remaining = parts.slice(depth).join('/');
    const rules = ignoreRules(root, directory, cache);
    // An ignored directory cannot be re-included by a rule inside it.
    for (let end = 1; end < parts.length - depth; end += 1) {
      if (rules.ignores(parts.slice(depth, depth + end).join('/') + '/')) return true;
    }
    const result = rules.test(remaining);
    if (result.ignored) excluded = true;
    else if (result.unignored) excluded = false;
  }
  return excluded;
}
export function sourceFiles(root) {
  const cache = new Map();
  return collectIndexFiles(root).filter((file) => {
    const path = relative(root, file).replaceAll('\\', '/');
    if (!SOURCE_EXTENSIONS.has(extname(path)) || path.split('/').some((part) => part.startsWith('.')) || isSecretLikePathPattern(path)) return false;
    if (!inside(root, file) || ignored(root, path, cache)) return false;
    return !/^#![^\n]*\n\/\/ Generated|^\/\/ Generated|@generated/m.test(readFileSync(file, 'utf8').slice(0, 256));
  }).map((file) => {
    const source = readFileSync(file, 'utf8');
    return { path: relative(root, file).replaceAll('\\', '/'), hash: fingerprint(file), language: languageForPath(file), sourceLength: source.length, lineCount: source.split('\n').length };
  });
}
export function outlinePolicy(root) {
  const config = readMemoryConfig(root);
  const ignores = collectIndexFiles(root).filter((file) => file.endsWith('/.gitignore') && inside(root, file)).map((file) => [relative(root, file), fingerprint(file)]);
  return textFingerprint(JSON.stringify({ areas: config.areas, ignores, extractor: EXTRACTOR_ID, declarations: DECLARATIONS, extensions: LANGUAGE_EXTENSIONS, parser: parserIdentity() }));
}
