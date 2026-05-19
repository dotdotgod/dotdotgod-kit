import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { runInit } from './init.mjs';
import { commandUsage, hasHelpToken, helpCommandFromArgs, isHelpToken, isVersionToken, parseCommon, printVersion, usage } from './cli/usage.mjs';
import { rel } from './common/paths.mjs';
import { extractAnchors, extractLinks, headingToAnchor, isKebabCase, isUpperSnakeMarkdown, removeCodeBlocks } from './docs/markdown.mjs';
import { extractDotdotgodTraceabilityBlocks, isLocalRelativeTraceabilityPath, traceabilityExample, validateTraceabilityBlock, validateTraceabilityPlacement } from './docs/traceability.mjs';
import { DEFAULT_IMPACT_RANKING_POLICY, DEFAULT_TRACEABILITY_POLICY, DEFAULT_VALIDATION_POLICY, SEMANTIC_RELATIONS, cloneImpactRankingPolicy, cloneReferenceExpansionPolicy, cloneTraceabilityPolicy, cloneValidationPolicy, defaultDotdotgodConfigData, defaultDotdotgodConfigText, defaultMemoryConfig, isMarkdownSizeExcluded, memoryAreaForPath, memoryRoleForPath, normalizeLowSignalTerm, readMemoryConfig, requiresTraceability, resolveMemoryArea, retrievalPriorityForPath, validateMemoryConfigData } from './memory/config.mjs';
import { buildCommunities, relationWeight } from './graph/communities.mjs';
import { addEdge, addNode, compactGraph, expandGraph, graphStats, jsonSize, shardFile, writeJson } from './graph/store.mjs';
import { cacheFile, collectIndexFiles, fingerprint, shouldIndexPath } from './index/files.mjs';
import { buildMemoryAreas, detectCommandGuidance, detectPackageManager } from './load-snapshot/summary.mjs';

