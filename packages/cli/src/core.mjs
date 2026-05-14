import { createHash } from 'node:crypto';
import { Graph, leiden } from 'leiden-ts';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const CACHE_VERSION = 3;
const CACHE_DIR = '.dotdotgod';
const MANIFEST_FILE = 'manifest.json';
const GRAPH_NODE_SHARDS = ['docs', 'packages', 'source'];
const GRAPH_EDGE_SHARDS = ['imports', 'docs-links', 'tests', 'events', 'packages', 'symbols', 'commands', 'other'];

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
  return join(root, CACHE_DIR, MANIFEST_FILE);
}

function graphNodeShard(node) {
  const path = node.path ?? '';
  if (path.startsWith('docs/') || node.type === 'heading') return 'docs';
  if (node.type === 'package' || node.type === 'script' || node.type === 'binary' || node.type === 'dependency' || node.type === 'package_resource') return 'packages';
  return 'source';
}

function graphEdgeShard(edge) {
  if (edge.relation === 'imports') return 'imports';
  if (edge.relation === 'links_to' || edge.relation === 'contains_heading') return 'docs-links';
  if (edge.relation === 'declares_test' || edge.relation === 'tests') return 'tests';
  if (edge.relation === 'emits_event') return 'events';
  if (edge.relation === 'declares_package' || edge.relation === 'declares_script' || edge.relation === 'declares_bin' || edge.relation === 'depends_on' || edge.relation === 'includes_resource') return 'packages';
  if (edge.relation === 'declares' || edge.relation === 'exports' || edge.relation === 'exports_symbol') return 'symbols';
  if (edge.relation === 'handles_command') return 'commands';
  return 'other';
}

function compactNode(node) {
  const { id, type, ...data } = node;
  return Object.keys(data).length > 0 ? [id, type, data] : [id, type];
}

function expandNode(row) {
  const [id, type, data = {}] = row;
  return { id, type, ...data };
}

function compactEdge(edge) {
  const { source, target, relation, ...data } = edge;
  return Object.keys(data).length > 0 ? [source, target, relation, data] : [source, target, relation];
}

function expandEdge(row) {
  const [source, target, relation, data = {}] = row;
  return { source, target, relation, ...data };
}

function shardFile(root, kind, name) {
  return join(root, CACHE_DIR, 'graph', kind, `${name}.json`);
}

function jsonSize(file) {
  return existsSync(file) ? statSync(file).size : 0;
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function compactGraph(graph) {
  const nodes = Object.fromEntries(GRAPH_NODE_SHARDS.map((name) => [name, []]));
  const edges = Object.fromEntries(GRAPH_EDGE_SHARDS.map((name) => [name, []]));
  for (const node of graph.nodes) nodes[graphNodeShard(node)].push(compactNode(node));
  for (const edge of graph.edges) edges[graphEdgeShard(edge)].push(compactEdge(edge));
  return { nodes, edges };
}

function expandGraph(compact) {
  return {
    nodes: Object.values(compact?.nodes ?? {}).flat().map(expandNode),
    edges: Object.values(compact?.edges ?? {}).flat().map(expandEdge),
  };
}

function graphStats(graph) {
  return { nodes: graph.nodes.length, edges: graph.edges.length };
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

function collectFingerprints(root) {
  return collectIndexFiles(root).map((file) => {
    const stats = statSync(file);
    return { path: rel(root, file), sha256: fingerprint(file), size: stats.size, mtimeMs: Math.round(stats.mtimeMs) };
  });
}

function nodeOwnedByPath(node, paths) {
  return paths.has(node.path) || paths.has(node.id?.replace(/^file:/, '')) || paths.has(node.id?.replace(/^test:/, ''));
}

function mergeIncrementalGraph(previousGraph, changedGraph, changedPaths) {
  if (!previousGraph) return changedGraph;
  const changedSet = new Set(changedPaths);
  const changedNodeIds = new Set(previousGraph.nodes.filter((node) => nodeOwnedByPath(node, changedSet)).map((node) => node.id));
  for (const node of changedGraph.nodes) changedNodeIds.add(node.id);
  const graph = { nodes: [], edges: [] };
  for (const node of previousGraph.nodes) if (!changedNodeIds.has(node.id) && !nodeOwnedByPath(node, changedSet)) addNode(graph, node.id, node.type, Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'id' && key !== 'type')));
  for (const edge of previousGraph.edges) if (!changedNodeIds.has(edge.source) && !changedNodeIds.has(edge.target)) addEdge(graph, edge.source, edge.target, edge.relation, Object.fromEntries(Object.entries(edge).filter(([key]) => key !== 'source' && key !== 'target' && key !== 'relation')));
  for (const node of changedGraph.nodes) addNode(graph, node.id, node.type, Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'id' && key !== 'type')));
  for (const edge of changedGraph.edges) addEdge(graph, edge.source, edge.target, edge.relation, Object.fromEntries(Object.entries(edge).filter(([key]) => key !== 'source' && key !== 'target' && key !== 'relation')));
  return graph;
}

