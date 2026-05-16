import { createHash } from 'node:crypto';
import { Graph, leiden } from 'leiden-ts';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

export const CACHE_VERSION = 8;
const CACHE_DIR = '.dotdotgod';
const MANIFEST_FILE = 'manifest.json';
const GRAPH_NODE_SHARDS = ['docs', 'packages', 'source'];
const GRAPH_EDGE_SHARDS = ['imports', 'docs-links', 'tests', 'events', 'packages', 'symbols', 'commands', 'other'];

function usage(message) {
  if (message) console.error(message);
  console.error(`Usage:
  dotdotgod validate <root> [--include-local-memory] [--check-index] [--max-lines n] [--max-chars n] [--no-link-check] [--json]
  dotdotgod index <root> [--json]
  dotdotgod status <root> [--json]
  dotdotgod load-snapshot <root> [--json]
  dotdotgod graph impact <root> [--changed path] [--json]
  dotdotgod graph query <root> [--changed path] [--json]  # deprecated alias
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

const TRACEABILITY_PATH_FIELDS = ['implementedBy', 'verifiedBy', 'relatedDocs'];
const TRACEABILITY_COMMAND_FIELDS = ['verificationCommands'];

export function traceabilityExample() {
  return 'Expected dotdotgod traceability block:\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/..."],\n  "verifiedBy": ["packages/..."],\n  "relatedDocs": ["docs/..."],\n  "verificationCommands": ["pnpm ..."]\n}\n```\n\nProperty guidance:\n- kind: use "spec" for behavior specs.\n- implementedBy: source/config/script files that implement this spec\'s behavior.\n- verifiedBy: test files or verification docs that check this behavior.\n- relatedDocs: docs with relevant architecture, test strategy, or product context.\n- verificationCommands: commands an agent can run to verify this behavior.';
}

function lineForOffset(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

export function extractDotdotgodTraceabilityBlocks(content) {
  const blocks = [];
  const re = /^(`{3,}|~{3,})[ \t]*([^\n]*)\n([\s\S]*?)\n\1[ \t]*$/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    const info = match[2].trim().toLowerCase().split(/\s+/);
    if (!info.includes('json') || !info.includes('dotdotgod')) continue;
    const raw = match[3].trim();
    const line = lineForOffset(content, match.index);
    try {
      blocks.push({ data: JSON.parse(raw), raw, line });
    } catch (error) {
      blocks.push({ error: error instanceof Error ? error.message : String(error), raw, line });
    }
  }
  return blocks;
}

function isLocalRelativeTraceabilityPath(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return false;
  if (value.startsWith('/') || value.startsWith('~') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  if (value.split('/').includes('..')) return false;
  return !isSecretIndexPath(value);
}

function traceabilityFieldError(file, code, field, message, line = null) {
  return { file, line, code, message: `${field ? `Field "${field}": ` : ''}${message}\n\n${traceabilityExample()}` };
}

export function validateTraceabilityPlacement(content, root, file) {
  const headings = [...content.matchAll(/^##\s+(.+)$/gm)];
  const lastHeading = headings.at(-1)?.[1]?.trim();
  if (lastHeading !== 'Traceability') {
    return [traceabilityFieldError(rel(root, file), 'TRACEABILITY_PLACEMENT', null, 'Traceability must be the final section in behavior specs.')];
  }
  return [];
}

export function validateTraceabilityBlock(data, root, file, line = null) {
  const errors = [];
  const add = (code, field, message) => errors.push(traceabilityFieldError(rel(root, file), code, field, message, line));
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    add('TRACEABILITY_INVALID_JSON', null, 'Traceability block must be a JSON object.');
    return errors;
  }
  if (data.kind !== 'spec') add('TRACEABILITY_INVALID_KIND', 'kind', 'must be "spec" for behavior specs.');
  for (const field of TRACEABILITY_PATH_FIELDS) {
    if (!Array.isArray(data[field])) {
      add('TRACEABILITY_INVALID_FIELD', field, 'must be an array of local relative paths.');
      continue;
    }
    for (const value of data[field]) {
      if (!isLocalRelativeTraceabilityPath(value)) {
        add('TRACEABILITY_INVALID_PATH', field, `invalid local relative path: ${JSON.stringify(value)}.`);
        continue;
      }
      if (!existsSync(resolve(root, value))) add('TRACEABILITY_MISSING_TARGET', field, `target does not exist: ${value}.`);
    }
  }
  for (const field of TRACEABILITY_COMMAND_FIELDS) {
    if (!Array.isArray(data[field])) {
      add('TRACEABILITY_INVALID_FIELD', field, 'must be an array of executable project-local command strings.');
      continue;
    }
    for (const value of data[field]) if (typeof value !== 'string' || value.trim().length === 0) add('TRACEABILITY_INVALID_COMMAND', field, `invalid command: ${JSON.stringify(value)}.`);
  }
  return errors;
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
  const options = { root: '.', includeLocalMemory: false, checkIndex: false, maxLines: 200, maxChars: 10000, linkCheck: true, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--include-local-memory') options.includeLocalMemory = true;
    else if (arg === '--check-index') options.checkIndex = true;
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
  const memoryConfig = readMemoryConfig(root);
  for (const error of memoryConfig.errors ?? []) errors.push(error);
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
    if (requiresTraceability(rel(root, file), memoryConfig)) {
      const blocks = extractDotdotgodTraceabilityBlocks(content);
      if (blocks.length === 0) addError(file, 'TRACEABILITY_MISSING', `Behavior specs must include a fenced \`json dotdotgod\` traceability block as the final section.\n\n${traceabilityExample()}`);
      else for (const error of validateTraceabilityPlacement(content, root, file)) errors.push(error);
      for (const block of blocks) {
        if (block.error) addError(file, 'TRACEABILITY_INVALID_JSON', `Invalid \`json dotdotgod\` block: ${block.error}\n\n${traceabilityExample()}`, block.line);
        else for (const error of validateTraceabilityBlock(block.data, root, file, block.line)) errors.push(error);
      }
    }
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
  if (options.checkIndex) {
    const index = readIndex(root);
    if (!index) {
      addError(cacheFile(root), 'INDEX_MISSING', 'Expected .dotdotgod index cache. Run `dotdotgod index <root>` or a lazy-refreshing command such as `dotdotgod load-snapshot <root> --json`.');
    } else {
      const schemaVersion = index.schemaVersion ?? index.version ?? null;
      if (schemaVersion !== CACHE_VERSION) addError(cacheFile(root), 'INDEX_SCHEMA_MISMATCH', `Index schema is ${String(schemaVersion)}; expected ${CACHE_VERSION}. Run \`dotdotgod index <root>\`.`);
      const indexed = new Map((index.files ?? []).map((file) => [file.path, file.sha256]));
      const indexableMarkdownPaths = new Set(collectIndexFiles(root, memoryConfig).map((file) => rel(root, file)).filter((path) => path.endsWith('.md')));
      for (const file of markdownFiles) {
        const path = rel(root, file);
        if (!indexableMarkdownPaths.has(path)) continue;
        const indexedHash = indexed.get(path);
        const currentHash = fingerprint(file);
        if (!indexedHash) addError(file, 'INDEX_MISSING_FILE', 'Markdown file is not present in the current graph index. Run `dotdotgod index <root>`.');
        else if (indexedHash !== currentHash) addError(file, 'INDEX_STALE', 'Markdown fingerprint differs from the current graph index. Run `dotdotgod index <root>` or a lazy-refreshing command such as `dotdotgod load-snapshot <root> --json`.');
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

const INDEX_TEXT_EXTENSIONS = new Set([
  '.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc', '.org',
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.pyw', '.go', '.rs', '.java', '.kt', '.kts', '.swift', '.rb', '.php', '.cs', '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.m', '.mm', '.scala', '.clj', '.cljs', '.ex', '.exs', '.erl', '.hrl', '.lua', '.pl', '.pm', '.r', '.R', '.sql',
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties', '.xml', '.html', '.htm', '.css', '.scss', '.sass', '.less', '.svg',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.tf', '.tfvars', '.hcl', '.nix', '.cue',
]);
const INDEX_TEXT_FILENAMES = new Set([
  'AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'README', 'README.md', 'LICENSE', 'NOTICE', 'CHANGELOG', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'AUTHORS', 'CODEOWNERS', '.gitignore', '.editorconfig',
  'dotdotgod.config.json', '.dotdotgodrc.json', 'package.json', 'pnpm-workspace.yaml', 'tsconfig.json', 'jsconfig.json',
  'Dockerfile', 'Containerfile', 'Makefile', 'Justfile', 'Procfile', 'Rakefile', 'Gemfile', 'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock', 'pyproject.toml', 'requirements.txt', 'Pipfile', 'Pipfile.lock', 'poetry.lock', 'deno.json', 'deno.jsonc', 'bunfig.toml',
  '.env.example', '.env.sample', '.env.template',
]);
const INDEX_EXCLUDED_DIRS = new Set(['.git', CACHE_DIR, 'node_modules', 'vendor', '.venv', 'venv', 'target', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache', '.pytest_cache', '__pycache__']);

function isExcludedIndexDir(path) {
  return path.split('/').some((part) => INDEX_EXCLUDED_DIRS.has(part));
}

function isSecretIndexPath(path) {
  const name = basename(path);
  return name === '.env' || (/^\.env\./.test(name) && !INDEX_TEXT_FILENAMES.has(name));
}

function isGeneratedIndexPath(path) {
  const name = basename(path);
  return name.endsWith('.min.js') || name.endsWith('.snap') || name.endsWith('.lockb');
}

function isSupportedIndexFile(path) {
  const name = basename(path);
  return INDEX_TEXT_FILENAMES.has(name) || INDEX_TEXT_EXTENSIONS.has(extname(name));
}

export function shouldIndexPath(path, config = defaultMemoryConfig()) {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.endsWith('/placeholder')) return false;
  if (isExcludedIndexDir(normalized) || isSecretIndexPath(normalized) || isGeneratedIndexPath(normalized)) return false;
  const area = resolveMemoryArea(normalized, config);
  if (area?.includeBodiesByDefault === false) return false;
  return isSupportedIndexFile(normalized);
}

function gitIndexCandidates(root) {
  const result = spawnSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function walkIndexCandidates(root, config = readMemoryConfig(root)) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const pathRel = rel(root, path);
      if (entry.isDirectory()) {
        const area = resolveMemoryArea(pathRel, config);
        if (!isExcludedIndexDir(pathRel) && area?.includeBodiesByDefault !== false) walk(path);
      } else if (entry.isFile()) files.push(pathRel);
    }
  };
  walk(root);
  return files;
}

function addDotdotgodLocalMemoryCandidates(root, candidates) {
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'README.md', 'docs/README.md', 'docs/spec/README.md', 'docs/test/README.md', 'docs/arch/README.md', 'docs/plan/README.md', 'docs/archive/README.md']) {
    if (existsSync(join(root, file))) candidates.add(file);
  }
  const planRoot = join(root, 'docs/plan');
  const walkPlan = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walkPlan(path);
      else if (entry.isFile()) candidates.add(rel(root, path));
    }
  };
  walkPlan(planRoot);
}