export { commandUsage, hasHelpToken, helpCommandFromArgs, isHelpToken, isVersionToken, parseCommon, printVersion, usage } from './cli/usage.mjs';
export { rel } from './common/paths.mjs';
export { extractAnchors, extractLinks, headingToAnchor, isKebabCase, isUpperSnakeMarkdown, removeCodeBlocks } from './docs/markdown.mjs';
export { extractDotdotgodTraceabilityBlocks, isLocalRelativeTraceabilityPath, traceabilityExample, validateTraceabilityBlock, validateTraceabilityPlacement } from './docs/traceability.mjs';
export { DEFAULT_IMPACT_RANKING_POLICY, DEFAULT_TRACEABILITY_POLICY, DEFAULT_VALIDATION_POLICY, SEMANTIC_RELATIONS, cloneImpactRankingPolicy, cloneReferenceExpansionPolicy, cloneTraceabilityPolicy, cloneValidationPolicy, defaultDotdotgodConfigData, defaultDotdotgodConfigText, defaultMemoryConfig, isMarkdownSizeExcluded, memoryAreaForPath, memoryRoleForPath, normalizeLowSignalTerm, readMemoryConfig, requiresTraceability, resolveMemoryArea, retrievalPriorityForPath, validateMemoryConfigData } from './memory/config.mjs';
export { buildCommunities, relationWeight } from './graph/communities.mjs';
export { addEdge, addNode, compactGraph, expandGraph, graphStats, jsonSize, shardFile, writeJson } from './graph/store.mjs';
export { cacheFile, collectIndexFiles, fingerprint, shouldIndexPath } from './index/files.mjs';
export { buildMemoryAreas, detectCommandGuidance, detectPackageManager } from './load-snapshot/summary.mjs';
export const CACHE_VERSION = 10;
const CACHE_DIR = '.dotdotgod';
const MANIFEST_FILE = 'manifest.json';
export function runValidate(argv) {
  const options = { root: '.', includeLocalMemory: false, checkIndex: false, maxLines: null, maxChars: null, linkCheck: true, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--include-local-memory') options.includeLocalMemory = true;
    else if (arg === '--check-index') options.checkIndex = true;
    else if (arg === '--max-lines') options.maxLines = Number(argv[++i]);
    else if (arg === '--max-chars') options.maxChars = Number(argv[++i]);
    else if (arg === '--no-link-check') options.linkCheck = false;
    else if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-')) options.root = arg;
    else usage(`Unknown option: ${arg}`, 'validate');
  }

  const root = resolve(options.root);
  const docs = join(root, 'docs');
  const errors = [];
  const markdownFiles = [];
  const fileCache = new Map();
  const addError = (file, code, message, line = null, fix = null) => errors.push({ file: rel(root, file), line, code, message: fix ? `${message}\nFix: ${fix}` : message });
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
          for (const part of docsRel.split('/')) if (part && !isKebabCase(part)) addError(path, 'DIR_NAMING', `Directory must be kebab-case: ${part}`, null, 'rename this docs directory to kebab-case and update any links that reference it.');
        }
        walk(path);
      } else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(path);
    }
  };

  if (!existsSync(docs)) usage(`docs directory not found: ${docs}`);
  const memoryConfig = readMemoryConfig(root);
  const validationPolicy = cloneValidationPolicy(memoryConfig.validation ?? DEFAULT_VALIDATION_POLICY);
  const maxLines = options.maxLines ?? validationPolicy.markdown.maxLines;
  const maxChars = options.maxChars ?? validationPolicy.markdown.maxChars;
  for (const error of memoryConfig.errors ?? []) errors.push(error);
  walk(docs);
  for (const file of markdownFiles) {
    const name = basename(file);
    const docsRel = rel(docs, file);
    if (docsRel && !docsRel.startsWith('..') && !isUpperSnakeMarkdown(name)) addError(file, 'FILE_NAMING', `Markdown file must be UPPER_SNAKE_CASE.md or README.md: ${name}`, null, 'rename the markdown file to UPPER_SNAKE_CASE.md or README.md and update any links that reference it.');
    const content = readFileSync(file, 'utf8');
    fileCache.set(file, content);
    const lines = content.split('\n').length;
    const path = rel(root, file);
    const skipSizeChecks = isMarkdownSizeExcluded(path, memoryConfig);
    if (!skipSizeChecks && lines > maxLines) addError(file, 'FILE_TOO_LONG', `Markdown file has ${lines} lines; max is ${maxLines}`, null, 'split the document into focused markdown files and update the nearest README.md index, or add a narrow validation.markdown.exclude entry if this file is intentionally oversized.');
    if (!skipSizeChecks && content.length > maxChars) addError(file, 'FILE_TOO_LARGE', `Markdown file has ${content.length} characters; max is ${maxChars}`, null, 'split the document into focused markdown files and update the nearest README.md index, or add a narrow validation.markdown.exclude entry if this file is intentionally oversized.');
    if (requiresTraceability(rel(root, file), memoryConfig)) {
      const blocks = extractDotdotgodTraceabilityBlocks(content);
      if (blocks.length === 0) addError(file, 'TRACEABILITY_MISSING', `Behavior specs must include a fenced \`json dotdotgod\` traceability block as the final section.\nFix: add a final \`## Traceability\` section with the expected \`json dotdotgod\` block and point it at the relevant source, tests, related docs, and verification commands.\n\n${traceabilityExample()}`);
      else for (const error of validateTraceabilityPlacement(content, root, file)) errors.push(error);
      for (const block of blocks) {
        if (block.error) addError(file, 'TRACEABILITY_INVALID_JSON', `Invalid \`json dotdotgod\` block: ${block.error}\nFix: repair the fenced \`json dotdotgod\` block so it is valid JSON and still matches the expected schema.\n\n${traceabilityExample()}`, block.line);
        else for (const error of validateTraceabilityBlock(block.data, root, file, block.line)) errors.push(error);
      }
    }
  }
  const byDir = new Map();
  for (const file of markdownFiles) byDir.set(dirname(file), [...(byDir.get(dirname(file)) ?? []), file]);
  for (const [dir, files] of byDir) if (files.length > 1 && !files.some((file) => basename(file) === 'README.md')) addError(dir, 'MISSING_README', 'Directory with multiple markdown files must include README.md', null, 'add a README.md in this directory that indexes the important markdown files and their purpose.');
  if (options.linkCheck) {
    for (const [file, content] of fileCache) {
      const fileDir = dirname(file);
      for (const { href, line } of extractLinks(content)) {
        const hashIndex = href.indexOf('#');
        const pathPart = hashIndex === -1 ? href : href.slice(0, hashIndex);
        const anchor = hashIndex === -1 ? '' : href.slice(hashIndex + 1);
        const target = pathPart ? resolve(fileDir, pathPart) : file;
        if (pathPart && !existsSync(target)) {
          addError(file, 'BROKEN_LINK', `Local link target does not exist: ${pathPart}`, line, 'update the link target to an existing local file, create the intended file, or remove the stale link.');
          continue;
        }
        if (anchor && extname(target) === '.md') {
          const targetContent = fileCache.get(target) ?? (existsSync(target) ? readFileSync(target, 'utf8') : '');
          if (targetContent && !extractAnchors(targetContent).has(decodeURIComponent(anchor))) addError(file, 'BROKEN_ANCHOR', `Local anchor target does not exist: ${href}`, line, 'update the fragment to a heading that exists in the target markdown file, or add the missing heading.');
        }
      }
    }
  }
  if (options.checkIndex) {
    const index = readIndex(root);
    if (!index) {
      addError(cacheFile(root), 'INDEX_MISSING', 'Expected .dotdotgod index cache.', null, 'run `dotdotgod index <root>` or a lazy-refreshing command such as `dotdotgod load-snapshot <root> --json`.');
    } else {
      const schemaVersion = index.schemaVersion ?? index.version ?? null;
      if (schemaVersion !== CACHE_VERSION) addError(cacheFile(root), 'INDEX_SCHEMA_MISMATCH', `Index schema is ${String(schemaVersion)}; expected ${CACHE_VERSION}.`, null, 'run `dotdotgod index <root>` to rebuild the cache with the current schema.');
      const indexed = new Map((index.files ?? []).map((file) => [file.path, file.sha256]));
      const indexableMarkdownPaths = new Set(collectIndexFiles(root, memoryConfig).map((file) => rel(root, file)).filter((path) => path.endsWith('.md')));
      for (const file of markdownFiles) {
        const path = rel(root, file);
        if (!indexableMarkdownPaths.has(path)) continue;
        const indexedHash = indexed.get(path);
        const currentHash = fingerprint(file);
        if (!indexedHash) addError(file, 'INDEX_MISSING_FILE', 'Markdown file is not present in the current graph index.', null, 'run `dotdotgod index <root>` to refresh the graph index.');
        else if (indexedHash !== currentHash) addError(file, 'INDEX_STALE', 'Markdown fingerprint differs from the current graph index.', null, 'run `dotdotgod index <root>` or a lazy-refreshing command such as `dotdotgod load-snapshot <root> --json`.');
      }
    }
  }

  if (options.includeLocalMemory) {
    for (const area of ['plan', 'archive/plan', 'archive/report']) {
      const areaRoot = join(docs, area);
      if (!existsSync(areaRoot)) continue;
      for (const entry of readdirSync(areaRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!isKebabCase(entry.name)) addError(join(areaRoot, entry.name), 'SLUG_NAMING', `Archive/plan/report slug must be kebab-case: ${entry.name}`, null, 'rename the task/report directory to kebab-case and update any README index links that reference it.');
        const readme = join(areaRoot, entry.name, 'README.md');
        if (!existsSync(readme)) addError(readme, 'MISSING_README', `Expected README.md in docs/${area}/${entry.name}/`, null, 'add a README.md that summarizes the task/report and links any supporting files.');
      }
    }
  }
  const gitignore = join(root, '.gitignore');
  if (!existsSync(gitignore)) addError(gitignore, 'MISSING_GITIGNORE', 'Expected .gitignore', null, 'create .gitignore and include docs/plan, docs/archive, and .dotdotgod entries.');
  else {
    const content = readFileSync(gitignore, 'utf8').split('\n').map((line) => line.trim());
    for (const required of ['docs/plan', 'docs/archive', CACHE_DIR]) if (!content.includes(required)) addError(gitignore, 'MISSING_GITIGNORE_ENTRY', `Expected .gitignore entry: ${required}`, null, `add ${required} to .gitignore so local plans, archives, and cache files stay untracked.`);
  }

  if (options.json) console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
  else if (errors.length === 0) console.log(`✅ docs validation passed (${markdownFiles.length} markdown files)`);
  else {
    for (const error of errors) console.log(`${error.line ? `${error.file}:${error.line}` : error.file} [${error.code}] ${error.message}`);
    console.log(`\n❌ ${errors.length} docs validation error(s)`);
  }
  process.exit(errors.length === 0 ? 0 : 1);
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
    validation: cloneValidationPolicy(config.validation ?? DEFAULT_VALIDATION_POLICY),
    impactRanking: cloneImpactRankingPolicy(config.impactRanking ?? DEFAULT_IMPACT_RANKING_POLICY),
    referenceExpansion: cloneReferenceExpansionPolicy(config.referenceExpansion),
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
  const pkg = Math.max(jaccard(source.packageTokens, target.packageTokens), jaccard(source.allTokens, target.packageTokens), jaccard(source.packageTokens, target.allTokens));
  return { path, filename: path, heading, package: pkg };
}

