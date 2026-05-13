#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const options = {
  root: '.',
  includeLocalMemory: false,
  maxLines: 200,
  maxChars: 10000,
  linkCheck: true,
  json: false,
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--include-local-memory') options.includeLocalMemory = true;
  else if (arg === '--max-lines') options.maxLines = Number(args[++i]);
  else if (arg === '--max-chars') options.maxChars = Number(args[++i]);
  else if (arg === '--no-link-check') options.linkCheck = false;
  else if (arg === '--json') options.json = true;
  else if (!arg.startsWith('-')) options.root = arg;
  else failUsage(`Unknown option: ${arg}`);
}

const ROOT = resolve(options.root);
const DOCS = join(ROOT, 'docs');
const errors = [];
const markdownFiles = [];
const fileCache = new Map();

function failUsage(message) {
  console.error(message);
  console.error('Usage: dd-docs-validate <root> [--include-local-memory] [--max-lines n] [--max-chars n] [--no-link-check] [--json]');
  process.exit(2);
}

function addError(file, code, message, line = null) {
  errors.push({ file: relative(ROOT, file), line, code, message });
}

function isKebabCase(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isUpperSnakeMarkdown(value) {
  return value === 'README.md' || /^[A-Z0-9][A-Z0-9_]*\.md$/.test(value);
}

function shouldSkipDir(dir) {
  const rel = relative(ROOT, dir).replaceAll('\\', '/');
  if (!rel || rel === '.') return false;
  if (rel.includes('/node_modules') || rel === 'node_modules') return true;
  if (rel.includes('/.git') || rel === '.git') return true;
  if (!options.includeLocalMemory && (rel === 'docs/plan' || rel.startsWith('docs/plan/') || rel === 'docs/archive' || rel.startsWith('docs/archive/'))) return true;
  return false;
}

function walk(dir) {
  if (!existsSync(dir) || shouldSkipDir(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const rel = relative(DOCS, path);
      if (rel && !rel.startsWith('..')) {
        for (const part of rel.split(/[\\/]/)) {
          if (part && !isKebabCase(part)) addError(path, 'DIR_NAMING', `Directory must be kebab-case: ${part}`);
        }
      }
      walk(path);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      markdownFiles.push(path);
    }
  }
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

function checkMarkdownFile(file) {
  const name = basename(file);
  const rel = relative(DOCS, file);
  if (rel && !rel.startsWith('..') && !isUpperSnakeMarkdown(name)) {
    addError(file, 'FILE_NAMING', `Markdown file must be UPPER_SNAKE_CASE.md or README.md: ${name}`);
  }

  const content = readFileSync(file, 'utf8');
  fileCache.set(file, content);
  const lines = content.split('\n').length;
  if (lines > options.maxLines) addError(file, 'FILE_TOO_LONG', `Markdown file has ${lines} lines; max is ${options.maxLines}`);
  if (content.length > options.maxChars) addError(file, 'FILE_TOO_LARGE', `Markdown file has ${content.length} characters; max is ${options.maxChars}`);
}

function checkDirectoryReadmes() {
  const byDir = new Map();
  for (const file of markdownFiles) {
    const dir = dirname(file);
    byDir.set(dir, [...(byDir.get(dir) ?? []), file]);
  }
  for (const [dir, files] of byDir) {
    if (files.length > 1 && !files.some((file) => basename(file) === 'README.md')) {
      addError(dir, 'MISSING_README', 'Directory with multiple markdown files must include README.md');
    }
  }
}

function checkLinks() {
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
        if (targetContent && !extractAnchors(targetContent).has(decodeURIComponent(anchor))) {
          addError(file, 'BROKEN_ANCHOR', `Local anchor target does not exist: ${href}`, line);
        }
      }
    }
  }
}

function checkLocalMemoryShape() {
  if (!options.includeLocalMemory) return;
  for (const area of ['plan', 'archive/plan', 'archive/report']) {
    const root = join(DOCS, area);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!isKebabCase(entry.name)) addError(join(root, entry.name), 'SLUG_NAMING', `Archive/plan/report slug must be kebab-case: ${entry.name}`);
      const readme = join(root, entry.name, 'README.md');
      if (!existsSync(readme)) addError(readme, 'MISSING_README', `Expected README.md in docs/${area}/${entry.name}/`);
    }
  }
}

function checkGitignore() {
  const gitignore = join(ROOT, '.gitignore');
  if (!existsSync(gitignore)) return addError(gitignore, 'MISSING_GITIGNORE', 'Expected .gitignore');
  const content = readFileSync(gitignore, 'utf8').split('\n').map((line) => line.trim());
  for (const required of ['docs/plan', 'docs/archive']) {
    if (!content.includes(required)) addError(gitignore, 'MISSING_GITIGNORE_ENTRY', `Expected .gitignore entry: ${required}`);
  }
}

if (!existsSync(DOCS)) failUsage(`docs directory not found: ${DOCS}`);
walk(DOCS);
for (const file of markdownFiles) checkMarkdownFile(file);
checkDirectoryReadmes();
if (options.linkCheck) checkLinks();
checkLocalMemoryShape();
checkGitignore();

if (options.json) {
  console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
} else if (errors.length === 0) {
  console.log(`✅ docs validation passed (${markdownFiles.length} markdown files)`);
} else {
  for (const error of errors) {
    const location = error.line ? `${error.file}:${error.line}` : error.file;
    console.log(`${location} [${error.code}] ${error.message}`);
  }
  console.log(`\n❌ ${errors.length} docs validation error(s)`);
}

process.exit(errors.length === 0 ? 0 : 1);