export function buildIndex(root, previous = readIndex(root)) {
  const files = collectFingerprints(root);
  const indexed = new Map((previous?.files ?? []).map((file) => [file.path, file.sha256]));
  const changedPaths = files.filter((file) => indexed.get(file.path) !== file.sha256).map((file) => file.path);
  const changedFiles = files.filter((file) => changedPaths.includes(file.path)).map((file) => join(root, file.path));
  const fullRebuild = !previous?.graph || previous.version !== CACHE_VERSION;
  const graph = fullRebuild ? buildGraph(root, files.map((file) => join(root, file.path))) : mergeIncrementalGraph(previous.graph, buildGraph(root, changedFiles), changedPaths);
  return { version: CACHE_VERSION, generatedAt: new Date().toISOString(), archiveBodiesIncluded: false, files, graph, stats: graphStats(graph), incremental: { enabled: true, fullRebuild, changedFiles: changedPaths.length } };
}

export function writeIndex(root, index) {
  const compact = compactGraph(index.graph);
  for (const [name, rows] of Object.entries(compact.nodes)) writeJson(shardFile(root, 'nodes', name), rows);
  for (const [name, rows] of Object.entries(compact.edges)) writeJson(shardFile(root, 'edges', name), rows);
  const graphShards = {
    nodes: Object.fromEntries(Object.keys(compact.nodes).map((name) => [name, rel(root, shardFile(root, 'nodes', name))])),
    edges: Object.fromEntries(Object.keys(compact.edges).map((name) => [name, rel(root, shardFile(root, 'edges', name))])),
  };
  const manifest = { version: index.version, generatedAt: index.generatedAt, archiveBodiesIncluded: index.archiveBodiesIncluded, files: index.files, graph: { ...graphStats(index.graph), compactSchema: true, shards: graphShards }, incremental: index.incremental };
  writeJson(cacheFile(root), manifest);
  const shardBytes = [...Object.values(graphShards.nodes), ...Object.values(graphShards.edges)].reduce((sum, path) => sum + jsonSize(join(root, path)), 0);
  const manifestBytes = jsonSize(cacheFile(root));
  return { ...manifest, indexSizeBytes: manifestBytes + shardBytes, manifestBytes, shardBytes };
}

export function readIndex(root) {
  const file = cacheFile(root);
  if (!existsSync(file)) return null;
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const shards = manifest.graph?.shards;
    if (!shards) return manifest;
    const compact = { nodes: {}, edges: {} };
    for (const [name, path] of Object.entries(shards.nodes ?? {})) compact.nodes[name] = existsSync(join(root, path)) ? JSON.parse(readFileSync(join(root, path), 'utf8')) : [];
    for (const [name, path] of Object.entries(shards.edges ?? {})) compact.edges[name] = existsSync(join(root, path)) ? JSON.parse(readFileSync(join(root, path), 'utf8')) : [];
    return { ...manifest, graph: expandGraph(compact) };
  } catch { return null; }
}