function semanticProfileForFile(fileNode, graph) {
  const profile = {
    id: fileNode.id,
    path: fileNode.path,
    retrieval: fileNode.retrieval,
    pathTokens: new Set(),
    headingTokens: new Set(),
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
    if (edge.relation === 'declares_package' || edge.relation === 'declares_bin' || edge.relation === 'includes_resource' || edge.relation === 'depends_on') addTokens(profile.packageTokens, target.name ?? target.target ?? target.id);
  }
  for (const set of [profile.pathTokens, profile.headingTokens, profile.packageTokens]) {
    for (const token of set) profile.allTokens.add(token);
  }
  return profile;
}

function semanticRelationForProfiles(source, target, scores) {
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

const CURATED_IMPACT_REASONS = new Set(['implemented_by', 'verified_by', 'related_doc', 'verification_command', 'links_to', 'routes_to', 'belongs_to_area']);
const LOW_ACTIONABILITY_IMPACT_TYPES = new Set(['dependency', 'package', 'script', 'binary', 'heading', 'memory_area']);

function baseImpactReason(reason = '') {
  return reason.replace(/^incoming:/, '');
}

function isSemanticImpactReason(reason = '') {
  return SEMANTIC_RELATIONS.has(baseImpactReason(reason));
}

function isCuratedImpactReason(reason = '') {
  return CURATED_IMPACT_REASONS.has(baseImpactReason(reason));
}

function hasCuratedImpactReason(item) {
  return (item.reasons ?? []).some((reason) => isCuratedImpactReason(reason));
}

function isSemanticOnlyImpactItem(item) {
  const reasons = item.reasons ?? [];
  return reasons.length > 0 && reasons.every((reason) => isSemanticImpactReason(reason));
}

function isLowActionabilityImpactItem(item) {
  return LOW_ACTIONABILITY_IMPACT_TYPES.has(item.type);
}

function impactSelectionScore(item) {
  let score = item.impactScore ?? 0;
  if (hasCuratedImpactReason(item)) score += 4;
  if (item.type === 'file' || item.type === 'test' || item.type === 'verification_command') score += 2;
  if (isSemanticOnlyImpactItem(item)) score -= 12;
  if (isLowActionabilityImpactItem(item)) score -= 15;
  return score;
}

function compareImpactItems(seed) {
  return (a, b) => {
    if (a.id === seed) return -1;
    if (b.id === seed) return 1;
    return impactSelectionScore(b) - impactSelectionScore(a) || (b.impactScore ?? 0) - (a.impactScore ?? 0) || a.id.localeCompare(b.id);
  };
}

function selectImpactItems(sortedItems, maxRelated, seed) {
  const selected = [];
  const selectedIds = new Set();
  const deferred = [];
  const firstPageLimit = Math.min(maxRelated, 10);
  let semanticOnlyInFirstPage = 0;
  let lowActionabilityInFirstPage = 0;
  const firstPagePathCounts = new Map();
  const add = (item, force = false) => {
    if (selected.length >= maxRelated || selectedIds.has(item.id)) return;
    const pathKey = item.path ?? item.id;
    if (!force && item.id !== seed && selected.length < firstPageLimit) {
      if (pathKey && (firstPagePathCounts.get(pathKey) ?? 0) >= 2) {
        deferred.push(item);
        return;
      }
      if (isLowActionabilityImpactItem(item) && lowActionabilityInFirstPage >= 2) {
        deferred.push(item);
        return;
      }
      if (isSemanticOnlyImpactItem(item) && semanticOnlyInFirstPage >= 3) {
        deferred.push(item);
        return;
      }
    }
    selected.push(item);
    selectedIds.add(item.id);
    if (selected.length <= firstPageLimit && item.id !== seed) {
      if (pathKey) firstPagePathCounts.set(pathKey, (firstPagePathCounts.get(pathKey) ?? 0) + 1);
      if (isLowActionabilityImpactItem(item)) lowActionabilityInFirstPage += 1;
      if (isSemanticOnlyImpactItem(item)) semanticOnlyInFirstPage += 1;
    }
  };
  for (const item of sortedItems) if (item.id === seed) add(item, true);
  for (const item of sortedItems) if (item.id !== seed) add(item);
  for (const item of deferred) add(item, true);
  return selected;
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
    .sort(compareImpactItems(seed));
  const related = selectImpactItems(relatedAll, maxRelated, seed);
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
  }

  return {
    changed: changedPath,
    ranking: { method: policy.ppr.enabled === false ? 'policy-score' : 'personalized-pagerank+policy', preset: policy.preset, configSource: index?.memoryConfig?.source ?? 'default', weights: policy.weights, ppr: policy.ppr },
    related,
    groups,
    omittedRelated: Math.max(0, relatedAll.length - related.length),
  };
}

