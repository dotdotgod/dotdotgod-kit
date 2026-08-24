import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isSecretLikePathPattern, matchPathPattern, readMemoryConfig } from './config.mjs';

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

function discoverMarkdown(root, documentationRoot, exclude) {
  const paths = [];
  const walk = (relativeDirectory) => {
    let entries;
    try {
      entries = readdirSync(join(root, relativeDirectory), { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = `${relativeDirectory}/${entry.name}`.replaceAll('\\', '/');
      if (entry.name.startsWith('.') || isSecretLikePathPattern(path) || exclude.some(pattern => matchPathPattern(path, pattern))) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) paths.push(path);
    }
  };
  walk(documentationRoot);
  return paths.sort();
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
  const paths = discoverMarkdown(root, documentationRoot, exclude);
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