export function getStatus(root) {
  const index = readIndex(root);
  const currentFiles = collectFingerprints(root);
  if (!index) return { ok: false, status: 'missing', cachePath: rel(root, cacheFile(root)), indexedFiles: 0, currentFiles: currentFiles.length, staleFiles: currentFiles.length, archiveBodiesIncluded: false };
  const indexed = new Map((index.files ?? []).map((file) => [file.path, file.sha256]));
  const currentMap = new Map(currentFiles.map((file) => [file.path, file.sha256]));
  const stale = currentFiles.filter((file) => indexed.get(file.path) !== file.sha256).map((file) => file.path);
  const removed = [...indexed.keys()].filter((path) => !currentMap.has(path));
  const staleFiles = [...stale, ...removed];
  const ok = staleFiles.length === 0 && index.version === CACHE_VERSION;
  return { ok, status: ok ? 'fresh' : 'stale', cachePath: rel(root, cacheFile(root)), indexedFiles: index.files?.length ?? 0, currentFiles: currentFiles.length, staleFiles: staleFiles.length, examples: staleFiles.slice(0, 10), archiveBodiesIncluded: index.archiveBodiesIncluded === true, graph: graphStats(index.graph ?? { nodes: [], edges: [] }) };
}

export function runIndex(argv) {
  const options = parseCommon(argv);
  const index = buildIndex(options.root);
  const manifest = writeIndex(options.root, index);
  const result = { ok: true, cachePath: rel(options.root, cacheFile(options.root)), indexedFiles: index.files.length, nodes: index.graph.nodes.length, edges: index.graph.edges.length, indexSizeBytes: manifest.indexSizeBytes, shards: manifest.graph.shards, incremental: index.incremental, archiveBodiesIncluded: false };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`✅ index written (${result.indexedFiles} files, ${result.nodes} nodes, ${result.edges} edges, ${(result.indexSizeBytes / 1024).toFixed(1)} KiB, cache: ${result.cachePath})`);
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
  return buildImpactReport(index, changedPath).related;
}

function addImpactItem(group, item, limit = 10) {
  if (group.items.some((existing) => existing.id === item.id)) return;
  if (group.items.length >= limit) {
    group.omitted += 1;
    return;
  }
  group.items.push(item);
}

function docsArea(path = '') {
  if (path.startsWith('docs/spec/')) return 'spec';
  if (path.startsWith('docs/arch/')) return 'arch';
  if (path.startsWith('docs/test/')) return 'test-docs';
  if (path.startsWith('docs/plan/')) return 'plan';
  if (path.startsWith('docs/archive/')) return 'archive-index';
  if (path.startsWith('docs/')) return 'docs';
  return undefined;
}

