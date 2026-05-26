import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseCommon } from '../cli/usage.mjs';
import { rel } from '../common/paths.mjs';
import { readMemoryConfig, memoryConfigSummary } from '../memory/config.mjs';
import { addEdge, addNode, compactGraph, expandGraph, graphStats, jsonSize, shardFile, writeJson } from '../graph/store.mjs';
import { cacheFile, collectIndexFiles, fingerprint } from './files.mjs';
import { CACHE_VERSION } from './constants.mjs';
import { buildGraph } from '../graph/extract.mjs';
import { addDeterministicSemanticEdges } from '../graph/semantic.mjs';

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
  const graphShards = { nodes: Object.fromEntries(Object.keys(compact.nodes).map((name) => [name, rel(root, shardFile(root, 'nodes', name))])), edges: Object.fromEntries(Object.keys(compact.edges).map((name) => [name, rel(root, shardFile(root, 'edges', name))])) };
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
  return { status, index, metadata: { cacheRefreshed: true, previousStatus: initialStatus.status, previousReason: initialStatus.reason, refreshReason: index.incremental?.refreshReason ?? initialStatus.reason, changedFiles: index.incremental?.changedFiles ?? initialStatus.staleFiles, fullRebuild: index.incremental?.fullRebuild === true, indexedFiles: index.files.length, indexSizeBytes: manifest.indexSizeBytes, manifestBytes: manifest.manifestBytes, shardBytes: manifest.shardBytes, elapsedMs: Date.now() - startedAt, indexElapsedMs: index.incremental?.elapsedMs, schemaVersion: CACHE_VERSION, archiveBodiesIncluded: index.archiveBodiesIncluded === true } };
}

export function graphSummary(index) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const byType = graph.nodes.reduce((acc, node) => ({ ...acc, [node.type]: (acc[node.type] ?? 0) + 1 }), {});
  const byRelation = graph.edges.reduce((acc, edge) => ({ ...acc, [edge.relation]: (acc[edge.relation] ?? 0) + 1 }), {});
  return { nodes: graph.nodes.length, edges: graph.edges.length, byType, byRelation };
}
