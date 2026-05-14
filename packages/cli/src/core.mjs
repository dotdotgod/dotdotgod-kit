import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const CACHE_VERSION = 2;
const CACHE_DIR = '.dotdotgod';
const INDEX_FILE = 'index.json';

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

export function parseCommon(argv) {
  const options = { root: '.', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-') && options.root === '.') options.root = arg;
  }
  options.root = resolve(options.root);
  return options;
}

export function rel(root, file) {
  return relative(root, file).replaceAll('\\', '/');
}

export function isKebabCase(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isUpperSnakeMarkdown(value) {
  return value === 'README.md' || /^[A-Z0-9][A-Z0-9_]*\.md$/.test(value);
}

export function removeCodeBlocks(content) {
  return content.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1\s*$/gm, '');
}

export function extractLinks(content) {
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

export function headingToAnchor(text) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function extractAnchors(content) {
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

export function runValidate(argv) {
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

export function shouldIndexPath(path) {
  const normalized = path.replaceAll('\\', '/');
  if (normalized === CACHE_DIR || normalized.startsWith(`${CACHE_DIR}/`)) return false;
  if (normalized.includes('/node_modules/') || normalized.startsWith('node_modules/')) return false;
  if (normalized.includes('/.git/') || normalized.startsWith('.git/')) return false;
  if (normalized === 'docs/archive' || normalized.startsWith('docs/archive/')) return normalized === 'docs/archive/README.md';
  if (normalized.startsWith('docs/')) return true;
  return ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'README.md', 'package.json', 'pnpm-workspace.yaml'].includes(normalized) || normalized.startsWith('packages/');
}

export function collectIndexFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const pathRel = rel(root, path);
      if (entry.isDirectory()) {
        if (shouldIndexPath(`${pathRel}/placeholder`) || pathRel === 'packages' || pathRel === 'docs/archive') walk(path);
      } else if (entry.isFile() && shouldIndexPath(pathRel)) files.push(path);
    }
  };
  walk(root);
  return files.sort();
}

export function fingerprint(file) {
  const content = readFileSync(file);
  return createHash('sha256').update(content).digest('hex');
}

export function cacheFile(root) {
  return join(root, CACHE_DIR, INDEX_FILE);
}

export function addNode(graph, id, type, data = {}) {
  if (!graph.nodes.some((node) => node.id === id)) graph.nodes.push({ id, type, ...data });
}

export function addEdge(graph, source, target, relation, data = {}) {
  const edge = { source, target, relation, ...data };
  if (!graph.edges.some((existing) => JSON.stringify(existing) === JSON.stringify(edge))) graph.edges.push(edge);
}

function addPackageResource(graph, fileId, packagePath, name, target, kind) {
  if (!target || typeof target !== 'string') return;
  const id = `package_resource:${packagePath}#${kind}:${name}`;
  addNode(graph, id, 'package_resource', { name, target, kind, path: packagePath });
  addEdge(graph, fileId, id, 'includes_resource', { kind, confidence: 'EXTRACTED' });
}

export function extractMarkdownGraph(root, file, graph) {
  const path = rel(root, file);
  const content = readFileSync(file, 'utf8');
  const fileId = `file:${path}`;
  const headingRe = /^(#{1,6})\s+(.+)$/gm;
  let match;
  while ((match = headingRe.exec(content)) !== null) {
    const title = match[2].trim();
    const id = `heading:${path}#${headingToAnchor(title)}`;
    addNode(graph, id, 'heading', { path, title, depth: match[1].length });
    addEdge(graph, fileId, id, 'contains_heading', { confidence: 'EXTRACTED' });
  }
  for (const { href, line } of extractLinks(content)) {
    const pathPart = href.split('#')[0];
    if (!pathPart) continue;
    const targetPath = rel(root, resolve(dirname(file), pathPart));
    const targetId = `file:${targetPath}`;
    addNode(graph, targetId, 'file', { path: targetPath });
    addEdge(graph, fileId, targetId, 'links_to', { line, confidence: 'EXTRACTED' });
  }
}

export function extractPackageGraph(root, file, graph) {
  const path = rel(root, file);
  const fileId = `file:${path}`;
  let pkg;
  try { pkg = JSON.parse(readFileSync(file, 'utf8')); } catch { return; }
  if (pkg.name) {
    const pkgId = `package:${pkg.name}`;
    addNode(graph, pkgId, 'package', { name: pkg.name, path });
    addEdge(graph, fileId, pkgId, 'declares_package', { confidence: 'EXTRACTED' });
  }
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    const id = `script:${path}#${name}`;
    addNode(graph, id, 'script', { name, command, path });
    addEdge(graph, fileId, id, 'declares_script', { confidence: 'EXTRACTED' });
  }
  for (const [name, target] of Object.entries(typeof pkg.bin === 'string' ? { [pkg.name ?? 'bin']: pkg.bin } : pkg.bin ?? {})) {
    const id = `bin:${name}`;
    addNode(graph, id, 'binary', { name, target, path });
    addEdge(graph, fileId, id, 'declares_bin', { confidence: 'EXTRACTED' });
    addPackageResource(graph, fileId, path, name, target, 'bin');
  }
  for (const [index, target] of (Array.isArray(pkg.files) ? pkg.files : []).entries()) {
    addPackageResource(graph, fileId, path, `files:${index}`, target, 'files');
  }
  for (const [kind, value] of Object.entries(pkg.pi ?? {})) {
    for (const [index, target] of (Array.isArray(value) ? value : [value]).entries()) {
      addPackageResource(graph, fileId, path, `pi:${kind}:${index}`, target, `pi:${kind}`);
    }
  }
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      const id = `dependency:${name}`;
      addNode(graph, id, 'dependency', { name });
      addEdge(graph, fileId, id, 'depends_on', { section, confidence: 'EXTRACTED' });
    }
  }
}

