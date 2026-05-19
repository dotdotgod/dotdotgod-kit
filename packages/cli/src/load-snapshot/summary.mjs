import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultMemoryConfig, memoryAreaForPath } from '../memory/config.mjs';

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
