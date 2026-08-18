import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const DEFAULT_LIMITS = Object.freeze({
  maxDepth: 16,
  maxVisitedEntries: 10_000,
  maxFiles: 1_000,
  maxFileBytes: 25 * 1024 * 1024,
  maxAggregateBytes: 100 * 1024 * 1024,
});

function inside(base, target) {
  const rel = relative(base, target);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function relativePath(base, target) {
  return relative(base, target).split(sep).join('/');
}

function boundedInteger(value, fallback, name) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 0) throw new TypeError(`${name} must be a non-negative safe integer`);
  return selected;
}

function normalizeOptions(options) {
  const includeExtensions = options.includeExtensions?.map((value) => {
    const extension = String(value).toLowerCase();
    return extension.startsWith('.') ? extension : `.${extension}`;
  });
  const excludePaths = (options.excludePaths ?? []).map((value) => {
    const normalized = String(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
    if (!normalized || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
      throw new TypeError(`Invalid excluded path: ${value}`);
    }
    return normalized;
  });
  return {
    includeExtensions: includeExtensions ? new Set(includeExtensions) : null,
    excludePaths,
    followFileSymlinks: options.followFileSymlinks === true,
    maxDepth: boundedInteger(options.maxDepth, DEFAULT_LIMITS.maxDepth, 'maxDepth'),
    maxVisitedEntries: boundedInteger(options.maxVisitedEntries, DEFAULT_LIMITS.maxVisitedEntries, 'maxVisitedEntries'),
    maxFiles: boundedInteger(options.maxFiles, DEFAULT_LIMITS.maxFiles, 'maxFiles'),
    maxFileBytes: boundedInteger(options.maxFileBytes, DEFAULT_LIMITS.maxFileBytes, 'maxFileBytes'),
    maxAggregateBytes: boundedInteger(options.maxAggregateBytes, DEFAULT_LIMITS.maxAggregateBytes, 'maxAggregateBytes'),
  };
}

function excluded(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function extensionAllowed(path, extensions) {
  if (!extensions) return true;
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash && extensions.has(path.slice(dot).toLowerCase());
}

function snapshot(path, target, stat, symlink) {
  return {
    path,
    absolutePath: target,
    size: stat.size,
    identity: { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs },
    symlink,
  };
}

export function walkDirectoryManifest(options = {}) {
  const root = realpathSync(resolve(options.root || process.cwd()));
  const requested = resolve(root, options.path ?? '.');
  if (!inside(root, requested)) throw new Error(`Directory escapes project root: ${options.path}`);
  if (lstatSync(requested).isSymbolicLink()) throw new Error(`Directory symlinks are not followed: ${options.path ?? '.'}`);
  const directory = realpathSync(requested);
  if (!inside(root, directory)) throw new Error(`Directory escapes project root: ${options.path}`);
  if (!statSync(directory).isDirectory()) throw new Error(`Not a directory: ${options.path ?? '.'}`);

  const policy = normalizeOptions(options);
  const files = [];
  const skipped = [];
  const failed = [];
  let visitedEntries = 0;
  let aggregateBytes = 0;
  let aborted = false;
  let truncated = false;

  function skip(path, reason) { skipped.push({ path, reason }); }
  function fail(path, reason) { failed.push({ path, reason }); }

  function visit(current, depth) {
    if (aborted || options.signal?.aborted) { aborted = true; return; }
    let names;
    try { names = readdirSync(current).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); }
    catch { fail(relativePath(root, current), 'directory-read-failed'); return; }

    for (const name of names) {
      if (options.signal?.aborted) { aborted = true; return; }
      const absolutePath = resolve(current, name);
      const path = relativePath(root, absolutePath);
      if (visitedEntries >= policy.maxVisitedEntries) { skip(path, 'visited-entry-limit'); truncated = true; return; }
      visitedEntries += 1;
      if (excluded(path, policy.excludePaths)) { skip(path, 'excluded-path'); continue; }

      let entry;
      try { entry = lstatSync(absolutePath); }
      catch { fail(path, 'entry-stat-failed'); continue; }

      if (entry.isSymbolicLink()) {
        let target;
        let targetStat;
        try {
          target = realpathSync(absolutePath);
          if (!inside(root, target)) { skip(path, 'symlink-outside-root'); continue; }
          targetStat = statSync(target);
        } catch { skip(path, 'symlink-unresolvable'); continue; }
        if (targetStat.isDirectory()) { skip(path, 'directory-symlink'); continue; }
        if (!policy.followFileSymlinks) { skip(path, 'file-symlink'); continue; }
        if (!targetStat.isFile()) { skip(path, 'special-file'); continue; }
        addFile(path, target, targetStat, true);
        continue;
      }

      if (entry.isDirectory()) {
        if (depth >= policy.maxDepth) { skip(path, 'depth-limit'); continue; }
        visit(absolutePath, depth + 1);
        if (aborted || truncated) return;
        continue;
      }
      if (!entry.isFile()) { skip(path, 'special-file'); continue; }
      addFile(path, absolutePath, entry, false);
    }
  }

  function addFile(path, absolutePath, stat, symlink) {
    if (!extensionAllowed(path, policy.includeExtensions)) { skip(path, 'extension-filter'); return; }
    if (stat.size > policy.maxFileBytes) { skip(path, 'file-byte-limit'); return; }
    if (files.length >= policy.maxFiles) { skip(path, 'file-count-limit'); return; }
    if (aggregateBytes + stat.size > policy.maxAggregateBytes) { skip(path, 'aggregate-byte-limit'); return; }
    files.push(snapshot(path, absolutePath, stat, symlink));
    aggregateBytes += stat.size;
  }

  visit(directory, 0);
  return { root, directory, files, skipped, failed, aborted, truncated, visitedEntries, aggregateBytes };
}

export function verifyManifestFile(entry, root) {
  const base = realpathSync(resolve(root));
  const target = realpathSync(entry.absolutePath);
  if (!inside(base, target)) throw new Error(`Manifest file escapes project root: ${entry.path}`);
  const stat = statSync(target);
  const identity = entry.identity ?? {};
  if (!stat.isFile()) throw new Error(`Manifest entry is not a regular file: ${entry.path}`);
  if (stat.dev !== identity.dev || stat.ino !== identity.ino || stat.size !== identity.size || stat.mtimeMs !== identity.mtimeMs) {
    throw new Error(`Manifest file changed before indexing: ${entry.path}`);
  }
  return target;
}

export { DEFAULT_LIMITS as DIRECTORY_INGESTION_LIMITS };