export function collectIndexFiles(root, config = readMemoryConfig(root)) {
  const candidates = new Set(gitIndexCandidates(root) ?? walkIndexCandidates(root, config));
  addDotdotgodLocalMemoryCandidates(root, candidates);
  return [...candidates].filter((path) => shouldIndexPath(path, config)).map((path) => join(root, path)).filter(existsSync).sort();
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
  if (edge.relation === 'links_to' || edge.relation === 'routes_to' || edge.relation === 'contains_heading' || edge.relation === 'implemented_by' || edge.relation === 'verified_by' || edge.relation === 'related_doc' || edge.relation === 'verification_command' || SEMANTIC_RELATIONS.has(edge.relation)) return 'docs-links';
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

function graphNodeIndex(graph) {
  if (!graph._nodeIndex) {
    Object.defineProperty(graph, '_nodeIndex', {
      value: new Map(graph.nodes.map((node) => [node.id, node])),
      enumerable: false,
      writable: true,
    });
  }
  return graph._nodeIndex;
}

function graphEdgeIndex(graph) {
  if (!graph._edgeIndex) {
    Object.defineProperty(graph, '_edgeIndex', {
      value: new Set(graph.edges.map((edge) => JSON.stringify(edge))),
      enumerable: false,
      writable: true,
    });
  }
  return graph._edgeIndex;
}

function definedEntries(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

export function addNode(graph, id, type, data = {}) {
  const index = graphNodeIndex(graph);
  const existing = index.get(id);
  if (existing) {
    Object.assign(existing, definedEntries(data));
    return;
  }
  const node = { id, type, ...definedEntries(data) };
  graph.nodes.push(node);
  index.set(id, node);
}

export function addEdge(graph, source, target, relation, data = {}) {
  const edge = { source, target, relation, ...data };
  const key = JSON.stringify(edge);
  const index = graphEdgeIndex(graph);
  if (index.has(key)) return;
  graph.edges.push(edge);
  index.add(key);
}

const MEMORY_CONFIG_FILES = ['dotdotgod.config.json', '.dotdotgodrc.json'];
const MEMORY_SCOPES = new Set(['shared', 'local']);
const MEMORY_FRESHNESS = new Set(['fresh', 'stale']);
const DEFAULT_TRACEABILITY_POLICY = {
  required: ['docs/spec/**'],
  exclude: ['**/README.md'],
};
const DEFAULT_IMPACT_RANKING_POLICY = {
  preset: 'balanced',
  weights: { ppr: 40, traceability: 30, memoryPolicy: 10, verification: 15, proximity: 10, semantic: 10, freshness: 5, archivePenalty: -25 },
  ppr: { enabled: true, damping: 0.85, iterations: 20, tolerance: 0.000001 },
  relationWeights: {
    imports: 4,
    tests: 4,
    implemented_by: 4,
    verified_by: 4,
    related_doc: 3,
    verification_command: 3,
    links_to: 2,
    belongs_to_area: 2,
    semantic_similarity: 2,
    mentions_symbol: 2,
    mentions_command: 2,
    mentions_package: 1,
  },
  traceabilityBoosts: { implemented_by: 30, 'incoming:implemented_by': 30, verified_by: 25, 'incoming:verified_by': 25, verification_command: 15, 'incoming:verification_command': 15, related_doc: 12, 'incoming:related_doc': 12 },
  verificationBoosts: { verified_by: 15, 'incoming:verified_by': 15, verification_command: 12, 'incoming:verification_command': 12, 'test-path-proximity': 8, tests: 10, 'incoming:tests': 10 },
  semanticBoosts: { semantic_similarity: 8, 'incoming:semantic_similarity': 8, mentions_symbol: 6, 'incoming:mentions_symbol': 6, mentions_command: 6, 'incoming:mentions_command': 6, mentions_package: 4, 'incoming:mentions_package': 4 },
  proximityBoosts: { imports: 10, 'incoming:imports': 10, 'imports-local-file': 8, 'same-directory': 4, 'shares-import': 3, handles_command: 6, 'incoming:handles_command': 6, emits_event: 5, 'incoming:emits_event': 5, routes_to: 5, 'incoming:routes_to': 5 },
  semantic: { enabled: true, threshold: 0.5, topKPerFile: 5, includeArchiveBodies: false, signals: ['path', 'filename', 'heading', 'symbol', 'export', 'command', 'event', 'package'] },
};
const IMPACT_RANKING_PRESETS = {
  balanced: {},
  'docs-first': { weights: { ppr: 35, traceability: 35, memoryPolicy: 15, verification: 15, proximity: 5, semantic: 8, freshness: 5, archivePenalty: -30 } },
  'code-proximity': { weights: { ppr: 45, traceability: 20, memoryPolicy: 8, verification: 12, proximity: 20, semantic: 8, freshness: 3, archivePenalty: -25 } },
  'test-focused': { weights: { ppr: 35, traceability: 25, memoryPolicy: 8, verification: 25, proximity: 10, semantic: 7, freshness: 5, archivePenalty: -25 } },
  'archive-aware': { weights: { ppr: 35, traceability: 25, memoryPolicy: 10, verification: 15, proximity: 10, semantic: 8, freshness: 3, archivePenalty: -10 } },
};
const SEMANTIC_RELATIONS = new Set(['semantic_similarity', 'mentions_symbol', 'mentions_command', 'mentions_package']);
const IMPACT_RANKING_WEIGHT_KEYS = new Set(['ppr', 'traceability', 'memoryPolicy', 'verification', 'proximity', 'semantic', 'freshness', 'archivePenalty']);
const IMPACT_RANKING_RELATION_KEYS = new Set(['imports', 'tests', 'implemented_by', 'verified_by', 'related_doc', 'verification_command', 'links_to', 'belongs_to_area', 'semantic_similarity', 'mentions_symbol', 'mentions_command', 'mentions_package']);
const IMPACT_RANKING_REASON_KEYS = new Set(['implemented_by', 'incoming:implemented_by', 'verified_by', 'incoming:verified_by', 'verification_command', 'incoming:verification_command', 'related_doc', 'incoming:related_doc', 'test-path-proximity', 'tests', 'incoming:tests', 'semantic_similarity', 'incoming:semantic_similarity', 'mentions_symbol', 'incoming:mentions_symbol', 'mentions_command', 'incoming:mentions_command', 'mentions_package', 'incoming:mentions_package', 'imports', 'incoming:imports', 'imports-local-file', 'same-directory', 'shares-import', 'handles_command', 'incoming:handles_command', 'emits_event', 'incoming:emits_event', 'routes_to', 'incoming:routes_to']);
const SEMANTIC_SIGNAL_KEYS = new Set(['path', 'filename', 'heading', 'symbol', 'export', 'command', 'event', 'package']);
const DEFAULT_MEMORY_AREAS = [
  { id: 'rules', label: 'Agent Rules', paths: ['AGENTS.md'], scope: 'shared', freshness: 'fresh', role: 'agent-working-rules', priority: 100, includeBodiesByDefault: true },
  { id: 'agent-entrypoint', label: 'Agent Entrypoints', paths: ['CLAUDE.md', 'CODEX.md'], scope: 'shared', freshness: 'fresh', role: 'agent-specific-entrypoint', priority: 85, includeBodiesByDefault: true },
  { id: 'project-overview', label: 'Project Overview', paths: ['README.md'], scope: 'shared', freshness: 'fresh', role: 'project-map', priority: 85, includeBodiesByDefault: true },
  { id: 'docs-index', label: 'Docs Index', paths: ['docs/README.md'], scope: 'shared', freshness: 'fresh', role: 'documentation-routing-map', priority: 90, includeBodiesByDefault: true },
  { id: 'spec', label: 'Product Specs', paths: ['docs/spec/**'], scope: 'shared', freshness: 'fresh', role: 'behavior-truth', priority: 80, includeBodiesByDefault: true },
  { id: 'architecture', label: 'Architecture', paths: ['docs/arch/**'], scope: 'shared', freshness: 'fresh', role: 'architecture-rationale', priority: 75, includeBodiesByDefault: true },
  { id: 'test', label: 'Tests', paths: ['docs/test/**'], scope: 'shared', freshness: 'fresh', role: 'verification-knowledge', priority: 70, includeBodiesByDefault: true },
  { id: 'active-plan', label: 'Active Plans', paths: ['docs/plan/**'], scope: 'local', freshness: 'fresh', role: 'active-task-intent', priority: 95, includeBodiesByDefault: true },
  { id: 'archive-map', label: 'Archive Map', paths: ['docs/archive/README.md'], scope: 'local', freshness: 'stale', role: 'historical-memory-map', priority: 65, includeBodiesByDefault: true },
  { id: 'archive-body', label: 'Archive Body', paths: ['docs/archive/**'], excludePaths: ['docs/archive/README.md'], scope: 'local', freshness: 'stale', role: 'historical-memory-body', priority: 20, includeBodiesByDefault: false },
];

function cloneArea(area) {
  return {
    ...area,
    paths: [...(area.paths ?? [])],
    excludePaths: [...(area.excludePaths ?? [])],
  };
}

function cloneTraceabilityPolicy(policy = DEFAULT_TRACEABILITY_POLICY) {
  return {
    required: [...(policy.required ?? [])],
    exclude: [...(policy.exclude ?? [])],
  };
}

function cloneImpactRankingPolicy(policy = DEFAULT_IMPACT_RANKING_POLICY) {
  return {
    preset: policy.preset ?? 'balanced',
    weights: { ...DEFAULT_IMPACT_RANKING_POLICY.weights, ...(policy.weights ?? {}) },
    ppr: { ...DEFAULT_IMPACT_RANKING_POLICY.ppr, ...(policy.ppr ?? {}) },
    relationWeights: { ...DEFAULT_IMPACT_RANKING_POLICY.relationWeights, ...(policy.relationWeights ?? {}) },
    traceabilityBoosts: { ...DEFAULT_IMPACT_RANKING_POLICY.traceabilityBoosts, ...(policy.traceabilityBoosts ?? {}) },
    verificationBoosts: { ...DEFAULT_IMPACT_RANKING_POLICY.verificationBoosts, ...(policy.verificationBoosts ?? {}) },
    semanticBoosts: { ...DEFAULT_IMPACT_RANKING_POLICY.semanticBoosts, ...(policy.semanticBoosts ?? {}) },
    proximityBoosts: { ...DEFAULT_IMPACT_RANKING_POLICY.proximityBoosts, ...(policy.proximityBoosts ?? {}) },
    semantic: { ...DEFAULT_IMPACT_RANKING_POLICY.semantic, ...(policy.semantic ?? {}), signals: [...(policy.semantic?.signals ?? DEFAULT_IMPACT_RANKING_POLICY.semantic.signals)] },
  };
}

function normalizeImpactRankingPolicy(raw) {
  const presetName = typeof raw?.preset === 'string' ? raw.preset : 'balanced';
  const preset = IMPACT_RANKING_PRESETS[presetName] ?? IMPACT_RANKING_PRESETS.balanced;
  return cloneImpactRankingPolicy({ ...preset, ...raw, preset: presetName, weights: { ...(preset.weights ?? {}), ...(raw?.weights ?? {}) }, ppr: { ...(preset.ppr ?? {}), ...(raw?.ppr ?? {}) }, semantic: { ...(preset.semantic ?? {}), ...(raw?.semantic ?? {}) } });
}

export function defaultMemoryConfig() {
  return { source: 'default', areas: DEFAULT_MEMORY_AREAS.map(cloneArea), traceability: cloneTraceabilityPolicy(), impactRanking: cloneImpactRankingPolicy() };
}

function normalizePathPattern(value = '') {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$|^\/+/, '');
}

function isValidPathPattern(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = normalizePathPattern(value);
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') return false;
  if (normalized.includes('*') && !(normalized.endsWith('/**') || normalized.startsWith('**/'))) return false;
  return true;
}

function matchMemoryPattern(path, pattern) {
  const normalized = normalizePathPattern(path);
  const normalizedPattern = normalizePathPattern(pattern);
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.startsWith('**/')) {
    const suffix = normalizedPattern.slice(3);
    return normalized === suffix || normalized.endsWith(`/${suffix}`);
  }
  return normalized === normalizedPattern;
}