function compactScoreBreakdown(scoreBreakdown = {}) {
  const compact = {};
  for (const [key, value] of Object.entries(scoreBreakdown)) {
    if (value !== 0 && value !== undefined) compact[key] = value;
  }
  return compact;
}

function compactImpactItem(item) {
  const compact = {
    id: item.id,
    type: item.type,
    impactScore: item.impactScore,
    reasons: (item.reasons ?? []).slice(0, 6),
    scoreBreakdown: compactScoreBreakdown(item.scoreBreakdown),
  };
  for (const key of ['path', 'area', 'name', 'command', 'target', 'kind', 'specifier', 'title']) {
    if (item[key] !== undefined) compact[key] = item[key];
  }
  if (item.retrieval) {
    compact.retrieval = {
      area: item.retrieval.area,
      role: item.retrieval.role,
      priority: item.retrieval.priority,
      freshness: item.retrieval.freshness,
    };
  }
  return compact;
}

function compactImpactGroup(group = { items: [], omitted: 0 }, limit = 5) {
  const items = (group.items ?? []).slice(0, limit).map(compactImpactItem);
  return { items, omitted: (group.omitted ?? 0) + Math.max(0, (group.items?.length ?? 0) - items.length) };
}

export function buildCompactImpactReport(impact, limits = {}) {
  const relatedLimit = limits.related ?? 10;
  const groupLimit = limits.groupItems ?? 5;
  const related = (impact.related ?? []).slice(0, relatedLimit).map(compactImpactItem);
  const groupNames = ['files', 'docs', 'tests', 'commands', 'events', 'packageResources', 'symbols'];
  const groups = Object.fromEntries(groupNames.map((name) => [name, compactImpactGroup(impact.groups?.[name], groupLimit)]));
  const top10 = (impact.related ?? []).filter((item) => item.id !== `file:${impact.changed}`).slice(0, 10);
  return {
    changed: impact.changed,
    compact: true,
    ranking: {
      method: impact.ranking?.method,
      preset: impact.ranking?.preset,
      configSource: impact.ranking?.configSource,
    },
    related,
    groups,
    omittedRelated: (impact.omittedRelated ?? 0) + Math.max(0, (impact.related?.length ?? 0) - related.length),
    quality: {
      rawRelated: impact.related?.length ?? 0,
      compactRelated: related.length,
      semanticOnlyTop10: top10.filter((item) => isSemanticOnlyImpactItem(item)).length,
      curatedTop10: top10.filter((item) => hasCuratedImpactReason(item)).length,
      lowActionabilityTop10: top10.filter((item) => isLowActionabilityImpactItem(item)).length,
    },
  };
}

function formatCompactImpactGroup(name, group) {
  const items = group?.items ?? [];
  if (items.length === 0) return [];
  return [
    `${name}:`,
    ...items.map((item) => {
      const label = item.path ?? item.command ?? item.name ?? item.target ?? item.id;
      const reasons = (item.reasons ?? []).slice(0, 3).join(', ');
      return `- ${label} (${item.impactScore}; ${reasons})`;
    }),
  ];
}

function formatCompactImpactOutput(payload, impact) {
  const refreshNote = payload.metadata.cacheRefreshed ? ', refreshed' : '';
  const lines = [`graph impact compact: ${impact.related.length} related node(s), ${impact.omittedRelated ?? 0} omitted (${payload.status.status}${refreshNote} index)`];
  for (const name of ['docs', 'tests', 'files', 'commands', 'events', 'packageResources', 'symbols']) lines.push(...formatCompactImpactGroup(name, impact.groups[name]));
  return lines.join('\n');
}

function ymlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(String(value));
}

function ymlList(values = []) {
  return `[${values.map(ymlScalar).join(', ')}]`;
}

function formatYmlImpactItem(item) {
  const label = item.path ?? item.command ?? item.name ?? item.target ?? item.id;
  const lines = [`        - path: ${ymlScalar(label)}`];
  lines.push(`          id: ${ymlScalar(item.id)}`);
  lines.push(`          type: ${ymlScalar(item.type)}`);
  lines.push(`          score: ${ymlScalar(item.impactScore)}`);
  lines.push(`          reasons: ${ymlList((item.reasons ?? []).slice(0, 6))}`);
  if (item.retrieval?.area) lines.push(`          area: ${ymlScalar(item.retrieval.area)}`);
  if (item.retrieval?.role) lines.push(`          role: ${ymlScalar(item.retrieval.role)}`);
  return lines;
}

function formatYmlImpactGroup(name, group) {
  const items = group?.items ?? [];
  const lines = [`    ${name}:`, `      omitted: ${group?.omitted ?? 0}`, '      items:'];
  if (items.length === 0) lines.push('        []');
  else for (const item of items) lines.push(...formatYmlImpactItem(item));
  return lines;
}