function addSymbol(graph, fileId, path, name, exported = false) {
  if (!name) return;
  const id = `symbol:${path}#${name}`;
  addNode(graph, id, 'symbol', { name, path });
  addEdge(graph, fileId, id, 'declares', { confidence: 'EXTRACTED' });
  if (exported) {
    const exportId = `export:${path}#${name}`;
    addNode(graph, exportId, 'export', { name, path });
    addEdge(graph, fileId, exportId, 'exports', { confidence: 'EXTRACTED' });
    addEdge(graph, exportId, id, 'exports_symbol', { confidence: 'EXTRACTED' });
  }
}

export function extractScriptGraph(root, file, graph) {
  const path = rel(root, file);
  const fileId = `file:${path}`;
  const content = readFileSync(file, 'utf8');
  const importRe = /^\s*import(?:\s+type)?[\s\S]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
  let match;
  while ((match = importRe.exec(content)) !== null) {
    const spec = match[1] || match[2];
    const id = `import:${spec}`;
    addNode(graph, id, 'import', { specifier: spec });
    addEdge(graph, fileId, id, 'imports', { confidence: 'EXTRACTED' });
  }

  const lines = content.split('\n');
  let depth = 0;
  for (const line of lines) {
    const topLevel = depth === 0;
    const trimmed = line.trim();
    if (topLevel) {
      let declaration = trimmed.match(/^(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
      if (!declaration) declaration = trimmed.match(/^(export\s+)?class\s+([A-Za-z_$][\w$]*)/);
      if (!declaration) declaration = trimmed.match(/^(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
      if (declaration) addSymbol(graph, fileId, path, declaration[2], Boolean(declaration[1]));
    }
    const withoutStrings = line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
    depth += (withoutStrings.match(/{/g) ?? []).length;
    depth -= (withoutStrings.match(/}/g) ?? []).length;
    if (depth < 0) depth = 0;
  }

  const exportListRe = /^\s*export\s*{([^}]+)}/gm;
  while ((match = exportListRe.exec(content)) !== null) {
    for (const item of match[1].split(',')) {
      const name = item.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) addSymbol(graph, fileId, path, name, true);
    }
  }

  const commandRe = /\.registerCommand\(\s*['"]([^'"]+)['"]/g;
  while ((match = commandRe.exec(content)) !== null) {
    const name = match[1];
    const id = `command:${name}`;
    addNode(graph, id, 'command', { name });
    addEdge(graph, fileId, id, 'handles_command', { confidence: 'EXTRACTED' });
  }

  const isTestFile = /(^|\/)(test|tests)\//.test(path) || /\.(test|spec)\.(mjs|cjs|js|jsx|ts|tsx)$/.test(path);
  if (isTestFile) {
    const id = `test:${path}`;
    addNode(graph, id, 'test', { path });
    addEdge(graph, fileId, id, 'declares_test', { confidence: 'INFERRED' });
    for (const edge of graph.edges.filter((edge) => edge.source === fileId && edge.relation === 'imports')) {
      addEdge(graph, id, edge.target, 'tests', { confidence: 'INFERRED' });
    }
  }

  const eventRe = /['"]((?!node:)[a-z][a-z0-9-]*-[a-z0-9-]*:[a-z0-9:-]+)['"]/g;
  while ((match = eventRe.exec(content)) !== null) {
    const name = match[1];
    const id = `event:${name}`;
    addNode(graph, id, 'event', { name });
    addEdge(graph, fileId, id, 'emits_event', { confidence: 'EXTRACTED' });
  }
}

export function buildGraph(root, files) {
  const graph = { nodes: [], edges: [] };
  for (const file of files) {
    const path = rel(root, file);
    const fileId = `file:${path}`;
    addNode(graph, fileId, 'file', { path, extension: extname(file) });
    if (path.endsWith('.md')) extractMarkdownGraph(root, file, graph);
    else if (basename(file) === 'package.json') extractPackageGraph(root, file, graph);
    else if (/\.(mjs|cjs|js|jsx|ts|tsx)$/.test(path)) extractScriptGraph(root, file, graph);
  }
  return graph;
}

export function buildIndex(root) {
  const indexFiles = collectIndexFiles(root);
  const files = indexFiles.map((file) => {
    const stats = statSync(file);
    return { path: rel(root, file), sha256: fingerprint(file), size: stats.size, mtimeMs: Math.round(stats.mtimeMs) };
  });
  const graph = buildGraph(root, indexFiles);
  return { version: CACHE_VERSION, generatedAt: new Date().toISOString(), archiveBodiesIncluded: false, files, graph };
}

export function readIndex(root) {
  const file = cacheFile(root);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export function getStatus(root) {
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

export function runIndex(argv) {
  const options = parseCommon(argv);
  const index = buildIndex(options.root);
  mkdirSync(join(options.root, CACHE_DIR), { recursive: true });
  writeFileSync(cacheFile(options.root), `${JSON.stringify(index, null, 2)}\n`);
  const result = { ok: true, cachePath: rel(options.root, cacheFile(options.root)), indexedFiles: index.files.length, nodes: index.graph.nodes.length, edges: index.graph.edges.length, archiveBodiesIncluded: false };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`✅ index written (${result.indexedFiles} files, ${result.nodes} nodes, ${result.edges} edges, cache: ${result.cachePath})`);
}

export function runStatus(argv) {
  const options = parseCommon(argv);
  const status = getStatus(options.root);
  if (options.json) console.log(JSON.stringify(status, null, 2));
  else console.log(`dotdotgod index status: ${status.status} (${status.indexedFiles}/${status.currentFiles} files, cache: ${status.cachePath})`);
  process.exit(status.ok ? 0 : 1);
}

export function graphSummary(index) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const byType = graph.nodes.reduce((acc, node) => ({ ...acc, [node.type]: (acc[node.type] ?? 0) + 1 }), {});
  const byRelation = graph.edges.reduce((acc, edge) => ({ ...acc, [edge.relation]: (acc[edge.relation] ?? 0) + 1 }), {});
  return { nodes: graph.nodes.length, edges: graph.edges.length, byType, byRelation };
}

export function neighborhood(index, changedPath) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const seed = `file:${changedPath}`;
  const related = new Set([seed]);
  for (const edge of graph.edges) {
    if (edge.source === seed) related.add(edge.target);
    if (edge.target === seed) related.add(edge.source);
  }
  return [...related].slice(0, 25).map((id) => graph.nodes.find((node) => node.id === id) ?? { id });
}

export function runLoadSnapshot(argv) {
  const options = parseCommon(argv);
  const status = getStatus(options.root);
  const index = readIndex(options.root);
  const summary = graphSummary(index);
  const payload = { root: options.root, cache: status, graph: summary, note: 'Leiden-style community detection is planned after deterministic graph extraction.' };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`dotdotgod load snapshot\n- cache: ${status.status}\n- indexed files: ${status.indexedFiles}\n- current files: ${status.currentFiles}\n- archive bodies included: ${status.archiveBodiesIncluded ? 'yes' : 'no'}\n- graph: ${summary.nodes} nodes, ${summary.edges} edges\n- graph communities: planned`);
}

export function parseGraphOptions(argv) {
  const filtered = [];
  let changed;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--changed') changed = argv[++i];
    else filtered.push(argv[i]);
  }
  const options = parseCommon(filtered);
  options.changed = changed;
  return options;
}

export function runGraph(argv) {
  const sub = argv[0];
  const options = parseGraphOptions(argv.slice(1));
  const status = getStatus(options.root);
  const index = readIndex(options.root);
  const payload = sub === 'query'
    ? { ok: status.ok, command: 'graph query', root: options.root, status, changed: options.changed, related: options.changed ? neighborhood(index, options.changed) : [] }
    : { ok: status.ok, command: `graph ${sub}`, root: options.root, status, graph: graphSummary(index), note: 'Leiden-style community detection is planned after deterministic graph extraction.' };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else if (sub === 'query') console.log(`graph query: ${payload.related.length} related node(s) (${status.status} index)`);
  else console.log(`${payload.command}: ${payload.graph.nodes} nodes, ${payload.graph.edges} edges (${status.status} index)`);
}

export function runCli(argv = process.argv.slice(2)) {
  const [command = 'help', ...args] = argv;
  if (command === 'validate') runValidate(args);
  else if (command === 'index') runIndex(args);
  else if (command === 'status') runStatus(args);
  else if (command === 'load-snapshot') runLoadSnapshot(args);
  else if (command === 'graph') runGraph(args);
  else usage(command === 'help' || command === '--help' ? '' : `Unknown command: ${command}`);
}