function fileFromImport(changedPath, specifier) {
  if (!specifier?.startsWith('.')) return undefined;
  const base = dirname(changedPath);
  const candidate = rel('.', resolve(base, specifier));
  return candidate.replace(/^\.\//, '');
}

export function buildImpactReport(index, changedPath, limits = {}) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const seed = `file:${changedPath}`;
  const maxRelated = limits.related ?? 25;
  const groups = {
    files: { items: [], omitted: 0 },
    docs: { items: [], omitted: 0 },
    tests: { items: [], omitted: 0 },
    commands: { items: [], omitted: 0 },
    events: { items: [], omitted: 0 },
    packageResources: { items: [], omitted: 0 },
    symbols: { items: [], omitted: 0 },
  };
  const relatedIds = new Set([seed]);
  const reasons = new Map([[seed, new Set(['changed-file'])]]);
  const addReason = (id, reason) => {
    relatedIds.add(id);
    if (!reasons.has(id)) reasons.set(id, new Set());
    reasons.get(id).add(reason);
  };

  for (const edge of graph.edges) {
    if (edge.source === seed) addReason(edge.target, edge.relation);
    if (edge.target === seed) addReason(edge.source, `incoming:${edge.relation}`);
  }

  const changedDir = dirname(changedPath).replaceAll('\\', '/');
  for (const node of graph.nodes) {
    if (node.type === 'file' && node.path !== changedPath && dirname(node.path).replaceAll('\\', '/') === changedDir) {
      addReason(node.id, 'same-directory');
    }
    if (node.type === 'test' && (node.path.includes(basename(changedPath).replace(/\.(mjs|cjs|js|jsx|ts|tsx)$/, '')) || node.path.includes(changedDir))) {
      addReason(node.id, 'test-path-proximity');
    }
  }

  const seedImports = graph.edges
    .filter((edge) => edge.source === seed && edge.relation === 'imports')
    .map((edge) => nodeById.get(edge.target)?.specifier)
    .filter(Boolean);
  for (const specifier of seedImports) {
    const importedPath = fileFromImport(changedPath, specifier);
    if (importedPath) addReason(`file:${importedPath}`, 'imports-local-file');
    for (const edge of graph.edges) {
      const node = nodeById.get(edge.target);
      if (edge.relation === 'imports' && node?.specifier === specifier && edge.source !== seed) {
        addReason(edge.source, 'shares-import');
      }
    }
  }

  const related = [...relatedIds].slice(0, maxRelated).map((id) => ({ ...(nodeById.get(id) ?? { id }), reasons: [...(reasons.get(id) ?? [])] }));
  for (const item of related) {
    if (item.type === 'file') {
      const area = docsArea(item.path);
      if (area) addImpactItem(groups.docs, { ...item, area }, limits.docs ?? 10);
      else addImpactItem(groups.files, item, limits.files ?? 10);
    } else if (item.type === 'test') addImpactItem(groups.tests, item, limits.tests ?? 10);
    else if (item.type === 'command') addImpactItem(groups.commands, item, limits.commands ?? 10);
    else if (item.type === 'event') addImpactItem(groups.events, item, limits.events ?? 10);
    else if (item.type === 'package_resource') addImpactItem(groups.packageResources, item, limits.packageResources ?? 10);
    else if (item.type === 'symbol' || item.type === 'export') addImpactItem(groups.symbols, item, limits.symbols ?? 10);
  }

  return { changed: changedPath, related, groups, omittedRelated: Math.max(0, relatedIds.size - related.length) };
}

const DURABLE_COMMUNITY_NODE_TYPES = new Set(['file', 'test', 'command', 'event', 'package_resource', 'package', 'script', 'binary']);

function communityKeyForNode(node) {
  const path = node.path ?? node.id?.replace(/^file:/, '').replace(/^test:/, '') ?? '';
  if (path.startsWith('packages/pi/extensions/plan-mode/')) return 'pi-plan-mode';
  if (path.startsWith('packages/pi/extensions/load-project/')) return 'pi-load-project';
  if (path.startsWith('packages/pi/extensions/context-metrics/')) return 'pi-context-metrics';
  if (path.startsWith('packages/cli/')) return 'cli';
  if (path.startsWith('packages/claude-code/')) return 'claude-code-adapter';
  if (path.startsWith('packages/codex/')) return 'codex-adapter';
  if (path.startsWith('packages/shared/')) return 'shared-adapter-resources';
  const area = docsArea(path);
  if (area) return `docs-${area}`;
  if (node.type === 'package' || node.type === 'script' || node.type === 'binary' || node.type === 'dependency' || node.type === 'package_resource') return 'package-metadata';
  if (node.type === 'command') return `command-${node.name}`;
  if (node.type === 'event') return `event-${node.name.split(':')[0]}`;
  return 'project-root';
}

function communityLabel(id) {
  return id.split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
}

function addBounded(list, value, limit) {
  if (!value || list.includes(value)) return 0;
  if (list.length >= limit) return 1;
  list.push(value);
  return 0;
}

function relationWeight(relation) {
  if (relation === 'imports' || relation === 'tests' || relation === 'handles_command') return 4;
  if (relation === 'emits_event' || relation === 'includes_resource') return 3;
  if (relation === 'links_to' || relation === 'declares_package' || relation === 'declares_bin') return 2;
  return 1;
}