function formatYmlImpactOutput(payload, impact) {
  const lines = [
    'impact:',
    `  ok: ${payload.ok ? 'true' : 'false'}`,
    `  changed: ${ymlScalar(payload.changed)}`,
    `  root: ${ymlScalar(payload.root)}`,
    '  output: "yml"',
    '  status:',
    `    index: ${ymlScalar(payload.status.status)}`,
    `    cache_refreshed: ${payload.metadata.cacheRefreshed ? 'true' : 'false'}`,
    `  related_count: ${impact.related.length}`,
    `  omitted_related: ${impact.omittedRelated ?? 0}`,
    '  ranking:',
    `    method: ${ymlScalar(impact.ranking?.method)}`,
    `    preset: ${ymlScalar(impact.ranking?.preset)}`,
    `    config_source: ${ymlScalar(impact.ranking?.configSource)}`,
    '  groups:',
  ];
  for (const name of ['docs', 'tests', 'files', 'commands', 'events', 'packageResources', 'symbols']) lines.push(...formatYmlImpactGroup(name, impact.groups[name]));
  lines.push('  recommended_actions:');
  lines.push('    - "review_related_docs"');
  lines.push('    - "run_related_tests"');
  lines.push('    - "run_dotdotgod_validate"');
  return lines.join('\n');
}

function formatYmlGraphImpactError(options, message, code = 'GRAPH_IMPACT_ERROR') {
  return [
    'impact:',
    '  ok: false',
    '  command: "graph impact"',
    '  output: "yml"',
    `  compact: ${options.compact ? 'true' : 'false'}`,
    `  root: ${ymlScalar(options.root)}`,
    '  error:',
    `    code: ${ymlScalar(code)}`,
    `    message: ${ymlScalar(message)}`,
    `  usage: ${ymlScalar(commandUsage('graph impact'))}`,
  ].join('\n');
}

function parseConfigOptions(argv, allowForce = false, usageKey = 'config') {
  const options = { root: '.', json: false, force: false };
  let rootSet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (allowForce && arg === '--force') options.force = true;
    else if (!arg.startsWith('-') && !rootSet) {
      options.root = arg;
      rootSet = true;
    } else if (!arg.startsWith('-')) usage(`Unexpected argument: ${arg}`, usageKey);
    else usage(`Unknown option: ${arg}`, usageKey);
  }
  options.root = resolve(options.root);
  return options;
}

function configSourcePath(root, source) {
  return source && source !== 'default' ? join(root, source) : null;
}

function configInitError(options, code, message, path = null) {
  const payload = { ok: false, command: 'config init', root: options.root, path, created: false, overwritten: false, error: { code, message } };
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(2);
  }
  console.error(message);
  process.exit(2);
}

function formatConfigOutput(payload) {
  const errors = payload.errors ?? [];
  const lines = [`dotdotgod config: ${payload.source}${errors.length > 0 ? ' (invalid; using defaults)' : ''}`];
  lines.push(`- path: ${payload.path ?? 'none'}`);
  lines.push(`- memory areas: ${payload.config.areas.length}`);
  lines.push(`- traceability required: ${(payload.config.traceability.required ?? []).join(', ') || 'none'}`);
  lines.push(`- traceability exclude: ${(payload.config.traceability.exclude ?? []).join(', ') || 'none'}`);
  lines.push(`- validation markdown: maxLines=${payload.config.validation.markdown.maxLines}, maxChars=${payload.config.validation.markdown.maxChars}`);
  lines.push(`- validation markdown exclude: ${(payload.config.validation.markdown.exclude ?? []).join(', ') || 'none'}`);
  lines.push(`- impact ranking preset: ${payload.config.impactRanking.preset}`);
  const lowSignal = payload.config.referenceExpansion?.fuzzy?.lowSignal ?? { terms: [], add: [], remove: [] };
  lines.push(`- fuzzy low-signal terms: ${(lowSignal.terms ?? []).join(', ') || 'none'} (add: ${(lowSignal.add ?? []).join(', ') || 'none'}; remove: ${(lowSignal.remove ?? []).join(', ') || 'none'})`);
  if (errors.length > 0) {
    lines.push('- errors:');
    for (const error of errors) lines.push(`  - ${error.code} ${error.file}: ${error.message}`);
  }
  return lines.join('\n');
}

export function runConfig(argv) {
  const isInit = argv[0] === 'init';
  const options = parseConfigOptions(isInit ? argv.slice(1) : argv, isInit, isInit ? 'config init' : 'config');
  if (isInit) {
    if (!existsSync(options.root)) configInitError(options, 'ROOT_NOT_FOUND', `Project root not found: ${options.root}`);
    try {
      if (!statSync(options.root).isDirectory()) configInitError(options, 'ROOT_NOT_DIRECTORY', `Project root is not a directory: ${options.root}`);
    } catch {
      configInitError(options, 'ROOT_NOT_FOUND', `Project root not found: ${options.root}`);
    }
    const target = join(options.root, 'dotdotgod.config.json');
    const rcPath = join(options.root, '.dotdotgodrc.json');
    if (existsSync(rcPath)) configInitError(options, 'CONFIG_RC_EXISTS', `.dotdotgodrc.json already exists; remove or migrate it before initializing dotdotgod.config.json.`, rcPath);
    const existed = existsSync(target);
    if (existed && !options.force) configInitError(options, 'CONFIG_EXISTS', `dotdotgod.config.json already exists. Re-run with --force to overwrite it.`, target);
    writeFileSync(target, defaultDotdotgodConfigText());
    const payload = { ok: true, command: 'config init', root: options.root, path: target, created: !existed, overwritten: existed };
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else console.log(`dotdotgod config init: ${existed ? 'overwrote' : 'created'} ${target}`);
    return;
  }

  const config = readMemoryConfig(options.root);
  const errors = config.errors ?? [];
  const payload = { ok: errors.length === 0, command: 'config', root: options.root, source: config.source ?? 'default', path: configSourcePath(options.root, config.source), config: memoryConfigSummary(config), errors };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(formatConfigOutput(payload));
  if (errors.length > 0) process.exit(1);
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

const DEFAULT_REFERENCE_LIMIT = 5;

export function extractBracketReferences(prompt = '') {
  const refs = [];
  const seen = new Set();
  for (const match of String(prompt).matchAll(/\[\[([^\]]+)\]\]/g)) {
    const raw = match[1].trim();
    if (!raw) continue;
    const target = raw.split('|')[0].trim();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    refs.push({ raw: match[0], target, label: raw.includes('|') ? raw.split('|').slice(1).join('|').trim() : undefined });
  }
  return refs;
}

