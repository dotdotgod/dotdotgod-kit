import { spawnSync } from 'node:child_process';
import { constants, lstatSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import ignore from 'ignore';
import { collectIndexFiles, isExcludedIndexDir, shouldIndexPath } from '../index/files.mjs';
import { isSecretLikePathPattern, matchPathPattern, readMemoryConfig } from '../memory/config.mjs';
import { checkedDocumentationRoot, discoverDocumentation } from '../memory/documentation-map.mjs';
import { chunkMarkdown, textFingerprint } from '../query/chunks.mjs';
import { languageForPath, SOURCE_EXTENSIONS } from '../symbols/languages.mjs';

export function containedStat(root, path, kind = 'file') {
  const segments = path.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..') || /[\\\0]/.test(path)) return null;
  let target = root;
  for (let i = 0; i < segments.length; i += 1) {
    target = join(target, segments[i]);
    const stat = lstatSync(target, { throwIfNoEntry: false, bigint: true });
    if (i === segments.length - 1) return (kind === 'directory' ? stat?.isDirectory() : stat?.isFile())
      ? { mtime_ms: Number(stat.mtimeNs) / 1e6, size: Number(stat.size), ino: String(stat.ino) } : null;
    if (!stat?.isDirectory()) break;
  }
  return null;
}
export const sameStat = (a, b) => Boolean(a && b && a.mtime_ms === b.mtime_ms && a.size === b.size && a.ino === b.ino);

export function pathEligibility(root, config, scope) {
  const ruleCache = new Map();
  function rules(directory) {
    if (!ruleCache.has(directory)) {
      const path = `${directory ? `${directory}/` : ''}.gitignore`;
      const stat = containedStat(root, path);
      const source = stat ? readFileSync(join(root, path), { encoding: 'utf8', flag: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK }) : '';
      if (stat && !sameStat(stat, containedStat(root, path))) throw new Error('Ignore policy changed during indexing.');
      ruleCache.set(directory, ignore().add(source));
    }
    return ruleCache.get(directory);
  }
  return (path, corpus) => {
    const parts = path.split('/');
    if (/[\\\x00-\x1f\x7f]/.test(path) || parts.some((part) => !part || part.startsWith('.')) || isExcludedIndexDir(path) || isSecretLikePathPattern(path)) return false;
    if (corpus === 'docs' && (!path.startsWith(`${config.documentation.root}/`) || !path.toLowerCase().endsWith('.md'))) return false;
    if (corpus === 'code' && (!SOURCE_EXTENSIONS.has(extname(path)) || !shouldIndexPath(path, config))) return false;
    const exclude = scope === 'outline' ? [] : config.load.documentationSummary.exclude;
    if (exclude.some((pattern) => matchPathPattern(path, pattern) || path.startsWith(`${pattern}/`))) return false;
    let ignored = false;
    for (let depth = 0; depth < parts.length; depth += 1) {
      const rule = rules(parts.slice(0, depth).join('/'));
      for (let end = depth + 1; end < parts.length; end += 1) {
        if (rule.ignores(`${parts.slice(depth, end).join('/')}/`)) return false;
      }
      const result = rule.test(parts.slice(depth).join('/') + (corpus === 'directory' ? '/' : ''));
      if (result.ignored) ignored = true;
      else if (result.unignored) ignored = false;
    }
    return !ignored;
  };
}

export function inspectFile(root, path, old, { code = false, verify = false } = {}) {
  const stat = containedStat(root, path);
  if (!stat) return null;
  if (!verify && sameStat(stat, old)) return { ...stat, path, hash: old.sha256, language: old.language,
    lineCount: old.line_count, sourceLength: old.source_length };
  const bytes = readFileSync(join(root, path), { flag: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK });
  if (!sameStat(stat, containedStat(root, path))) throw new Error(`Source changed during indexing: ${path}`);
  const source = bytes.toString('utf8');
  if (code && /^#![^\n]*\n\/\/ Generated|^\/\/ Generated|@generated/m.test(source.slice(0, 256))) return null;
  return { ...stat, path, source, hash: textFingerprint(bytes), language: code ? languageForPath(path) : null,
    lineCount: source.split('\n').length, sourceLength: source.length };
}

const git = (root, args, timeout) => {
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, ...args],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout, killSignal: 'SIGKILL' });
  return result.status === 0 ? result.stdout : null;
};
export function gitChanges(root, store, prefix = '', timeout) {
  const head = git(root, ['rev-parse', '--verify', 'HEAD'], timeout)?.trim();
  if (!head || git(root, ['rev-parse', '--show-prefix'], timeout) !== '\n') return { head: null };
  const previous = store.meta(`${prefix}last_git_head`);
  const status = git(root, ['status', '--porcelain', '-z', '--no-renames', '--untracked-files=all'], timeout);
  const dirty = status?.split('\0').filter(Boolean).map((row) => row.slice(3));
  if (!previous || !/^[a-f0-9]{40,64}$/.test(previous) || !dirty) return { head, dirty };
  const diff = git(root, ['diff', '--no-renames', '--name-status', '-z', previous, '--'], timeout);
  if (diff === null) return { head, dirty };
  const paths = new Set([...dirty, ...JSON.parse(store.meta(`${prefix}last_git_dirty`) ?? '[]')]);
  for (const [i, path] of diff.split('\0').entries()) if (i % 2 && path) paths.add(path);
  return { head, dirty, paths };
}

