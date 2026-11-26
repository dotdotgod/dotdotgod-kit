import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_DOCUMENTATION_ROOT, isSecretLikePathPattern, matchPathPattern, readMemoryConfig, resolveMemoryArea } from './config.mjs';

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.dotdotgod']);

function node() {
  return { directories: new Map(), files: [] };
}

function buildTree(paths) {
  const root = node();
  for (const path of [...new Set(paths)].sort()) {
    const parts = path.split('/');
    let current = root;
    for (const part of parts.slice(0, -1)) {
      if (!current.directories.has(part)) current.directories.set(part, node());
      current = current.directories.get(part);
    }
    current.files.push(parts.at(-1));
  }
  return root;
}

function descendantCounts(current) {
  let directories = 0;
  let files = current.files.length;
  for (const child of current.directories.values()) {
    directories += 1;
    const nested = descendantCounts(child);
    directories += nested.directories;
    files += nested.files;
  }
  return { directories, files };
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function formatDocumentationTree(paths, documentationRoot = 'docs', maxDepth = 5) {
  const tree = buildTree(paths);
  let docs = tree;
  for (const part of documentationRoot.split('/')) {
    docs = docs.directories.get(part);
    if (!docs) return `- ${documentationRoot}/: missing`;
  }
  const lines = [`${documentationRoot}/`];
  const render = (current, depth, indent) => {
    for (const file of current.files.sort()) lines.push(`${indent}- ${file}`);
    if (depth >= maxDepth && current.directories.size > 0) {
      for (const [name, child] of [...current.directories.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const counts = descendantCounts(child);
        lines.push(`${indent}- ${name}/`);
        lines.push(`${indent}  - … ${plural(counts.directories, 'directory', 'directories')}, ${plural(counts.files, 'Markdown file')}`);
      }
      return;
    }
    for (const [name, child] of [...current.directories.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`${indent}- ${name}/`);
      render(child, depth + 1, `${indent}  `);
    }
  };
  render(docs, 1, '  ');
  return lines.join('\n');
}

export function checkedDocumentationRoot(root, documentationRoot) {
  const realRoot = realpathSync(root);
  let path = realRoot;
  // Config validation rejects absolute paths and traversal; lstat every segment before descending.
  for (const part of documentationRoot.split('/')) {
    path = join(path, part);
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (!entry) return null;
    if (!entry.isDirectory()) throw new Error('Configured documentation root must be a directory without symlinks.');
  }
  return realRoot;
}

export function isSharedMemoryPath(path, config) {
  const roots = [config.documentation.root, DEFAULT_DOCUMENTATION_ROOT];
  return !/[\\\x00-\x1f\x7f]/.test(path)
    && !path.split('/').some((part) => !part || part.startsWith('.') || SKIPPED_DIRECTORIES.has(part))
    && !roots.some((root) => ['plan', 'archive'].some((area) => matchPathPattern(path, `${root}/${area}/**`)))
    && !isSecretLikePathPattern(path)
    && resolveMemoryArea(path, config)?.scope !== 'local';
}

export function* discoverDocumentation(root, documentationRoot, exclude, { maxDepth = Infinity, allowPath = () => true } = {}) {
  function* walk(relativeDirectory, depth) {
    let entries;
    try {
      entries = readdirSync(join(root, relativeDirectory), { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = `${relativeDirectory}/${entry.name}`;
      if (entry.name.startsWith('.') || entry.name.includes('\\') || isSecretLikePathPattern(path) || exclude.some(pattern => matchPathPattern(path, pattern))) continue;
      if (entry.isDirectory()) {
        if (depth < maxDepth && !SKIPPED_DIRECTORIES.has(entry.name)) yield* walk(path, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && allowPath(path)) yield path;
    }
  }
  yield* walk(documentationRoot, 1);
}

export function buildDocumentationMap(projectRoot = '.', { depth = 5 } = {}) {
  const root = resolve(projectRoot);
  if (!existsSync(root)) return { ok: false, error: { code: 'ROOT_NOT_FOUND', message: `Project root not found: ${root}` } };
  try {
    if (!statSync(root).isDirectory()) return { ok: false, error: { code: 'ROOT_NOT_FOUND', message: `Project root not found: ${root}` } };
  } catch {
    return { ok: false, error: { code: 'ROOT_NOT_FOUND', message: `Project root not found: ${root}` } };
  }
  const config = readMemoryConfig(root);
  const documentationRoot = config.documentation?.root ?? 'docs';
  const exclude = [...(config.load?.documentationSummary?.exclude ?? [])].sort();
  const paths = [...discoverDocumentation(root, documentationRoot, exclude)].sort();
  return {
    ok: true,
    root,
    documentationRoot,
    depth,
    exclude,
    paths,
    tree: formatDocumentationTree(paths, documentationRoot, depth),
  };
}

export function buildDecisionDocsMap(projectRoot = '.') {
  const root = resolve(projectRoot);
  const unavailable = (message) => ({ ok: false, error: { code: 'MAP_UNAVAILABLE', message } });
  const config = readMemoryConfig(root);
  if (config.errors?.length) return unavailable('Project configuration is invalid.');
  const documentationRoot = config.documentation.root;
  let realRoot;
  try { realRoot = checkedDocumentationRoot(root, documentationRoot); }
  catch (error) { return unavailable(error.message); }
  if (!realRoot) return unavailable('Configured documentation root does not exist.');

  const depth = 2;
  const maxBytes = 4 * 1024;
  const paths = [];
  let bytes = 0;
  let tree = formatDocumentationTree(paths, documentationRoot, depth);
  const allowPath = (path) => isSharedMemoryPath(path, config);
  for (const path of discoverDocumentation(realRoot, documentationRoot, [], { maxDepth: depth, allowPath })) {
    bytes += Buffer.byteLength(path) + (paths.length ? 1 : 0);
    if (bytes > maxBytes) break;
    const next = formatDocumentationTree([...paths, path], documentationRoot, depth);
    if (Buffer.byteLength(next) > maxBytes) break;
    paths.push(path);
    tree = next;
    if (paths.length === 100) break;
  }
  return { ok: true, root, documentationRoot, depth, paths: paths.sort(), tree };
}