function areaMatchesPath(area, path) {
  const excluded = (area.excludePaths ?? []).some((pattern) => matchMemoryPattern(path, pattern));
  if (excluded) return false;
  return (area.paths ?? []).some((pattern) => matchMemoryPattern(path, pattern));
}

function resolveMemoryArea(path = '', config = defaultMemoryConfig()) {
  return (config.areas ?? []).find((area) => areaMatchesPath(area, path));
}

export function memoryAreaForPath(path = '', config = defaultMemoryConfig()) {
  return resolveMemoryArea(path, config)?.id;
}

export function memoryRoleForPath(path = '', config = defaultMemoryConfig()) {
  return resolveMemoryArea(path, config)?.role;
}

export function retrievalPriorityForPath(path = '', config = defaultMemoryConfig()) {
  return resolveMemoryArea(path, config)?.priority ?? 30;
}

function normalizeTraceabilityPolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return cloneTraceabilityPolicy();
  return {
    required: Array.isArray(raw.required) ? raw.required.map(normalizePathPattern) : [],
    exclude: Array.isArray(raw.exclude) ? raw.exclude.map(normalizePathPattern) : [],
  };
}

export function requiresTraceability(path = '', config = defaultMemoryConfig()) {
  const policy = config.traceability ?? DEFAULT_TRACEABILITY_POLICY;
  const excluded = (policy.exclude ?? []).some((pattern) => matchMemoryPattern(path, pattern));
  if (excluded) return false;
  return (policy.required ?? []).some((pattern) => matchMemoryPattern(path, pattern));
}

function normalizeMemoryArea(raw) {
  return {
    id: raw.id,
    label: raw.label ?? raw.id,
    paths: Array.isArray(raw.paths) ? raw.paths.map(normalizePathPattern) : [],
    excludePaths: Array.isArray(raw.excludePaths) ? raw.excludePaths.map(normalizePathPattern) : [],
    scope: raw.scope,
    freshness: raw.freshness,
    role: raw.role ?? raw.id,
    priority: typeof raw.priority === 'number' ? raw.priority : 30,
    includeBodiesByDefault: raw.includeBodiesByDefault !== false,
  };
}

function isFiniteNumberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validateNumberMap(map, keys, min, max) {
  return map && typeof map === 'object' && !Array.isArray(map) && Object.entries(map).every(([key, value]) => keys.has(key) && isFiniteNumberInRange(value, min, max));
}