export function codePaths(root, config) {
  return collectIndexFiles(root, config).map((file) => relative(root, file).replaceAll('\\', '/'));
}

function visitDocs(root, store, config, visit, remove, fastPaths, selected = () => true) {
  const docs = config.documentation.root;
  const eligible = pathEligibility(root, config, 'docs');
  const allowPath = (path) => selected(path) && eligible(path, 'docs');
  const old = fastPaths ? null : new Map((store?.files('doc') ?? []).map((file) => [file.path, file]));
  const base = checkedDocumentationRoot(root, docs);
  const paths = fastPaths ?? (base ? discoverDocumentation(base, docs, config.load.documentationSummary.exclude, { allowPath: (path) => allowPath(path, 'docs') }) : []);
  for (const path of paths) {
    const previous = fastPaths ? store.file(path) : old.get(path);
    old?.delete(path);
    const file = base && allowPath(path, 'docs') && inspectFile(base, path, previous);
    if (file) visit(file, !sameStat(file, previous));
    else if (previous?.kind === 'doc') remove?.(path);
  }
  for (const path of old?.keys() ?? []) remove?.(path);
}
export const docChunks = (file) => chunkMarkdown(file.path, file.source).map((chunk) => ({ ...chunk, kind: 'document' }));

export function documentationChunks(root, config, store, selected = () => true) {
  if (!store) {
    const docs = config.documentation.root;
    const base = checkedDocumentationRoot(root, docs);
    if (!base) return [];
    const eligible = pathEligibility(base, config, 'docs');
    return [...discoverDocumentation(base, docs, config.load.documentationSummary.exclude, { allowPath: (path) => selected(path) && eligible(path, 'docs') })]
      .filter((path) => containedStat(base, path))
      .flatMap((path) => docChunks({ path, source: readFileSync(join(base, path), { encoding: 'utf8', flag: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK }) }));
  }
  const result = [];
  visitDocs(root, store, config, (file, changed) => {
    result.push(...(changed ? docChunks(file) : store.chunks(file.path)));
  }, undefined, undefined, selected);
  return result;
}

export function refreshDocs(root, store, config = readMemoryConfig(root), inTransaction = false) {
  const git = gitChanges(root, store, 'docs_');
  const policy = JSON.stringify([config.documentation.root, config.load.documentationSummary.exclude]);
  const fast = policy === store.meta('docs_policy') && git.paths && ![...git.paths].some((path) => path.split('/').at(-1) === '.gitignore');
  visitDocs(root, store, config, (file, changed) => {
    if (changed) store[inTransaction ? 'replaceFile' : 'upsertFile']({ ...file, kind: 'doc', status: 'parsed' }, [], docChunks(file));
  }, inTransaction ? undefined : (path) => store.deleteFile(path), fast ? git.paths : undefined);
  const publish = () => {
    store.setMeta('docs_root', config.documentation.root);
    store.setMeta('docs_policy', policy);
    store.setMeta('docs_last_git_head', git.head ?? '');
    store.setMeta('docs_last_git_dirty', JSON.stringify(git.dirty ?? []));
  };
  if (inTransaction) publish();
  else store.transaction(publish);
}