function addCommunityDetails(community, node, itemLimit) {
  community.nodeCount += 1;
  const path = node.path ?? node.id?.replace(/^file:/, '').replace(/^test:/, '');
  if (node.type === 'file') {
    const area = docsArea(path);
    community.omitted += addBounded(area ? community.docs : community.files, path, itemLimit);
  } else if (node.type === 'heading' && node.path) community.omitted += addBounded(community.docs, node.path, itemLimit);
  else if (node.type === 'command') community.omitted += addBounded(community.commands, node.name, itemLimit);
  else if (node.type === 'event') community.omitted += addBounded(community.events, node.name, itemLimit);
  else if (node.type === 'test') community.omitted += addBounded(community.tests, node.path, itemLimit);
  else if (node.type === 'package_resource') community.omitted += addBounded(community.packageResources, `${node.kind}:${node.target}`, itemLimit);
}

function makeCommunity(id, label = communityLabel(id)) {
  return { id, label, files: [], docs: [], commands: [], events: [], tests: [], packageResources: [], nodeCount: 0, edgeCount: 0, omitted: 0 };
}

function deterministicCommunities(graph, maxCommunities, itemLimit, fallback = false) {
  const map = new Map();
  for (const node of graph.nodes) {
    const id = communityKeyForNode(node);
    if (!map.has(id)) map.set(id, makeCommunity(id));
    addCommunityDetails(map.get(id), node, itemLimit);
  }
  const nodeToCommunity = new Map(graph.nodes.map((node) => [node.id, communityKeyForNode(node)]));
  for (const edge of graph.edges) {
    const source = nodeToCommunity.get(edge.source);
    const target = nodeToCommunity.get(edge.target);
    if (source && source === target && map.has(source)) map.get(source).edgeCount += 1;
  }
  const all = [...map.values()].sort((a, b) => (b.nodeCount + b.edgeCount) - (a.nodeCount + a.edgeCount) || a.id.localeCompare(b.id));
  return { communities: all.slice(0, maxCommunities), omitted: Math.max(0, all.length - maxCommunities), total: all.length, method: 'deterministic-domain-grouping', fallback };
}

function buildLeidenProjection(graph) {
  const durable = graph.nodes.filter((node) => DURABLE_COMMUNITY_NODE_TYPES.has(node.type));
  const durableIds = new Set(durable.map((node) => node.id));
  const nodeIndex = new Map(durable.map((node, index) => [node.id, index]));
  const adjacency = new Map();
  const addProjectionEdge = (a, b, weight) => {
    if (a === b || !nodeIndex.has(a) || !nodeIndex.has(b)) return;
    const [source, target] = nodeIndex.get(a) < nodeIndex.get(b) ? [nodeIndex.get(a), nodeIndex.get(b)] : [nodeIndex.get(b), nodeIndex.get(a)];
    const key = `${source}:${target}`;
    adjacency.set(key, (adjacency.get(key) ?? 0) + weight);
  };

  const edgesByNode = new Map();
  for (const edge of graph.edges) {
    if (!edgesByNode.has(edge.source)) edgesByNode.set(edge.source, []);
    if (!edgesByNode.has(edge.target)) edgesByNode.set(edge.target, []);
    edgesByNode.get(edge.source).push(edge);
    edgesByNode.get(edge.target).push(edge);
    if (durableIds.has(edge.source) && durableIds.has(edge.target)) addProjectionEdge(edge.source, edge.target, relationWeight(edge.relation));
  }

  for (const node of graph.nodes) {
    if (durableIds.has(node.id)) continue;
    const neighbors = (edgesByNode.get(node.id) ?? []).map((edge) => edge.source === node.id ? edge.target : edge.source).filter((id) => durableIds.has(id));
    for (let i = 0; i < neighbors.length; i += 1) for (let j = i + 1; j < neighbors.length; j += 1) addProjectionEdge(neighbors[i], neighbors[j], 1);
  }

  return { durable, edges: [...adjacency.entries()].map(([key, weight]) => [...key.split(':').map(Number), weight]) };
}

