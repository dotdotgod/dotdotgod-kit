#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const CACHE_VERSION = 1;
const CACHE_DIR = '.dotdotgod';
const INDEX_FILE = 'index.json';

const [command = 'help', ...args] = process.argv.slice(2);

function usage(message) {
  if (message) console.error(message);
  console.error(`Usage:
  dotdotgod validate <root> [--include-local-memory] [--max-lines n] [--max-chars n] [--no-link-check] [--json]
  dotdotgod index <root> [--json]
  dotdotgod status <root> [--json]
  dotdotgod load-snapshot <root> [--json]
  dotdotgod graph query <root> [--changed path] [--json]
  dotdotgod graph communities <root> [--json]`);
  process.exit(message ? 2 : 0);
}

function parseCommon(argv) {
  const options = { root: '.', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-') && options.root === '.') options.root = arg;
  }
  options.root = resolve(options.root);
  return options;
}

function rel(root, file) {
  return relative(root, file).replaceAll('\\', '/');
}

function isKebabCase(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isUpperSnakeMarkdown(value) {
  return value === 'README.md' || /^[A-Z0-9][A-Z0-9_]*\.md$/.test(value);
}

function removeCodeBlocks(content) {
  return content.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1\s*$/gm, '');
}

function extractLinks(content) {
  const links = [];
  const lines = removeCodeBlocks(content).split('\n');
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  lines.forEach((lineText, index) => {
    let match;
    while ((match = re.exec(lineText)) !== null) {
      const href = match[1].trim();
      if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) continue;
      links.push({ href, line: index + 1 });
    }
  });
  return links;
}

