import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { rel } from '../common/paths.mjs';
import { headingToAnchor } from '../docs/markdown.mjs';
import { extractDotdotgodTraceabilityBlocks, isLocalRelativeTraceabilityPath } from '../docs/traceability.mjs';
import { defaultMemoryConfig, resolveMemoryArea } from '../memory/config.mjs';
import { addEdge, addNode } from './store.mjs';

export function isReadmeIndexPath(path = '') {
  return basename(path) === 'README.md';
}

function retrievalSignalsForPath(path = '', config = defaultMemoryConfig()) {
  const signals = [];
  const definition = resolveMemoryArea(path, config);
  if (definition) signals.push('memory-area', `scope:${definition.scope}`, `freshness:${definition.freshness}`);
  if (path.startsWith('docs/')) signals.push('docs-path');
  if (isReadmeIndexPath(path)) signals.push('readme-index');
  return signals;
}

export function retrievalMetadataForPath(path = '', config = defaultMemoryConfig()) {
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

export function fileNodeMetadata(path, file, config = defaultMemoryConfig()) {
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

export function addMemoryAreaMembership(graph, fileId, path, config = defaultMemoryConfig()) {
  const definition = resolveMemoryArea(path, config);
  if (!definition) return;
  const areaId = `memory_area:${definition.id}`;
  addNode(graph, areaId, 'memory_area', { area: definition.id, label: definition.label, role: definition.role, scope: definition.scope, freshness: definition.freshness, retrievalPriority: definition.priority, includeBodiesByDefault: definition.includeBodiesByDefault !== false });
  addEdge(graph, fileId, areaId, 'belongs_to_area', { confidence: 'DETERMINISTIC', role: definition.role, scope: definition.scope, freshness: definition.freshness });
}

export function addPackageResource(graph, fileId, packagePath, name, target, kind) {
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

function contractNodeId(filePath, contractId) {
  return `contract:${filePath}#${contractId}`;
}

function traceabilityCommandId(sourceId, key, command) {
  const digest = createHash('sha256').update(`${sourceId}\0${key}\0${command}`).digest('hex').slice(0, 16);
  return `command:${key}:${digest}`;
}

function addTraceabilityValues(graph, sourceId, root, filePath, definition, values, config) {
  for (const value of Array.isArray(values) ? values : []) {
    if (definition.target === 'path') {
      addTraceabilityTarget(graph, sourceId, root, definition.relation, value, { traceabilityKey: definition.key, relationWeight: definition.weight }, config);
      continue;
    }
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    const id = traceabilityCommandId(sourceId, definition.key, value);
    addNode(graph, id, 'command', { command: value, path: filePath, traceabilityKey: definition.key, relation: definition.relation });
    addEdge(graph, sourceId, id, definition.relation, { confidence: 'CURATED_TRACEABILITY', traceabilityKey: definition.key, relationWeight: definition.weight });
  }
}

function addTraceabilityContracts(graph, root, fileId, filePath, contracts, config = defaultMemoryConfig()) {
  if (!Array.isArray(contracts)) return;
  for (const contract of contracts) {
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) continue;
    if (typeof contract.id !== 'string' || contract.id.trim().length === 0) continue;
    if (typeof contract.title !== 'string' || contract.title.trim().length === 0) continue;
    const id = contractNodeId(filePath, contract.id);
    const sections = Array.isArray(contract.sections) ? contract.sections.filter((section) => typeof section === 'string' && section.trim().length > 0) : undefined;
    addNode(graph, id, 'contract', { path: filePath, contractId: contract.id, title: contract.title, sections });
    addEdge(graph, fileId, id, 'defines_contract', { confidence: 'CURATED_TRACEABILITY' });
    for (const definition of config.traceability?.keys ?? []) addTraceabilityValues(graph, id, root, filePath, definition, contract[definition.key], config);
  }
}

export function addTraceabilityGraph(root, fileId, content, graph, config = defaultMemoryConfig()) {
  const filePath = fileId.replace(/^file:/, '');
  for (const block of extractDotdotgodTraceabilityBlocks(content)) {
    if (block.error || !block.data || block.data.kind !== 'spec') continue;
    for (const definition of config.traceability?.keys ?? []) addTraceabilityValues(graph, fileId, root, filePath, definition, block.data[definition.key], config);
    addTraceabilityContracts(graph, root, fileId, filePath, block.data.contracts, config);
  }
}

export function headingId(path, title) {
  return `heading:${path}#${headingToAnchor(title)}`;
}