function labelForLeidenCommunity(nodes) {
  const counts = new Map();
  for (const node of nodes) counts.set(communityKeyForNode(node), (counts.get(communityKeyForNode(node)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'community';
}

export function buildCommunities(index, limits = {}) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const maxCommunities = limits.communities ?? 8;
  const itemLimit = limits.items ?? 8;
  const projection = buildLeidenProjection(graph);
  if (projection.durable.length < 3 || projection.edges.length === 0) return deterministicCommunities(graph, maxCommunities, itemLimit, true);

  try {
    const result = leiden(Graph.fromEdgeList(projection.durable.length, projection.edges), { seed: 42, resolution: limits.resolution ?? 1.0 });
    const byCommunity = new Map();
    Array.from(result.partition.assignments).forEach((communityId, index) => {
      if (!byCommunity.has(communityId)) byCommunity.set(communityId, []);
      byCommunity.get(communityId).push(projection.durable[index]);
    });
    const communities = [...byCommunity.entries()].map(([communityId, nodes]) => {
      const labelKey = labelForLeidenCommunity(nodes);
      const community = makeCommunity(`leiden-${communityId}`, communityLabel(labelKey));
      for (const node of nodes.sort((a, b) => a.id.localeCompare(b.id))) addCommunityDetails(community, node, itemLimit);
      return community;
    });
    const nodeToCommunity = new Map();
    for (const [communityId, nodes] of byCommunity.entries()) for (const node of nodes) nodeToCommunity.set(node.id, communityId);
    for (const edge of graph.edges) {
      const source = nodeToCommunity.get(edge.source);
      const target = nodeToCommunity.get(edge.target);
      if (source !== undefined && source === target) communities.find((community) => community.id === `leiden-${source}`).edgeCount += 1;
    }
    const all = communities.sort((a, b) => (b.nodeCount + b.edgeCount) - (a.nodeCount + a.edgeCount) || a.id.localeCompare(b.id));
    return { communities: all.slice(0, maxCommunities), omitted: Math.max(0, all.length - maxCommunities), total: all.length, method: 'leiden', fallback: false, modularity: result.modularity };
  } catch {
    return deterministicCommunities(graph, maxCommunities, itemLimit, true);
  }
}

export function runLoadSnapshot(argv) {
  const options = parseCommon(argv);
  const status = getStatus(options.root);
  const index = readIndex(options.root);
  const summary = graphSummary(index);
  const communities = buildCommunities(index, { communities: 5, items: 5 });
  const payload = { root: options.root, cache: status, graph: summary, communities, bounds: { communities: 5, communityItems: 5, fullGraphIncluded: false } };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`dotdotgod load snapshot\n- cache: ${status.status}\n- indexed files: ${status.indexedFiles}\n- current files: ${status.currentFiles}\n- archive bodies included: ${status.archiveBodiesIncluded ? 'yes' : 'no'}\n- graph: ${summary.nodes} nodes, ${summary.edges} edges\n- communities: ${communities.communities.length}/${communities.total} shown, ${communities.omitted} omitted`);
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
  const impact = options.changed ? buildImpactReport(index, options.changed) : undefined;
  const payload = sub === 'query'
    ? { ok: status.ok, command: 'graph query', root: options.root, status, changed: options.changed, related: impact?.related ?? [], impact }
    : sub === 'communities'
      ? { ok: status.ok, command: 'graph communities', root: options.root, status, graph: graphSummary(index), communities: buildCommunities(index) }
      : { ok: status.ok, command: `graph ${sub}`, root: options.root, status, graph: graphSummary(index) };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else if (sub === 'query') console.log(`graph query: ${payload.related.length} related node(s), ${impact?.omittedRelated ?? 0} omitted (${status.status} index)`);
  else if (sub === 'communities') console.log(`graph communities: ${payload.communities.communities.length}/${payload.communities.total} shown, ${payload.communities.omitted} omitted (${status.status} index)`);
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