function headingToAnchor(text) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function extractAnchors(content) {
  const anchors = new Set();
  const seen = new Map();
  const re = /^#{1,6}\s+(.+)$/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    const base = headingToAnchor(match[1]);
    if (!base) continue;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function runValidate(argv) {
  const options = { root: '.', includeLocalMemory: false, maxLines: 200, maxChars: 10000, linkCheck: true, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--include-local-memory') options.includeLocalMemory = true;
    else if (arg === '--max-lines') options.maxLines = Number(argv[++i]);
    else if (arg === '--max-chars') options.maxChars = Number(argv[++i]);
    else if (arg === '--no-link-check') options.linkCheck = false;
    else if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-')) options.root = arg;
    else usage(`Unknown option: ${arg}`);
  }

  const root = resolve(options.root);
  const docs = join(root, 'docs');
  const errors = [];
  const markdownFiles = [];
  const fileCache = new Map();
  const addError = (file, code, message, line = null) => errors.push({ file: rel(root, file), line, code, message });
  const shouldSkipDir = (dir) => {
    const path = rel(root, dir);
    if (!path || path === '.') return false;
    if (path.includes('/node_modules') || path === 'node_modules') return true;
    if (path.includes('/.git') || path === '.git') return true;
    if (path === CACHE_DIR || path.startsWith(`${CACHE_DIR}/`)) return true;
    if (!options.includeLocalMemory && (path === 'docs/plan' || path.startsWith('docs/plan/') || path === 'docs/archive' || path.startsWith('docs/archive/'))) return true;
    return false;
  };
  const walk = (dir) => {
    if (!existsSync(dir) || shouldSkipDir(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const docsRel = rel(docs, path);
        if (docsRel && !docsRel.startsWith('..')) {
          for (const part of docsRel.split('/')) if (part && !isKebabCase(part)) addError(path, 'DIR_NAMING', `Directory must be kebab-case: ${part}`);
        }
        walk(path);
      } else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(path);
    }
  };

  if (!existsSync(docs)) usage(`docs directory not found: ${docs}`);
  walk(docs);
  for (const file of markdownFiles) {
    const name = basename(file);
    const docsRel = rel(docs, file);
    if (docsRel && !docsRel.startsWith('..') && !isUpperSnakeMarkdown(name)) addError(file, 'FILE_NAMING', `Markdown file must be UPPER_SNAKE_CASE.md or README.md: ${name}`);
    const content = readFileSync(file, 'utf8');
    fileCache.set(file, content);
    const lines = content.split('\n').length;
    if (lines > options.maxLines) addError(file, 'FILE_TOO_LONG', `Markdown file has ${lines} lines; max is ${options.maxLines}`);
    if (content.length > options.maxChars) addError(file, 'FILE_TOO_LARGE', `Markdown file has ${content.length} characters; max is ${options.maxChars}`);
  }
  const byDir = new Map();
  for (const file of markdownFiles) byDir.set(dirname(file), [...(byDir.get(dirname(file)) ?? []), file]);
  for (const [dir, files] of byDir) if (files.length > 1 && !files.some((file) => basename(file) === 'README.md')) addError(dir, 'MISSING_README', 'Directory with multiple markdown files must include README.md');
  if (options.linkCheck) {
    for (const [file, content] of fileCache) {
      const fileDir = dirname(file);
      for (const { href, line } of extractLinks(content)) {
        const hashIndex = href.indexOf('#');
        const pathPart = hashIndex === -1 ? href : href.slice(0, hashIndex);
        const anchor = hashIndex === -1 ? '' : href.slice(hashIndex + 1);
        const target = pathPart ? resolve(fileDir, pathPart) : file;
        if (pathPart && !existsSync(target)) {
          addError(file, 'BROKEN_LINK', `Local link target does not exist: ${pathPart}`, line);
          continue;
        }
        if (anchor && extname(target) === '.md') {
          const targetContent = fileCache.get(target) ?? (existsSync(target) ? readFileSync(target, 'utf8') : '');
          if (targetContent && !extractAnchors(targetContent).has(decodeURIComponent(anchor))) addError(file, 'BROKEN_ANCHOR', `Local anchor target does not exist: ${href}`, line);
        }
      }
    }
  }
  if (options.includeLocalMemory) {
    for (const area of ['plan', 'archive/plan', 'archive/report']) {
      const areaRoot = join(docs, area);
      if (!existsSync(areaRoot)) continue;
      for (const entry of readdirSync(areaRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!isKebabCase(entry.name)) addError(join(areaRoot, entry.name), 'SLUG_NAMING', `Archive/plan/report slug must be kebab-case: ${entry.name}`);
        const readme = join(areaRoot, entry.name, 'README.md');
        if (!existsSync(readme)) addError(readme, 'MISSING_README', `Expected README.md in docs/${area}/${entry.name}/`);
      }
    }
  }
  const gitignore = join(root, '.gitignore');
  if (!existsSync(gitignore)) addError(gitignore, 'MISSING_GITIGNORE', 'Expected .gitignore');
  else {
    const content = readFileSync(gitignore, 'utf8').split('\n').map((line) => line.trim());
    for (const required of ['docs/plan', 'docs/archive', CACHE_DIR]) if (!content.includes(required)) addError(gitignore, 'MISSING_GITIGNORE_ENTRY', `Expected .gitignore entry: ${required}`);
  }

  if (options.json) console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
  else if (errors.length === 0) console.log(`✅ docs validation passed (${markdownFiles.length} markdown files)`);
  else {
    for (const error of errors) console.log(`${error.line ? `${error.file}:${error.line}` : error.file} [${error.code}] ${error.message}`);
    console.log(`\n❌ ${errors.length} docs validation error(s)`);
  }
  process.exit(errors.length === 0 ? 0 : 1);
}

function shouldIndexPath(path) {
  const normalized = path.replaceAll('\\', '/');
  if (normalized === CACHE_DIR || normalized.startsWith(`${CACHE_DIR}/`)) return false;
  if (normalized.includes('/node_modules/') || normalized.startsWith('node_modules/')) return false;
  if (normalized.includes('/.git/') || normalized.startsWith('.git/')) return false;
  if (normalized === 'docs/archive' || normalized.startsWith('docs/archive/')) return normalized === 'docs/archive/README.md';
  if (normalized.startsWith('docs/')) return true;
  return ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'README.md', 'package.json', 'pnpm-workspace.yaml'].includes(normalized) || normalized.startsWith('packages/');
}

function collectIndexFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const pathRel = rel(root, path);
      if (entry.isDirectory()) {
        if (shouldIndexPath(`${pathRel}/placeholder`) || pathRel === 'packages') walk(path);
      } else if (entry.isFile() && shouldIndexPath(pathRel)) files.push(path);
    }
  };
  walk(root);
  return files.sort();
}

function fingerprint(file) {
  const content = readFileSync(file);
  return createHash('sha256').update(content).digest('hex');
}

function cacheFile(root) {
  return join(root, CACHE_DIR, INDEX_FILE);
}

function buildIndex(root) {
  const files = collectIndexFiles(root).map((file) => {
    const stats = statSync(file);
    return { path: rel(root, file), sha256: fingerprint(file), size: stats.size, mtimeMs: Math.round(stats.mtimeMs) };
  });
  return { version: CACHE_VERSION, generatedAt: new Date().toISOString(), archiveBodiesIncluded: false, files };
}

function readIndex(root) {
  const file = cacheFile(root);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function getStatus(root) {
  const index = readIndex(root);
  const current = buildIndex(root);
  if (!index) return { ok: false, status: 'missing', cachePath: rel(root, cacheFile(root)), indexedFiles: 0, currentFiles: current.files.length, staleFiles: current.files.length, archiveBodiesIncluded: false };
  const indexed = new Map((index.files ?? []).map((file) => [file.path, file.sha256]));
  const currentMap = new Map(current.files.map((file) => [file.path, file.sha256]));
  const stale = current.files.filter((file) => indexed.get(file.path) !== file.sha256).map((file) => file.path);
  const removed = [...indexed.keys()].filter((path) => !currentMap.has(path));
  const staleFiles = [...stale, ...removed];
  return { ok: staleFiles.length === 0 && index.version === CACHE_VERSION, status: staleFiles.length === 0 ? 'fresh' : 'stale', cachePath: rel(root, cacheFile(root)), indexedFiles: index.files?.length ?? 0, currentFiles: current.files.length, staleFiles: staleFiles.length, examples: staleFiles.slice(0, 10), archiveBodiesIncluded: index.archiveBodiesIncluded === true };
}

function runIndex(argv) {
  const options = parseCommon(argv);
  const index = buildIndex(options.root);
  mkdirSync(join(options.root, CACHE_DIR), { recursive: true });
  writeFileSync(cacheFile(options.root), `${JSON.stringify(index, null, 2)}\n`);
  const result = { ok: true, cachePath: rel(options.root, cacheFile(options.root)), indexedFiles: index.files.length, archiveBodiesIncluded: false };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`✅ index written (${result.indexedFiles} files, cache: ${result.cachePath})`);
}

function runStatus(argv) {
  const options = parseCommon(argv);
  const status = getStatus(options.root);
  if (options.json) console.log(JSON.stringify(status, null, 2));
  else console.log(`dotdotgod index status: ${status.status} (${status.indexedFiles}/${status.currentFiles} files, cache: ${status.cachePath})`);
  process.exit(status.ok ? 0 : 1);
}

function runLoadSnapshot(argv) {
  const options = parseCommon(argv);
  const status = getStatus(options.root);
  const payload = { root: options.root, cache: status, note: 'Graph impact neighborhoods and Leiden communities are planned for the next milestone.' };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`dotdotgod load snapshot\n- cache: ${status.status}\n- indexed files: ${status.indexedFiles}\n- current files: ${status.currentFiles}\n- archive bodies included: ${status.archiveBodiesIncluded ? 'yes' : 'no'}\n- graph communities: planned`);
}

function runGraph(argv) {
  const sub = argv[0];
  const options = parseCommon(argv.slice(1));
  const payload = { ok: true, command: `graph ${sub}`, root: options.root, status: getStatus(options.root), note: 'Graph extraction and Leiden-style community detection are planned after cache/index foundation.' };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`${payload.command}: planned (${payload.status.status} index)`);
}

if (command === 'validate') runValidate(args);
else if (command === 'index') runIndex(args);
else if (command === 'status') runStatus(args);
else if (command === 'load-snapshot') runLoadSnapshot(args);
else if (command === 'graph') runGraph(args);
else usage(command === 'help' || command === '--help' ? '' : `Unknown command: ${command}`);
