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

export function addTraceabilityGraph(root, fileId, content, graph, config = defaultMemoryConfig()) {
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

export function headingId(path, title) {
  return `heading:${path}#${headingToAnchor(title)}`;
}
