import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rel } from '../common/paths.mjs';
import { isExcludedIndexDir } from '../index/files.mjs';
import { defaultMemoryConfig, isSecretLikePathPattern, matchPathPattern, memoryAreaForPath } from '../memory/config.mjs';

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

const PINNED_WALK_CAP = 200;

function walkPinnedMatches(root, base, matches, cap) {
  if (!existsSync(base)) return [];
  const results = [];
  const walk = (dir) => {
    if (results.length >= cap) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (results.length >= cap) return;
      const absolute = join(dir, entry.name);
      const path = rel(root, absolute);
      if (entry.isDirectory()) {
        if (!isExcludedIndexDir(path)) walk(absolute);
      } else if (entry.isFile() && matches(path)) results.push(path);
    }
  };
  walk(base);
  return results;
}

function expandPinnedPattern(root, pattern) {
  if (!pattern.includes('*')) {
    try {
      return statSync(join(root, pattern)).isFile() ? [pattern] : [];
    } catch {
      return [];
    }
  }
  const base = pattern.endsWith('/**') ? join(root, pattern.slice(0, -3)) : root;
  return walkPinnedMatches(root, base, (path) => !isSecretLikePathPattern(path) && matchPathPattern(path, pattern), PINNED_WALK_CAP);
}

function readPinnedBody(root, path, maxBodyChars) {
  if (isSecretLikePathPattern(path)) return { path, status: 'skipped', reason: 'secret-like-path' };
  let content;
  try {
    content = readFileSync(join(root, path));
  } catch {
    return { path, status: 'missing' };
  }
  if (content.includes(0)) return { path, status: 'skipped', reason: 'binary' };
  const text = content.toString('utf8');
  const truncated = text.length > maxBodyChars;
  return { path, status: truncated ? 'truncated' : 'present', truncated, chars: text.length, content: truncated ? text.slice(0, maxBodyChars) : text };
}

export function buildPinnedFiles(root, config = defaultMemoryConfig(), limits = {}) {
  const policy = config.load ?? { pinnedPaths: [], pinnedBodies: [] };
  const maxPaths = limits.paths ?? 20;
  const maxBodies = limits.bodies ?? 5;
  const maxBodyChars = limits.bodyChars ?? 10000;
  const entries = new Map();
  const addMatches = (pattern, kind) => {
    const matches = expandPinnedPattern(root, pattern);
    for (const path of matches.length > 0 ? matches : [pattern]) {
      const entry = entries.get(path) ?? { path, status: matches.length > 0 ? 'present' : 'missing', pinnedBy: new Set() };
      entry.pinnedBy.add(kind);
      entries.set(path, entry);
    }
    return matches;
  };
  for (const pattern of policy.pinnedPaths ?? []) addMatches(pattern, 'pinnedPaths');
  const bodyCandidates = new Set();
  for (const pattern of policy.pinnedBodies ?? []) {
    for (const path of addMatches(pattern, 'pinnedBodies')) bodyCandidates.add(path);
  }
  const allPaths = [...entries.values()].sort((a, b) => a.path.localeCompare(b.path));
  const paths = allPaths.slice(0, maxPaths).map((entry) => ({ path: entry.path, status: entry.status, pinnedBy: [...entry.pinnedBy].sort() }));
  const bodies = [];
  let omittedBodies = 0;
  for (const path of [...bodyCandidates].sort()) {
    if (bodies.length >= maxBodies) omittedBodies += 1;
    else bodies.push(readPinnedBody(root, path, maxBodyChars));
  }
  return {
    source: config.source ?? 'default',
    configured: { pinnedPaths: [...(policy.pinnedPaths ?? [])], pinnedBodies: [...(policy.pinnedBodies ?? [])] },
    paths,
    omittedPaths: allPaths.length - paths.length,
    bodies,
    omittedBodies,
    bounds: { maxPaths, maxBodies, maxBodyChars },
  };
}

export function buildMemoryAreas(index, limits = {}) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const itemLimit = limits.items ?? 4;
  const config = index?.memoryConfig?.areas ? index.memoryConfig : defaultMemoryConfig();
  const areas = new Map();
  for (const definition of config.areas ?? []) {
    areas.set(definition.id, {
      area: definition.id,
      label: definition.label,
      role: definition.role,
      ...(definition.description ? { description: definition.description } : {}),
      ...(definition.clarify ? { clarify: definition.clarify } : {}),
      scope: definition.scope,
      freshness: definition.freshness,
      priority: definition.priority,
      includeBodiesByDefault: definition.includeBodiesByDefault !== false,
      files: [],
      count: 0,
      omitted: 0,
    });
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