function fuzzyLowSignalSet(policy = defaultMemoryConfig().referenceExpansion) {
  return new Set(cloneReferenceExpansionPolicy(policy).fuzzy.lowSignal.terms);
}

function fuzzyPhraseAllowed(value = '', lowSignalTerms = fuzzyLowSignalSet()) {
  const normalized = normalizeLowSignalTerm(value);
  if (normalized.length < 3) return false;
  if (lowSignalTerms.has(normalized)) return false;
  return /[a-z0-9가-힣]/i.test(normalized);
}

function fuzzyTokenKey(value = '') {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeReferenceAlias(value = '') {
  return String(value)
    .trim()
    .replace(/^\[\[/, '')
    .replace(/\]\]$/, '')
    .split('|')[0]
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[^a-z0-9/#.]/g, '');
}

function referencePathForNode(node) {
  if (node?.path) return node.path;
  if (typeof node?.id === 'string' && node.id.startsWith('file:')) return node.id.slice(5);
  if (typeof node?.id === 'string' && node.id.startsWith('heading:')) return node.id.slice(8).split('#')[0];
  return '';
}

function isArchiveBodyPath(path = '') {
  return path.startsWith('docs/archive/') && path !== 'docs/archive/README.md';
}

function aliasEntriesForPath(path = '') {
  const entries = [];
  const base = basename(path);
  const ext = extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const withoutMd = path.replace(/\.md$/i, '');
  const parts = withoutMd.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) entries.push({ alias: parts.slice(i).join('/'), kind: 'path-suffix' });
  if (base === 'README.md') {
    const dir = dirname(path).replace(/\\/g, '/');
    entries.push({ alias: basename(dir), kind: 'path' });
  }
  for (const alias of [path, withoutMd, base, stem]) entries.push({ alias, kind: 'path' });
  return entries.filter((entry) => entry.alias);
}

function referenceCandidateAliases(node) {
  const path = referencePathForNode(node);
  const entries = [];
  if (node.type === 'file' && path) entries.push(...aliasEntriesForPath(path));
  if (node.type === 'heading') {
    const fileStem = path ? basename(path, extname(path)) : '';
    const anchor = typeof node.id === 'string' && node.id.includes('#') ? node.id.split('#').pop() : '';
    for (const alias of [node.title, anchor, fileStem && node.title ? `${fileStem}#${node.title}` : '', fileStem && anchor ? `${fileStem}#${anchor}` : '', path && node.title ? `${path}#${node.title}` : '', path && anchor ? `${path}#${anchor}` : '']) entries.push({ alias, kind: 'heading' });
  }
  return entries.filter((entry) => entry.alias);
}

export function extractFuzzyReferences(prompt = '', index = null, options = {}) {
  const text = String(prompt ?? '');
  const masked = text.replace(/\[\[[^\]\n]+\]\]/g, ' ');
  const seen = new Set((options.existingTargets ?? []).map((value) => fuzzyTokenKey(value)));
  const lowSignalTerms = fuzzyLowSignalSet(options.referenceExpansion ?? options.memoryConfig?.referenceExpansion ?? index?.memoryConfig?.referenceExpansion);
  const refs = [];
  const add = (target, reason, confidence = 'medium') => {
    const clean = String(target ?? '').trim().replace(/^['"`]+|['"`]+$/g, '').replace(/\s+/g, ' ');
    if (!fuzzyPhraseAllowed(clean, lowSignalTerms)) return;
    const key = fuzzyTokenKey(clean);
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ raw: clean, target: clean, source: 'fuzzy', confidence, reasons: [reason] });
  };

  for (const match of masked.matchAll(/(?:^|\s)([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?:#[A-Za-z0-9 _-]+)?|[A-Z0-9]{3,})(?=$|\s|[.,:;!?])/g)) add(match[1], 'uppercase_identifier', 'high');
  for (const match of masked.matchAll(/(?:^|\s)((?:\.?\/?(?:docs|packages|src|test|spec|arch|plan|archive)\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+(?:\.md)?(?:#[A-Za-z0-9 _-]+)?)(?=$|\s|[.,:;!?])/g)) add(match[1].replace(/^\.\//, ''), 'path_like', 'high');
  for (const match of masked.matchAll(/[`"']([^`"'\n]{4,80})[`"']/g)) add(match[1], 'quoted_phrase', 'medium');

  const graph = index?.graph ?? null;
  if (graph) {
    const lower = ` ${masked.toLowerCase().replace(/[^a-z0-9가-힣/#._-]+/gi, ' ')} `;
    const aliasByKey = new Map();
    for (const node of graph.nodes ?? []) {
      if (!['file', 'heading'].includes(node.type)) continue;
      const path = referencePathForNode(node);
      if (options.includeArchive !== true && isArchiveBodyPath(path)) continue;
      for (const entry of referenceCandidateAliases(node)) {
        const alias = String(entry.alias ?? '').replace(/\.md$/i, '').replace(/[_-]+/g, ' ').trim();
        if (!fuzzyPhraseAllowed(alias, lowSignalTerms)) continue;
        const words = alias.split(/[\s/]+/).filter(Boolean);
        if (words.length > 3 || words.some((word) => lowSignalTerms.has(normalizeLowSignalTerm(word)))) continue;
        const key = fuzzyTokenKey(alias);
        const previous = aliasByKey.get(key);
        const priority = Number(node.retrievalPriority ?? node.retrieval?.priority ?? 30);
        if (!previous || priority > previous.priority) aliasByKey.set(key, { alias, priority });
      }
    }
    for (const { alias } of [...aliasByKey.values()].sort((a, b) => b.priority - a.priority || b.alias.length - a.alias.length)) {
      const escaped = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s_-]+');
      const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
      if (pattern.test(lower)) add(alias, 'known_alias', 'medium');
      if (refs.length >= (options.maxFuzzyRefs ?? 5)) break;
    }
  }
  return refs.slice(0, options.maxFuzzyRefs ?? 5);
}

function incomingRouteBonus(graph, nodeId) {
  return graph.edges.some((edge) => edge.target === nodeId && edge.relation === 'routes_to') ? 6 : 0;
}

function exactReferenceScore(ref, alias, kind) {
  const rawRef = String(ref).trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const rawAlias = String(alias).trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (rawRef === rawAlias) return kind === 'heading' ? 92 : 110;
  if (rawRef.toLowerCase() === rawAlias.toLowerCase()) return kind === 'heading' ? 88 : 105;
  return 0;
}

export function resolveReferenceCandidates(index, ref, options = {}) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const includeArchive = options.includeArchive === true;
  const limit = Number.isFinite(options.maxResults) ? options.maxResults : DEFAULT_REFERENCE_LIMIT;
  const query = String(ref ?? '').trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
  const normalized = normalizeReferenceAlias(query);
  const byId = new Map();
  for (const node of graph.nodes ?? []) {
    if (!['file', 'heading'].includes(node.type)) continue;
    const path = referencePathForNode(node);
    if (!includeArchive && isArchiveBodyPath(path)) continue;
    let best = null;
    for (const entry of referenceCandidateAliases(node)) {
      const aliasKey = normalizeReferenceAlias(entry.alias);
      if (!aliasKey) continue;
      let score = exactReferenceScore(query, entry.alias, entry.kind);
      if (aliasKey === normalized) score = Math.max(score, entry.kind === 'heading' ? 86 : 96);
      else if (aliasKey.endsWith(normalized) && normalized.length >= 4) score = Math.max(score, entry.kind === 'heading' ? 62 : 70);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { score, alias: entry.alias, aliasKind: entry.kind };
    }
    if (!best) continue;
    const retrievalPriority = Number(node.retrievalPriority ?? node.retrieval?.priority ?? 30);
    const routeBonus = incomingRouteBonus(graph, node.id);
    const memoryBonus = Math.min(12, Math.max(0, retrievalPriority / 10));
    const headingBonus = node.type === 'heading' ? 2 : 0;
    const score = Number((best.score + routeBonus + memoryBonus + headingBonus).toFixed(1));
    const reasons = [best.aliasKind === 'heading' ? 'heading_alias' : 'path_alias'];
    if (routeBonus) reasons.push('readme_routed');
    if (memoryBonus) reasons.push('memory_priority');
    const candidate = { id: node.id, type: node.type, path, title: node.title, score, matchedAlias: best.alias, reasons, retrieval: node.retrieval, memoryArea: node.memoryArea };
    const previous = byId.get(node.id);
    if (!previous || candidate.score > previous.score) byId.set(node.id, candidate);
  }
  const candidates = [...byId.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
  const shown = candidates.slice(0, limit);
  return { input: ref, query, normalized, candidates: shown, top: shown[0] ?? null, ambiguous: shown.length > 1 && shown[0].score - shown[1].score < 5, omitted: Math.max(0, candidates.length - shown.length) };
}

function parseReferenceOptions(argv, command) {
  const filtered = [];
  const options = { maxResults: DEFAULT_REFERENCE_LIMIT, includeArchive: false, withImpact: false, fuzzy: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--max-results') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-') || Number.isNaN(Number.parseInt(next, 10))) usage('Missing or invalid value for --max-results.', command);
      options.maxResults = Math.max(1, Number.parseInt(next, 10));
      i += 1;
    } else if (arg === '--include-archive') options.includeArchive = true;
    else if (arg === '--with-impact') options.withImpact = true;
    else if (arg === '--fuzzy') {
      if (command !== 'expand') usage(`Unknown option: ${arg}`, command);
      options.fuzzy = true;
    }
    else if (arg === '--json') filtered.push(arg);
    else if (arg.startsWith('-')) usage(`Unknown option: ${arg}`, command);
    else filtered.push(arg);
  }
  const operands = filtered.filter((arg) => !arg.startsWith('-'));
  return { ...options, root: resolve(operands[0] ?? '.'), json: filtered.includes('--json'), rootArgv: operands.slice(1) };
}

function attachImpactToRef(index, refResult) {
  const topPath = refResult.top?.path;
  if (!topPath) return refResult;
  const impact = buildCompactImpactReport(buildImpactReport(index, topPath));
  return { ...refResult, impact: { changed: topPath, related: impact.related, groups: impact.groups, omittedRelated: impact.omittedRelated, quality: impact.quality } };
}

function formatReferenceOutput(payload) {
  const refreshNote = payload.metadata.cacheRefreshed ? ', refreshed' : '';
  const lines = [`${payload.command}: ${payload.refs.length} reference(s) (${payload.status.status}${refreshNote} index)`];
  for (const ref of payload.refs) {
    const marker = ref.ambiguous ? ' ambiguous' : '';
    lines.push(`- ${ref.query || ref.input}:${marker} ${ref.candidates.length} candidate(s), ${ref.omitted} omitted`);
    for (const candidate of ref.candidates) {
      const title = candidate.title ? `#${candidate.title}` : '';
      lines.push(`  - ${candidate.path}${title} (${candidate.score}; ${candidate.reasons.join(', ')})`);
    }
  }
  return lines.join('\n');
}

export function runResolve(argv) {
  const options = parseReferenceOptions(argv, 'resolve');
  const ref = options.rootArgv?.join(' ');
  if (!ref) usage('Missing required argument: <ref>.', 'resolve');
  const { status, index, metadata } = readFreshIndex(options.root);
  const refs = [resolveReferenceCandidates(index, ref, options)];
  const payload = { ok: status.ok, command: 'resolve', root: options.root, status, metadata, refs, omitted: refs.reduce((sum, item) => sum + item.omitted, 0) };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(formatReferenceOutput(payload));
}

export function runExpand(argv) {
  const options = parseReferenceOptions(argv, 'expand');
  const prompt = options.rootArgv?.join(' ');
  if (!prompt) usage('Missing required argument: <prompt>.', 'expand');
  const refsInPrompt = extractBracketReferences(prompt);
  if (refsInPrompt.length === 0 && !options.fuzzy) usage('No [[refs]] found in prompt.', 'expand');
  const { status, index, metadata } = readFreshIndex(options.root);
  const fuzzyRefs = options.fuzzy ? extractFuzzyReferences(prompt, index, { ...options, memoryConfig: readMemoryConfig(options.root), existingTargets: refsInPrompt.map((item) => item.target) }) : [];
  let refs = [
    ...refsInPrompt.map((item) => ({ ...resolveReferenceCandidates(index, item.target, options), source: 'explicit', raw: item.raw, label: item.label })),
    ...fuzzyRefs.map((item) => ({ ...resolveReferenceCandidates(index, item.target, options), source: 'fuzzy', raw: item.raw, confidence: item.confidence, reasons: item.reasons })),
  ];
  if (options.withImpact) refs = refs.map((item) => attachImpactToRef(index, item));
  const payload = { ok: status.ok, command: 'expand', root: options.root, prompt, status, metadata, refs, omitted: refs.reduce((sum, item) => sum + item.omitted, 0) };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(formatReferenceOutput(payload));
}

export function parseGraphOptions(argv) {
  const filtered = [];
  let changed;
  let compact = false;
  let yml = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--changed') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        changed = next;
        i += 1;
      }
    } else if (argv[i] === '--compact') compact = true;
    else if (argv[i] === '--yml' || argv[i] === '--yaml') yml = true;
    else filtered.push(argv[i]);
  }
  const options = parseCommon(filtered);
  options.changed = changed;
  options.compact = compact;
  options.yml = yml;
  return options;
}

export function runGraph(argv) {
  const sub = argv[0];
  const isImpact = sub === 'impact';
  if (!['impact', 'communities'].includes(sub)) usage(sub ? `Unknown graph command: ${sub}` : 'Missing graph command.', 'graph');
  const options = parseGraphOptions(argv.slice(1));
  if (isImpact && [options.json, options.compact, options.yml].filter(Boolean).length > 1) {
    const message = 'Choose only one graph impact output mode: --compact, --json, or --yml/--yaml.';
    if (options.json) console.log(JSON.stringify({ ok: false, command: 'graph impact', compact: options.compact || undefined, yml: options.yml || undefined, root: options.root, error: { code: 'OUTPUT_MODE_CONFLICT', message }, usage: commandUsage('graph impact') }, null, 2));
    else if (options.yml) console.log(formatYmlGraphImpactError(options, message, 'OUTPUT_MODE_CONFLICT'));
    else usage(message, 'graph impact');
    process.exit(2);
  }
  if (isImpact && !options.changed) {
    const message = 'Missing required option: --changed <path>. Run `dotdotgod graph impact <root> --changed <path>`.';
    if (options.json) {
      console.log(JSON.stringify({ ok: false, command: 'graph impact', compact: options.compact || undefined, root: options.root, error: { code: 'MISSING_CHANGED', message }, usage: commandUsage('graph impact') }, null, 2));
      process.exit(2);
    }
    if (options.yml) {
      console.log(formatYmlGraphImpactError(options, message, 'MISSING_CHANGED'));
      process.exit(2);
    }
    usage(message, 'graph impact');
  }
  const { status, index, metadata } = readFreshIndex(options.root);
  const rawImpact = isImpact ? buildImpactReport(index, options.changed) : undefined;
  const impact = isImpact && (options.compact || options.yml) ? buildCompactImpactReport(rawImpact) : rawImpact;
  const payload = isImpact
    ? { ok: status.ok, command: 'graph impact', compact: options.compact || undefined, root: options.root, status, metadata, changed: options.changed, related: impact.related, impact }
    : { ok: status.ok, command: 'graph communities', root: options.root, status, metadata, graph: graphSummary(index), communities: buildCommunities(index) };
  const refreshNote = metadata.cacheRefreshed ? ', refreshed' : '';
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else if (isImpact && options.yml) console.log(formatYmlImpactOutput(payload, impact));
  else if (isImpact && options.compact) console.log(formatCompactImpactOutput(payload, impact));
  else if (isImpact) console.log(`graph impact: ${payload.related.length} related node(s), ${impact.omittedRelated ?? 0} omitted (${status.status}${refreshNote} index)`);
  else console.log(`graph communities: ${payload.communities.communities.length}/${payload.communities.total} shown, ${payload.communities.omitted} omitted (${status.status}${refreshNote} index)`);
}

export function runCli(argv = process.argv.slice(2)) {
  const [command = 'help', ...args] = argv;
  if (isVersionToken(command)) printVersion();
  if (command === 'help') usage('', helpCommandFromArgs(args));
  if (isHelpToken(command)) usage('');
  if (hasHelpToken(args)) usage('', helpCommandFromArgs([command, ...args]));
  if (command === 'validate') runValidate(args);
  else if (command === 'init') runInit(args, usage);
  else if (command === 'index') runIndex(args);
  else if (command === 'config') runConfig(args);
  else if (command === 'status') runStatus(args);
  else if (command === 'load-snapshot') runLoadSnapshot(args);
  else if (command === 'resolve') runResolve(args);
  else if (command === 'expand') runExpand(args);
  else if (command === 'graph') runGraph(args);
  else usage(`Unknown command: ${command}`);
}