export function validateMemoryConfigData(data, root = '.', file = 'dotdotgod.config.json') {
  const errors = [];
  const add = (code, field, message) => errors.push({ file: rel(root, resolve(root, file)), code, message: `${field ? `Field "${field}": ` : ''}${message}` });
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    add('MEMORY_CONFIG_INVALID', null, 'Config must be a JSON object.');
    return errors;
  }
  const traceability = data.traceability;
  if (traceability !== undefined) {
    if (!traceability || typeof traceability !== 'object' || Array.isArray(traceability)) {
      add('TRACEABILITY_CONFIG_INVALID', 'traceability', 'Expected an object.');
    } else {
      if (!Array.isArray(traceability.required)) add('TRACEABILITY_CONFIG_INVALID_REQUIRED', 'traceability.required', 'Expected an array of path strings.');
      else if (traceability.required.some((value) => !isValidPathPattern(value))) add('TRACEABILITY_CONFIG_INVALID_REQUIRED', 'traceability.required', 'Expected path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
      if (traceability.exclude !== undefined && !Array.isArray(traceability.exclude)) add('TRACEABILITY_CONFIG_INVALID_EXCLUDE', 'traceability.exclude', 'Expected an array of path strings.');
      else if (Array.isArray(traceability.exclude) && traceability.exclude.some((value) => !isValidPathPattern(value))) add('TRACEABILITY_CONFIG_INVALID_EXCLUDE', 'traceability.exclude', 'Expected path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
    }
  }
  const impactRanking = data.impactRanking;
  if (impactRanking !== undefined) {
    if (!impactRanking || typeof impactRanking !== 'object' || Array.isArray(impactRanking)) {
      add('IMPACT_RANKING_CONFIG_INVALID', 'impactRanking', 'Expected an object.');
    } else {
      if (impactRanking.preset !== undefined && !Object.hasOwn(IMPACT_RANKING_PRESETS, impactRanking.preset)) add('IMPACT_RANKING_CONFIG_INVALID_PRESET', 'impactRanking.preset', 'Expected one of balanced, docs-first, code-proximity, test-focused, or archive-aware.');
      if (impactRanking.weights !== undefined && !validateNumberMap(impactRanking.weights, IMPACT_RANKING_WEIGHT_KEYS, -100, 100)) add('IMPACT_RANKING_CONFIG_INVALID_WEIGHTS', 'impactRanking.weights', 'Expected known numeric weight keys with finite values from -100 to 100.');
      if (impactRanking.relationWeights !== undefined && !validateNumberMap(impactRanking.relationWeights, IMPACT_RANKING_RELATION_KEYS, 0, 20)) add('IMPACT_RANKING_CONFIG_INVALID_RELATION_WEIGHTS', 'impactRanking.relationWeights', 'Expected known relation keys with finite values from 0 to 20.');
      for (const key of ['traceabilityBoosts', 'verificationBoosts', 'semanticBoosts', 'proximityBoosts']) {
        if (impactRanking[key] !== undefined && !validateNumberMap(impactRanking[key], IMPACT_RANKING_REASON_KEYS, 0, 100)) add('IMPACT_RANKING_CONFIG_INVALID_BOOSTS', `impactRanking.${key}`, 'Expected known reason keys with finite values from 0 to 100.');
      }
      if (impactRanking.ppr !== undefined) {
        const ppr = impactRanking.ppr;
        if (!ppr || typeof ppr !== 'object' || Array.isArray(ppr)) add('IMPACT_RANKING_CONFIG_INVALID_PPR', 'impactRanking.ppr', 'Expected an object.');
        else {
          if (ppr.enabled !== undefined && typeof ppr.enabled !== 'boolean') add('IMPACT_RANKING_CONFIG_INVALID_PPR', 'impactRanking.ppr.enabled', 'Expected a boolean.');
          if (ppr.damping !== undefined && !isFiniteNumberInRange(ppr.damping, 0.01, 0.99)) add('IMPACT_RANKING_CONFIG_INVALID_PPR', 'impactRanking.ppr.damping', 'Expected a number greater than 0 and less than 1.');
          if (ppr.iterations !== undefined && (!Number.isInteger(ppr.iterations) || ppr.iterations < 1 || ppr.iterations > 100)) add('IMPACT_RANKING_CONFIG_INVALID_PPR', 'impactRanking.ppr.iterations', 'Expected an integer from 1 to 100.');
          if (ppr.tolerance !== undefined && !isFiniteNumberInRange(ppr.tolerance, 0, 1)) add('IMPACT_RANKING_CONFIG_INVALID_PPR', 'impactRanking.ppr.tolerance', 'Expected a number from 0 to 1.');
        }
      }
      if (impactRanking.semantic !== undefined) {
        const semantic = impactRanking.semantic;
        if (!semantic || typeof semantic !== 'object' || Array.isArray(semantic)) add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic', 'Expected an object.');
        else {
          if (semantic.enabled !== undefined && typeof semantic.enabled !== 'boolean') add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic.enabled', 'Expected a boolean.');
          if (semantic.threshold !== undefined && !isFiniteNumberInRange(semantic.threshold, 0, 1)) add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic.threshold', 'Expected a number from 0 to 1.');
          if (semantic.topKPerFile !== undefined && (!Number.isInteger(semantic.topKPerFile) || semantic.topKPerFile < 0 || semantic.topKPerFile > 20)) add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic.topKPerFile', 'Expected an integer from 0 to 20.');
          if (semantic.includeArchiveBodies !== undefined && typeof semantic.includeArchiveBodies !== 'boolean') add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic.includeArchiveBodies', 'Expected a boolean.');
          if (semantic.signals !== undefined && (!Array.isArray(semantic.signals) || semantic.signals.some((value) => !SEMANTIC_SIGNAL_KEYS.has(value)))) add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic.signals', 'Expected an array of known deterministic signal names.');
        }
      }
    }
  }
  const areas = data.memory?.areas;
  if (areas === undefined) return errors;
  if (!Array.isArray(areas)) {
    add('MEMORY_CONFIG_INVALID_FIELD', 'memory.areas', 'Expected an array.');
    return errors;
  }
  const ids = new Set();
  const exactIncluded = new Map();
  for (const [index, area] of areas.entries()) {
    const prefix = `memory.areas[${index}]`;
    if (!area || typeof area !== 'object' || Array.isArray(area)) {
      add('MEMORY_CONFIG_INVALID_AREA', prefix, 'Expected an object.');
      continue;
    }
    if (typeof area.id !== 'string' || !isKebabCase(area.id)) add('MEMORY_CONFIG_INVALID_ID', `${prefix}.id`, 'Expected a kebab-case string.');
    else if (ids.has(area.id)) add('MEMORY_CONFIG_DUPLICATE_ID', `${prefix}.id`, `Duplicate memory area id: ${area.id}`);
    else ids.add(area.id);
    if (!Array.isArray(area.paths) || area.paths.length === 0 || area.paths.some((value) => !isValidPathPattern(value))) add('MEMORY_CONFIG_INVALID_PATHS', `${prefix}.paths`, 'Expected a non-empty array of path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
    if (area.excludePaths !== undefined && (!Array.isArray(area.excludePaths) || area.excludePaths.some((value) => !isValidPathPattern(value)))) add('MEMORY_CONFIG_INVALID_EXCLUDE_PATHS', `${prefix}.excludePaths`, 'Expected an array of path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
    if (!MEMORY_SCOPES.has(area.scope)) add('MEMORY_CONFIG_INVALID_SCOPE', `${prefix}.scope`, 'Expected "shared" or "local".');
    if (!MEMORY_FRESHNESS.has(area.freshness)) add('MEMORY_CONFIG_INVALID_FRESHNESS', `${prefix}.freshness`, 'Expected "fresh" or "stale".');
    if (area.priority !== undefined && (!Number.isInteger(area.priority) || area.priority < 0 || area.priority > 100)) add('MEMORY_CONFIG_INVALID_PRIORITY', `${prefix}.priority`, 'Expected an integer from 0 to 100.');
    if (area.includeBodiesByDefault !== undefined && typeof area.includeBodiesByDefault !== 'boolean') add('MEMORY_CONFIG_INVALID_INCLUDE_POLICY', `${prefix}.includeBodiesByDefault`, 'Expected a boolean.');
    for (const pattern of area.paths ?? []) {
      if (exactIncluded.has(pattern) && !(area.excludePaths ?? []).includes(pattern)) add('MEMORY_CONFIG_OVERLAP', `${prefix}.paths`, `Path pattern also appears in ${exactIncluded.get(pattern)}: ${pattern}`);
      else exactIncluded.set(pattern, `${prefix}.paths`);
    }
  }
  return errors;
}

export function readMemoryConfig(root = '.') {
  for (const name of MEMORY_CONFIG_FILES) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      const errors = validateMemoryConfigData(data, root, name);
      if (errors.length > 0) return { ...defaultMemoryConfig(), source: name, errors };
      const configuredAreas = data.memory?.areas?.map(normalizeMemoryArea) ?? [];
      const traceability = data.traceability === undefined ? cloneTraceabilityPolicy() : normalizeTraceabilityPolicy(data.traceability);
      const impactRanking = normalizeImpactRankingPolicy(data.impactRanking);
      return configuredAreas.length > 0 ? { source: name, areas: configuredAreas, traceability, impactRanking, errors: [] } : { ...defaultMemoryConfig(), traceability, impactRanking, source: name, errors: [] };
    } catch (error) {
      return { ...defaultMemoryConfig(), source: name, errors: [{ file: name, code: 'MEMORY_CONFIG_INVALID_JSON', message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
  return defaultMemoryConfig();
}

function memoryConfigSummary(config) {
  return {
    source: config.source ?? 'default',
    areas: (config.areas ?? []).map((area) => ({
      id: area.id,
      label: area.label,
      paths: area.paths,
      excludePaths: area.excludePaths ?? [],
      scope: area.scope,
      freshness: area.freshness,
      role: area.role,
      priority: area.priority,
      includeBodiesByDefault: area.includeBodiesByDefault !== false,
    })),
    traceability: cloneTraceabilityPolicy(config.traceability ?? DEFAULT_TRACEABILITY_POLICY),
    impactRanking: cloneImpactRankingPolicy(config.impactRanking ?? DEFAULT_IMPACT_RANKING_POLICY),
  };
}

export function isReadmeIndexPath(path = '') {
  return basename(path) === 'README.md';
}

function retrievalSignalsForPath(path = '', config = defaultMemoryConfig()) {
  const signals = [];
  const definition = resolveMemoryArea(path, config);
  if (definition) {
    signals.push('memory-area', `scope:${definition.scope}`, `freshness:${definition.freshness}`);
  }
  if (path.startsWith('docs/')) signals.push('docs-path');
  if (isReadmeIndexPath(path)) signals.push('readme-index');
  return signals;
}

function retrievalMetadataForPath(path = '', config = defaultMemoryConfig()) {
  const definition = resolveMemoryArea(path, config);
  return {
    area: definition?.id,
    role: definition?.role,
    priority: definition?.priority ?? 30,
    scope: definition?.scope,
    freshness: definition?.freshness,
    includeBodiesByDefault: definition?.includeBodiesByDefault,
    signals: retrievalSignalsForPath(path, config),
  };
}

function fileNodeMetadata(path, file, config = defaultMemoryConfig()) {
  const retrieval = retrievalMetadataForPath(path, config);
  return {
    path,
    extension: file ? extname(file) : extname(path),
    memoryArea: retrieval.area,
    memoryRole: retrieval.role,
    memoryScope: retrieval.scope,
    memoryFreshness: retrieval.freshness,
    retrievalPriority: retrieval.priority,
    retrieval,
  };
}

function addMemoryAreaMembership(graph, fileId, path, config = defaultMemoryConfig()) {
  const definition = resolveMemoryArea(path, config);
  if (!definition) return;
  const areaId = `memory_area:${definition.id}`;
  addNode(graph, areaId, 'memory_area', { area: definition.id, label: definition.label, role: definition.role, scope: definition.scope, freshness: definition.freshness, retrievalPriority: definition.priority, includeBodiesByDefault: definition.includeBodiesByDefault !== false });
  addEdge(graph, fileId, areaId, 'belongs_to_area', { confidence: 'DETERMINISTIC', role: definition.role, scope: definition.scope, freshness: definition.freshness });
}

function addPackageResource(graph, fileId, packagePath, name, target, kind) {
  if (!target || typeof target !== 'string') return;
  const id = `package_resource:${packagePath}#${kind}:${name}`;
  addNode(graph, id, 'package_resource', { name, target, kind, path: packagePath });
  addEdge(graph, fileId, id, 'includes_resource', { kind, confidence: 'EXTRACTED' });
}

function addTraceabilityTarget(graph, sourceId, root, relation, targetPath, data = {}, config = defaultMemoryConfig()) {
  if (!isLocalRelativeTraceabilityPath(targetPath) || !existsSync(resolve(root, targetPath))) return;
  const targetId = `file:${targetPath}`;
  addNode(graph, targetId, 'file', fileNodeMetadata(targetPath, null, config));
  addEdge(graph, sourceId, targetId, relation, { confidence: 'CURATED_TRACEABILITY', ...data });
}

function addTraceabilityGraph(root, fileId, content, graph, config = defaultMemoryConfig()) {
  for (const block of extractDotdotgodTraceabilityBlocks(content)) {
    if (block.error || !block.data || block.data.kind !== 'spec') continue;
    for (const target of block.data.implementedBy ?? []) addTraceabilityTarget(graph, fileId, root, 'implemented_by', target, {}, config);
    for (const target of block.data.verifiedBy ?? []) addTraceabilityTarget(graph, fileId, root, 'verified_by', target, {}, config);
    for (const target of block.data.relatedDocs ?? []) addTraceabilityTarget(graph, fileId, root, 'related_doc', target, {}, config);
    for (const [index, command] of (Array.isArray(block.data.verificationCommands) ? block.data.verificationCommands : []).entries()) {
      if (typeof command !== 'string' || command.trim().length === 0) continue;
      const id = `verification_command:${fileId}#${index}`;
      addNode(graph, id, 'verification_command', { command, path: fileId.replace(/^file:/, '') });
      addEdge(graph, fileId, id, 'verification_command', { confidence: 'CURATED_TRACEABILITY' });
    }
  }
}

export function extractMarkdownGraph(root, file, graph, config = defaultMemoryConfig()) {
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
    addNode(graph, targetId, 'file', fileNodeMetadata(targetPath, null, config));
    addEdge(graph, fileId, targetId, 'links_to', { line, confidence: 'EXTRACTED' });
    if (isReadmeIndexPath(path)) addEdge(graph, fileId, targetId, 'routes_to', { line, confidence: 'CURATED_INDEX', sourceRole: 'readme-index' });
  }
  addTraceabilityGraph(root, fileId, content, graph, config);
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

function isTestPath(path = '') {
  return /(^|\/)(test|tests)\//.test(path) || /\.(test|spec)\.(mjs|cjs|js|jsx|ts|tsx)$/.test(path);
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

  if (isTestPath(path)) {
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

const TOKEN_STOPWORDS = new Set(['a', 'an', 'and', 'app', 'bin', 'code', 'config', 'docs', 'file', 'index', 'lib', 'md', 'mjs', 'node', 'package', 'readme', 'src', 'test', 'tests', 'the', 'ts', 'tsx', 'utils']);

function splitCamelCase(value = '') {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function conceptTokens(value = '') {
  const tokens = new Set();
  for (const raw of splitCamelCase(String(value)).toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || TOKEN_STOPWORDS.has(raw)) continue;
    tokens.add(raw);
  }
  return tokens;
}

function addTokens(target, value) {
  for (const token of conceptTokens(value)) target.add(token);
}

function intersectTokens(a, b) {
  return [...a].filter((token) => b.has(token));
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = intersectTokens(a, b).length;
  const denominator = Math.min(a.size, b.size);
  return denominator === 0 ? 0 : intersection / denominator;
}

function semanticSignalScore(source, target) {
  const path = jaccard(source.pathTokens, target.pathTokens);
  const heading = Math.max(jaccard(source.headingTokens, target.headingTokens), jaccard(source.headingTokens, target.allTokens), jaccard(source.allTokens, target.headingTokens));
  const symbol = Math.max(jaccard(source.symbolTokens, target.symbolTokens), jaccard(source.headingTokens, target.symbolTokens), jaccard(source.symbolTokens, target.headingTokens));
  const command = Math.max(jaccard(source.commandTokens, target.commandTokens), jaccard(source.allTokens, target.commandTokens), jaccard(source.commandTokens, target.allTokens));
  const pkg = Math.max(jaccard(source.packageTokens, target.packageTokens), jaccard(source.allTokens, target.packageTokens), jaccard(source.packageTokens, target.allTokens));
  return { path, filename: path, heading, symbol, export: symbol, command, event: command, package: pkg };
}

function semanticProfileForFile(fileNode, graph) {
  const profile = {
    id: fileNode.id,
    path: fileNode.path,
    retrieval: fileNode.retrieval,
    pathTokens: new Set(),
    headingTokens: new Set(),
    symbolTokens: new Set(),
    commandTokens: new Set(),
    packageTokens: new Set(),
    allTokens: new Set(),
  };
  addTokens(profile.pathTokens, fileNode.path ?? fileNode.id);
  addTokens(profile.pathTokens, basename(fileNode.path ?? ''));

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    if (edge.source !== fileNode.id) continue;
    const target = nodeById.get(edge.target);
    if (!target) continue;
    if (edge.relation === 'contains_heading') addTokens(profile.headingTokens, target.title ?? target.id);
    if (edge.relation === 'declares' || edge.relation === 'exports') addTokens(profile.symbolTokens, target.name ?? target.id);
    if (edge.relation === 'handles_command' || edge.relation === 'emits_event' || edge.relation === 'declares_script') addTokens(profile.commandTokens, target.name ?? target.command ?? target.id);
    if (edge.relation === 'declares_package' || edge.relation === 'declares_bin' || edge.relation === 'includes_resource' || edge.relation === 'depends_on') addTokens(profile.packageTokens, target.name ?? target.target ?? target.id);
  }
  for (const set of [profile.pathTokens, profile.headingTokens, profile.symbolTokens, profile.commandTokens, profile.packageTokens]) {
    for (const token of set) profile.allTokens.add(token);
  }
  return profile;
}

function semanticRelationForProfiles(source, target, scores) {
  if (scores.symbol >= 0.5 && (source.headingTokens.size > 0 || target.headingTokens.size > 0)) return 'mentions_symbol';
  if (scores.command >= 0.5) return 'mentions_command';
  if (scores.package >= 0.5) return 'mentions_package';
  return 'semantic_similarity';
}

export function addDeterministicSemanticEdges(graph, config = defaultMemoryConfig()) {
  const policy = cloneImpactRankingPolicy(config.impactRanking ?? DEFAULT_IMPACT_RANKING_POLICY);
  if (policy.semantic.enabled === false || policy.semantic.topKPerFile === 0) return graph;

  const threshold = policy.semantic.threshold ?? 0.5;
  const topK = policy.semantic.topKPerFile ?? 5;
  const includeArchiveBodies = policy.semantic.includeArchiveBodies === true;
  const enabledSignals = new Set(policy.semantic.signals ?? DEFAULT_IMPACT_RANKING_POLICY.semantic.signals);
  const baseGraph = { nodes: graph.nodes.map((node) => ({ ...node })), edges: graph.edges.filter((edge) => !SEMANTIC_RELATIONS.has(edge.relation)).map((edge) => ({ ...edge })) };
  const files = baseGraph.nodes.filter((node) => node.type === 'file' && node.path);
  const profiles = files.map((node) => semanticProfileForFile(node, baseGraph));

  for (const source of profiles) {
    if (!includeArchiveBodies && source.retrieval?.area === 'archive-body') continue;
    const candidates = [];
    for (const target of profiles) {
      if (source.id === target.id) continue;
      if (!includeArchiveBodies && target.retrieval?.area === 'archive-body') continue;
      const scores = semanticSignalScore(source, target);
      const weighted = Object.entries(scores).filter(([signal]) => enabledSignals.has(signal));
      const score = weighted.length === 0 ? 0 : Math.max(...weighted.map(([, value]) => value));
      if (score < threshold) continue;
      const matchedTerms = intersectTokens(source.allTokens, target.allTokens).slice(0, 12);
      if (matchedTerms.length === 0) continue;
      const relation = semanticRelationForProfiles(source, target, scores);
      const signals = weighted.filter(([, value]) => value > 0).map(([signal]) => signal);
      candidates.push({ target, relation, score, matchedTerms, signals });
    }
    candidates
      .sort((a, b) => b.score - a.score || a.target.id.localeCompare(b.target.id))
      .slice(0, topK)
      .forEach((candidate) => {
        addEdge(baseGraph, source.id, candidate.target.id, candidate.relation, {
          confidence: 'INFERRED_LEXICAL_SEMANTIC',
          score: Math.round(candidate.score * 1000) / 1000,
          matchedTerms: candidate.matchedTerms,
          signals: candidate.signals,
        });
      });
  }
  return baseGraph;
}

export function buildGraph(root, files, config = readMemoryConfig(root)) {
  const graph = { nodes: [], edges: [] };
  for (const file of files) {
    const path = rel(root, file);
    const fileId = `file:${path}`;
    addNode(graph, fileId, 'file', fileNodeMetadata(path, file, config));
    addMemoryAreaMembership(graph, fileId, path, config);
    if (path.endsWith('.md')) extractMarkdownGraph(root, file, graph, config);
    else if (basename(file) === 'package.json') extractPackageGraph(root, file, graph);
    else if (/\.(mjs|cjs|js|jsx|ts|tsx)$/.test(path)) extractScriptGraph(root, file, graph);
  }
  return graph;
}

function collectFingerprints(root, config = readMemoryConfig(root)) {
  return collectIndexFiles(root, config).map((file) => {
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
  const startedAt = Date.now();
  const memoryConfig = readMemoryConfig(root);
  const files = collectFingerprints(root, memoryConfig);
  const indexed = new Map((previous?.files ?? []).map((file) => [file.path, file.sha256]));
  const currentPaths = new Set(files.map((file) => file.path));
  const removedPaths = (previous?.files ?? []).filter((file) => !currentPaths.has(file.path)).map((file) => file.path);
  const changedPaths = [...files.filter((file) => indexed.get(file.path) !== file.sha256).map((file) => file.path), ...removedPaths];
  const changedFiles = files.filter((file) => changedPaths.includes(file.path)).map((file) => join(root, file.path));
  const fullRebuild = !previous?.graph || previous.version !== CACHE_VERSION;
  const refreshReason = !previous ? 'missing' : previous.version !== CACHE_VERSION ? 'schema-mismatch' : removedPaths.length > 0 ? 'content-removed' : changedPaths.length > 0 ? 'content-changed' : 'fresh';
  const rawGraph = fullRebuild ? buildGraph(root, files.map((file) => join(root, file.path)), memoryConfig) : mergeIncrementalGraph(previous.graph, buildGraph(root, changedFiles, memoryConfig), changedPaths);
  const graph = addDeterministicSemanticEdges(rawGraph, memoryConfig);
  const archiveBodiesIncluded = (memoryConfig.areas ?? []).some((area) => area.id === 'archive-body' && area.includeBodiesByDefault !== false);
  return { version: CACHE_VERSION, schemaVersion: CACHE_VERSION, generatedAt: new Date().toISOString(), archiveBodiesIncluded, memoryConfig: memoryConfigSummary(memoryConfig), files, graph, stats: graphStats(graph), incremental: { enabled: true, fullRebuild, changedFiles: changedPaths.length, refreshReason, elapsedMs: Date.now() - startedAt } };
}

export function writeIndex(root, index) {
  const compact = compactGraph(index.graph);
  for (const [name, rows] of Object.entries(compact.nodes)) writeJson(shardFile(root, 'nodes', name), rows);
  for (const [name, rows] of Object.entries(compact.edges)) writeJson(shardFile(root, 'edges', name), rows);
  const graphShards = {
    nodes: Object.fromEntries(Object.keys(compact.nodes).map((name) => [name, rel(root, shardFile(root, 'nodes', name))])),
    edges: Object.fromEntries(Object.keys(compact.edges).map((name) => [name, rel(root, shardFile(root, 'edges', name))])),
  };
  const manifest = { version: index.version, schemaVersion: index.schemaVersion ?? index.version, generatedAt: index.generatedAt, archiveBodiesIncluded: index.archiveBodiesIncluded, memoryConfig: index.memoryConfig, files: index.files, graph: { ...graphStats(index.graph), compactSchema: true, shards: graphShards }, incremental: index.incremental };
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
  const memoryConfig = readMemoryConfig(root);
  const currentFiles = collectFingerprints(root, memoryConfig);
  if (!index) return { ok: false, status: 'missing', cachePath: rel(root, cacheFile(root)), indexedFiles: 0, currentFiles: currentFiles.length, staleFiles: currentFiles.length, archiveBodiesIncluded: false, schemaVersion: null, expectedSchemaVersion: CACHE_VERSION, schemaOk: false, reason: 'missing' };
  const indexed = new Map((index.files ?? []).map((file) => [file.path, file.sha256]));
  const currentMap = new Map(currentFiles.map((file) => [file.path, file.sha256]));
  const stale = currentFiles.filter((file) => indexed.get(file.path) !== file.sha256).map((file) => file.path);
  const removed = [...indexed.keys()].filter((path) => !currentMap.has(path));
  const staleFiles = [...stale, ...removed];
  const schemaVersion = index.schemaVersion ?? index.version ?? null;
  const schemaOk = schemaVersion === CACHE_VERSION;
  const ok = staleFiles.length === 0 && schemaOk;
  const reason = ok ? 'fresh' : !schemaOk ? 'schema-mismatch' : staleFiles.length > 0 ? 'content-changed' : 'unknown';
  return { ok, status: ok ? 'fresh' : 'stale', cachePath: rel(root, cacheFile(root)), indexedFiles: index.files?.length ?? 0, currentFiles: currentFiles.length, staleFiles: staleFiles.length, examples: staleFiles.slice(0, 10), archiveBodiesIncluded: index.archiveBodiesIncluded === true, schemaVersion, expectedSchemaVersion: CACHE_VERSION, schemaOk, reason, graph: graphStats(index.graph ?? { nodes: [], edges: [] }) };
}

export function runIndex(argv) {
  const options = parseCommon(argv);
  const index = buildIndex(options.root);
  const manifest = writeIndex(options.root, index);
  const result = { ok: true, cachePath: rel(options.root, cacheFile(options.root)), schemaVersion: CACHE_VERSION, indexedFiles: index.files.length, nodes: index.graph.nodes.length, edges: index.graph.edges.length, indexSizeBytes: manifest.indexSizeBytes, shards: manifest.graph.shards, incremental: index.incremental, archiveBodiesIncluded: index.archiveBodiesIncluded === true, memoryConfig: index.memoryConfig };
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

export function readFreshIndex(root) {
  const startedAt = Date.now();
  const initialStatus = getStatus(root);
  if (initialStatus.ok) return { status: initialStatus, index: readIndex(root), metadata: { cacheRefreshed: false, elapsedMs: Date.now() - startedAt, refreshReason: 'fresh', schemaVersion: CACHE_VERSION } };

  const index = buildIndex(root);
  const manifest = writeIndex(root, index);
  const status = getStatus(root);
  return {
    status,
    index,
    metadata: {
      cacheRefreshed: true,
      previousStatus: initialStatus.status,
      previousReason: initialStatus.reason,
      refreshReason: index.incremental?.refreshReason ?? initialStatus.reason,
      changedFiles: index.incremental?.changedFiles ?? initialStatus.staleFiles,
      fullRebuild: index.incremental?.fullRebuild === true,
      indexedFiles: index.files.length,
      indexSizeBytes: manifest.indexSizeBytes,
      manifestBytes: manifest.manifestBytes,
      shardBytes: manifest.shardBytes,
      elapsedMs: Date.now() - startedAt,
      indexElapsedMs: index.incremental?.elapsedMs,
      schemaVersion: CACHE_VERSION,
      archiveBodiesIncluded: index.archiveBodiesIncluded === true,
    },
  };
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function sumReasonBoosts(reasons, boosts) {
  return reasons.reduce((sum, reason) => sum + (boosts[reason] ?? 0), 0);
}

function cappedTraceabilityScore(reasons, boosts, cap) {
  const values = reasons.map((reason) => boosts[reason] ?? 0).filter((value) => value > 0);
  if (values.length === 0) return 0;
  return clamp(Math.max(...values) + Math.min(5, Math.max(0, values.length - 1) * 2), 0, cap);
}

function buildPersonalizedPageRank(graph, seed, policy) {
  if (policy.ppr.enabled === false) return new Map();
  const damping = policy.ppr.damping ?? 0.85;
  const iterations = policy.ppr.iterations ?? 20;
  const tolerance = policy.ppr.tolerance ?? 0.000001;
  const ids = new Set(graph.nodes.map((node) => node.id));
  ids.add(seed);
  const adjacency = new Map([...ids].map((id) => [id, []]));
  for (const edge of graph.edges) {
    const weight = policy.relationWeights[edge.relation] ?? relationWeight(edge.relation);
    if (weight <= 0) continue;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source).push([edge.target, weight]);
    adjacency.get(edge.target).push([edge.source, weight]);
  }
  let ranks = new Map([...adjacency.keys()].map((id) => [id, id === seed ? 1 : 0]));
  for (let i = 0; i < iterations; i += 1) {
    const next = new Map([...adjacency.keys()].map((id) => [id, id === seed ? 1 - damping : 0]));
    for (const [id, edges] of adjacency.entries()) {
      const rank = ranks.get(id) ?? 0;
      const total = edges.reduce((sum, [, weight]) => sum + weight, 0);
      if (total === 0) continue;
      for (const [target, weight] of edges) next.set(target, (next.get(target) ?? 0) + damping * rank * (weight / total));
    }
    const delta = [...next.entries()].reduce((sum, [id, rank]) => sum + Math.abs(rank - (ranks.get(id) ?? 0)), 0);
    ranks = next;
    if (delta < tolerance) break;
  }
  return ranks;
}

function scoreImpactItem(item, seed, changedPath, policy, pprScores, maxPpr) {
  if (item.id === seed) {
    return { impactScore: 100, scoreBreakdown: { seed: 100, ppr: 40, traceability: 0, memoryPolicy: 0, verification: 0, proximity: 0, semantic: 0, freshness: 0, archivePenalty: 0 } };
  }
  const reasons = item.reasons ?? [];
  const retrieval = item.retrieval ?? {};
  const pprNormalized = maxPpr > 0 ? (pprScores.get(item.id) ?? 0) / maxPpr : 0;
  const ppr = clamp(pprNormalized * (policy.weights.ppr ?? 40), 0, Math.abs(policy.weights.ppr ?? 40));
  const traceability = cappedTraceabilityScore(reasons, policy.traceabilityBoosts, Math.abs(policy.weights.traceability ?? 30));
  const memoryPolicy = clamp(((retrieval.priority ?? 30) / 100) * Math.abs(policy.weights.memoryPolicy ?? 10), 0, Math.abs(policy.weights.memoryPolicy ?? 10));
  const verification = clamp(sumReasonBoosts(reasons, policy.verificationBoosts) + (item.type === 'test' || isTestPath(item.path ?? '') ? 10 : 0) + (item.type === 'verification_command' ? 12 : 0), 0, Math.abs(policy.weights.verification ?? 15));
  const proximity = clamp(sumReasonBoosts(reasons, policy.proximityBoosts), 0, Math.abs(policy.weights.proximity ?? 10));
  const semantic = clamp(sumReasonBoosts(reasons, policy.semanticBoosts), 0, Math.abs(policy.weights.semantic ?? 10));
  const freshness = retrieval.freshness === 'fresh' ? Math.abs(policy.weights.freshness ?? 5) : retrieval.freshness === 'stale' ? -Math.abs(policy.weights.freshness ?? 5) : 0;
  let archivePenalty = 0;
  if (!changedPath.startsWith('docs/archive/')) {
    if (retrieval.area === 'archive-body') archivePenalty -= Math.abs(policy.weights.archivePenalty ?? -25);
    if (retrieval.includeBodiesByDefault === false) archivePenalty -= 10;
    if (retrieval.freshness === 'stale' && retrieval.area !== 'archive-map') archivePenalty -= 5;
  }
  archivePenalty = clamp(archivePenalty, -Math.abs(policy.weights.archivePenalty ?? -25), 0);
  const impactScore = clamp(ppr + traceability + memoryPolicy + verification + proximity + semantic + freshness + archivePenalty, 0, 100);
  return {
    impactScore: roundScore(impactScore),
    scoreBreakdown: {
      ppr: roundScore(ppr),
      traceability: roundScore(traceability),
      memoryPolicy: roundScore(memoryPolicy),
      verification: roundScore(verification),
      proximity: roundScore(proximity),
      semantic: roundScore(semantic),
      freshness: roundScore(freshness),
      archivePenalty: roundScore(archivePenalty),
    },
  };
}

export function buildImpactReport(index, changedPath, limits = {}) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const config = index?.memoryConfig ? { ...defaultMemoryConfig(), ...index.memoryConfig } : defaultMemoryConfig();
  const policy = cloneImpactRankingPolicy(config.impactRanking ?? DEFAULT_IMPACT_RANKING_POLICY);
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

  const expansionRelations = new Set(['implemented_by', 'verified_by', 'related_doc', 'verification_command', ...SEMANTIC_RELATIONS]);
  for (const edge of graph.edges) {
    if (!expansionRelations.has(edge.relation)) continue;
    if (relatedIds.has(edge.source) && edge.target !== seed) addReason(edge.target, edge.relation);
  }

  const changedDir = dirname(changedPath).replaceAll('\\', '/');
  for (const node of graph.nodes) {
    if (node.type === 'file' && node.path !== changedPath && dirname(node.path).replaceAll('\\', '/') === changedDir) addReason(node.id, 'same-directory');
    if (node.type === 'test' && (node.path.includes(basename(changedPath).replace(/\.(mjs|cjs|js|jsx|ts|tsx)$/, '')) || node.path.includes(changedDir))) addReason(node.id, 'test-path-proximity');
  }

  const seedImports = graph.edges.filter((edge) => edge.source === seed && edge.relation === 'imports').map((edge) => nodeById.get(edge.target)?.specifier).filter(Boolean);
  for (const specifier of seedImports) {
    const importedPath = fileFromImport(changedPath, specifier);
    if (importedPath) addReason(`file:${importedPath}`, 'imports-local-file');
    for (const edge of graph.edges) {
      const node = nodeById.get(edge.target);
      if (edge.relation === 'imports' && node?.specifier === specifier && edge.source !== seed) addReason(edge.source, 'shares-import');
    }
  }

  const pprScores = buildPersonalizedPageRank(graph, seed, policy);
  const candidatePprMax = Math.max(0, ...[...relatedIds].filter((id) => id !== seed).map((id) => pprScores.get(id) ?? 0));
  const relatedAll = [...relatedIds]
    .map((id) => {
      const node = nodeById.get(id) ?? { id };
      const path = node.path ?? id.replace(/^file:/, '').replace(/^test:/, '');
      const reasonList = [...(reasons.get(id) ?? [])];
      const retrieval = node.retrieval ?? retrievalMetadataForPath(path);
      const reasonSignals = reasonList.map((reason) => `reason:${reason}`);
      const scored = scoreImpactItem({ ...node, reasons: reasonList, retrieval }, seed, changedPath, policy, pprScores, candidatePprMax);
      return { ...node, reasons: reasonList, retrieval: { ...retrieval, signals: [...new Set([...(retrieval.signals ?? []), ...reasonSignals])] }, ...scored };
    })
    .sort((a, b) => {
      if (a.id === seed) return -1;
      if (b.id === seed) return 1;
      return (b.impactScore ?? 0) - (a.impactScore ?? 0) || a.id.localeCompare(b.id);
    });
  const related = relatedAll.slice(0, maxRelated);
  for (const item of related) {
    if (item.type === 'file') {
      const area = docsArea(item.path);
      if (area) addImpactItem(groups.docs, { ...item, area }, limits.docs ?? 10);
      else if (isTestPath(item.path)) addImpactItem(groups.tests, item, limits.tests ?? 10);
      else addImpactItem(groups.files, item, limits.files ?? 10);
    } else if (item.type === 'test') addImpactItem(groups.tests, item, limits.tests ?? 10);
    else if (item.type === 'command') addImpactItem(groups.commands, item, limits.commands ?? 10);
    else if (item.type === 'event') addImpactItem(groups.events, item, limits.events ?? 10);
    else if (item.type === 'package_resource') addImpactItem(groups.packageResources, item, limits.packageResources ?? 10);
    else if (item.type === 'symbol' || item.type === 'export') addImpactItem(groups.symbols, item, limits.symbols ?? 10);
  }

  return {
    changed: changedPath,
    ranking: { method: policy.ppr.enabled === false ? 'policy-score' : 'personalized-pagerank+policy', preset: policy.preset, configSource: index?.memoryConfig?.source ?? 'default', weights: policy.weights, ppr: policy.ppr },
    related,
    groups,
    omittedRelated: Math.max(0, relatedAll.length - related.length),
  };
}

const DURABLE_COMMUNITY_NODE_TYPES = new Set(['file', 'memory_area', 'test', 'command', 'event', 'package_resource', 'package', 'script', 'binary']);

function communityKeyForNode(node) {
  if (node.type === 'memory_area') return `memory-${node.area}`;
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
  if (relation === 'imports' || relation === 'tests' || relation === 'handles_command' || relation === 'implemented_by' || relation === 'verified_by') return 4;
  if (relation === 'emits_event' || relation === 'includes_resource' || relation === 'routes_to' || relation === 'related_doc' || relation === 'verification_command') return 3;
  if (relation === 'links_to' || relation === 'belongs_to_area' || relation === 'declares_package' || relation === 'declares_bin' || relation === 'semantic_similarity' || relation === 'mentions_symbol' || relation === 'mentions_command') return 2;
  if (relation === 'mentions_package') return 1;
  return 1;
}

function addCommunityDetails(community, node, itemLimit) {
  community.nodeCount += 1;
  const path = node.path ?? node.id?.replace(/^file:/, '').replace(/^test:/, '');
  if (node.type === 'file') {
    const area = docsArea(path);
    community.omitted += addBounded(area ? community.docs : community.files, path, itemLimit);
  } else if (node.type === 'heading' && node.path) community.omitted += addBounded(community.docs, node.path, itemLimit);
  else if (node.type === 'memory_area') community.omitted += addBounded(community.docs, `memory_area:${node.area}`, itemLimit);
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

export function detectPackageManager(root) {
  const packageFile = join(root, 'package.json');
  if (existsSync(packageFile)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'));
      if (typeof packageJson.packageManager === 'string' && packageJson.packageManager.trim()) {
        const [name] = packageJson.packageManager.split('@');
        if (name) return name;
      }
    } catch {}
  }
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) return 'bun';
  if (existsSync(join(root, 'package-lock.json')) || existsSync(join(root, 'npm-shrinkwrap.json'))) return 'npm';
  return 'npm';
}

function hasCliDependency(packageJson) {
  return ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
    .some((field) => packageJson?.[field] && Object.prototype.hasOwnProperty.call(packageJson[field], '@dotdotgod/cli'));
}

function readRootPackageJson(root) {
  try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch { return null; }
}

export function detectCommandGuidance(root) {
  const packageManager = detectPackageManager(root);
  const packageJson = readRootPackageJson(root);
  const hasLocalSource = existsSync(join(root, 'packages/cli/bin/dotdotgod.mjs')) && packageJson?.name === 'dotdotgod-workspace';
  const hasProjectInstall = hasCliDependency(packageJson) || existsSync(join(root, 'node_modules/.bin/dotdotgod'));
  const prefix = hasLocalSource ? 'node packages/cli/bin/dotdotgod.mjs' : 'npx dotdotgod';
  const source = hasLocalSource ? 'local-source' : hasProjectInstall ? 'project-install' : 'missing-install';
  return {
    source,
    packageManager,
    install: source === 'missing-install' ? 'npm install -D @dotdotgod/cli' : null,
    validate: source === 'local-source' ? `${prefix} validate . --include-local-memory` : `${prefix} validate .`,
    loadSnapshot: `${prefix} load-snapshot . --json`,
    index: `${prefix} index . --json`,
    status: `${prefix} status . --json`,
    verify: packageJson?.scripts?.verify ? `${packageManager} run verify` : null,
  };
}

export function buildMemoryAreas(index, limits = {}) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const itemLimit = limits.items ?? 4;
  const config = index?.memoryConfig?.areas ? index.memoryConfig : defaultMemoryConfig();
  const areas = new Map();
  for (const definition of config.areas ?? []) {
    areas.set(definition.id, { area: definition.id, label: definition.label, role: definition.role, scope: definition.scope, freshness: definition.freshness, priority: definition.priority, includeBodiesByDefault: definition.includeBodiesByDefault !== false, files: [], count: 0, omitted: 0 });
  }
  for (const node of graph.nodes) {
    if (node.type !== 'file') continue;
    const area = node.memoryArea ?? memoryAreaForPath(node.path, config);
    if (!area || !areas.has(area)) continue;
    const summary = areas.get(area);
    summary.count += 1;
    if (summary.files.length < itemLimit) summary.files.push(node.path);
    else summary.omitted += 1;
  }
  const all = [...areas.values()]
    .filter((area) => area.count > 0)
    .sort((a, b) => b.priority - a.priority || a.area.localeCompare(b.area));
  return { areas: all, total: all.length, omitted: 0, method: 'configured-path-classification', source: config.source ?? 'default' };
}

export function runLoadSnapshot(argv) {
  const options = parseCommon(argv);
  const { status, index, metadata } = readFreshIndex(options.root);
  const summary = graphSummary(index);
  const communities = buildCommunities(index, { communities: 5, items: 5 });
  const memoryAreas = buildMemoryAreas(index, { items: 4 });
  const memoryConfig = index.memoryConfig ?? memoryConfigSummary(readMemoryConfig(options.root));
  const memoryPolicy = {
    source: memoryConfig.source ?? 'default',
    sharedAreas: (memoryConfig.areas ?? []).filter((area) => area.scope === 'shared').map((area) => area.id),
    localAreas: (memoryConfig.areas ?? []).filter((area) => area.scope === 'local').map((area) => area.id),
    freshAreas: (memoryConfig.areas ?? []).filter((area) => area.freshness === 'fresh').map((area) => area.id),
    staleAreas: (memoryConfig.areas ?? []).filter((area) => area.freshness === 'stale').map((area) => area.id),
  };
  const bounds = { communities: 5, communityItems: 5, memoryAreaItems: 4, fullGraphIncluded: false, archiveBodiesIncluded: status.archiveBodiesIncluded, archiveMapIncluded: true };
  const quality = {
    indexedFiles: status.indexedFiles,
    currentFiles: status.currentFiles,
    shownCommunities: communities.communities.length,
    totalCommunities: communities.total,
    omittedCommunities: communities.omitted,
    omittedCommunityItems: communities.communities.reduce((sum, community) => sum + (community.omitted ?? 0), 0),
    memoryAreas: memoryAreas.total,
    omittedMemoryAreaItems: memoryAreas.areas.reduce((sum, area) => sum + (area.omitted ?? 0), 0),
    graphNodes: summary.nodes,
    graphEdges: summary.edges,
  };
  const commandGuidance = detectCommandGuidance(options.root);
  let payload = { root: options.root, cache: status, metadata, graph: summary, memoryConfig, memoryPolicy, memoryAreas, communities, bounds, quality, commandGuidance };
  const serialized = JSON.stringify(payload);
  payload = { ...payload, quality: { ...quality, snapshotBytes: Buffer.byteLength(serialized), approxSnapshotTokens: Math.ceil(serialized.length / 4) } };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`dotdotgod load snapshot\n- cache: ${status.status}${metadata.cacheRefreshed ? ' (refreshed)' : ''}\n- indexed files: ${status.indexedFiles}\n- current files: ${status.currentFiles}\n- archive bodies included: ${status.archiveBodiesIncluded ? 'yes' : 'no'}\n- graph: ${summary.nodes} nodes, ${summary.edges} edges\n- memory areas: ${memoryAreas.areas.length}/${memoryAreas.total} shown\n- communities: ${communities.communities.length}/${communities.total} shown, ${communities.omitted} omitted`);
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
  const { status, index, metadata } = readFreshIndex(options.root);
  const impact = options.changed ? buildImpactReport(index, options.changed) : undefined;
  const isImpact = sub === 'impact' || sub === 'query';
  const payload = isImpact
    ? { ok: status.ok, command: 'graph impact', deprecatedAliasUsed: sub === 'query' || undefined, root: options.root, status, metadata, changed: options.changed, related: impact?.related ?? [], impact }
    : sub === 'communities'
      ? { ok: status.ok, command: 'graph communities', root: options.root, status, metadata, graph: graphSummary(index), communities: buildCommunities(index) }
      : { ok: status.ok, command: `graph ${sub}`, root: options.root, status, metadata, graph: graphSummary(index) };
  const refreshNote = metadata.cacheRefreshed ? ', refreshed' : '';
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else if (isImpact) console.log(`graph impact: ${payload.related.length} related node(s), ${impact?.omittedRelated ?? 0} omitted (${status.status}${refreshNote} index)${sub === 'query' ? ' — graph query is deprecated; use graph impact instead.' : ''}`);
  else if (sub === 'communities') console.log(`graph communities: ${payload.communities.communities.length}/${payload.communities.total} shown, ${payload.communities.omitted} omitted (${status.status}${refreshNote} index)`);
  else console.log(`${payload.command}: ${payload.graph.nodes} nodes, ${payload.graph.edges} edges (${status.status}${refreshNote} index)`);
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

