import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { extractAnchors } from '../docs/markdown.mjs';
import { fileNodeMetadata } from '../graph/metadata.mjs';

const WARNING_LIMIT = 20;
const edgeKey = (source, target, relation) => `${source}\0${target}\0${relation}`;

// Request-local: persisted source evidence remains intact for target restoration.
export function prepareImpactReferences(index, root, changedPaths) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  if (!root) return { index, warnings: { items: [], total: 0, omitted: 0 } };
  const seeds = new Set(changedPaths.map((path) => `file:${path}`));
  const checks = new Map();
  const inspect = (path) => {
    if (checks.has(path)) return checks.get(path);
    let result;
    try {
      const absolute = resolve(root, path);
      const stat = statSync(absolute);
      result = { status: 'exists' };
      if (stat.isFile() && extname(absolute) === '.md') result.anchors = extractAnchors(readFileSync(absolute, 'utf8'));
    } catch (error) {
      result = { status: ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'missing' : 'unavailable' };
    }
    checks.set(path, result);
    return result;
  };
  const references = graph.nodes.flatMap((node) => (node.references ?? []).map((reference) => ({ ...reference, source: node.id, sourcePath: node.path })));
  const managedEdges = new Set(references.map((ref) => edgeKey(ref.source, `file:${ref.targetPath}`, ref.relation)));
  const adjacency = new Map();
  const connect = (source, target) => {
    if (!adjacency.has(source)) adjacency.set(source, new Set());
    if (!adjacency.has(target)) adjacency.set(target, new Set());
    adjacency.get(source).add(target);
    adjacency.get(target).add(source);
  };
  for (const edge of graph.edges) connect(edge.source, edge.target);
  for (const ref of references) connect(ref.source, `file:${ref.targetPath}`);
  const reachable = new Set(seeds);
  const queue = [...seeds];
  for (let i = 0; i < queue.length; i += 1) for (const id of adjacency.get(queue[i]) ?? []) {
    if (!reachable.has(id)) { reachable.add(id); queue.push(id); }
  }
  const missing = new Set(graph.nodes.filter((node) => node.path && inspect(node.path).status === 'missing' && !seeds.has(node.id)).map((node) => node.id));
  const nodes = new Map(graph.nodes.filter((node) => !missing.has(node.id)).map((node) => [node.id, node]));
  const edges = graph.edges.filter((edge) => !missing.has(edge.source) && !missing.has(edge.target) && !managedEdges.has(edgeKey(edge.source, edge.target, edge.relation)));
  for (const path of changedPaths) {
    const id = `file:${path}`;
    if (!nodes.has(id)) nodes.set(id, { id, type: 'file', ...fileNodeMetadata(path, null, index?.memoryConfig) });
  }
  const warnings = new Map();
  for (const ref of references) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref.href)) continue;
    const targetId = `file:${ref.targetPath}`;
    const check = inspect(ref.targetPath);
    let reason = check.status === 'missing' ? 'MISSING_FILE' : check.status === 'unavailable' ? 'REFERENCE_UNAVAILABLE' : undefined;
    if (!reason && ref.anchor && check.anchors) {
      try { if (!check.anchors.has(decodeURIComponent(ref.anchor))) reason = 'BROKEN_ANCHOR'; }
      catch { reason = 'BROKEN_ANCHOR'; }
    }
    if (reason) {
      if (reachable.has(ref.source) && !missing.has(ref.source)) {
        // README routes repeat ordinary links; show the original reference once.
        const key = `${ref.source}\0${ref.href}\0${ref.data?.line ?? ''}\0${reason}`;
        if (!warnings.has(key)) warnings.set(key, { source: ref.sourcePath ?? ref.source, target: ref.href, targetPath: ref.targetPath, relation: ref.relation, reason, ...(ref.data?.line ? { line: ref.data.line } : {}) });
      }
      // Deleted seeds retain incoming evidence so their referring docs remain reviewable.
      // Uncertain access does not prove that a relation is broken.
      if (reason !== 'REFERENCE_UNAVAILABLE' && !(reason === 'MISSING_FILE' && seeds.has(targetId))) continue;
    }
    if (missing.has(ref.source)) continue;
    if (!nodes.has(targetId)) nodes.set(targetId, { id: targetId, type: 'file', ...fileNodeMetadata(ref.targetPath, null, index?.memoryConfig) });
    edges.push({ source: ref.source, target: targetId, relation: ref.relation, ...ref.data });
  }
  const items = [...warnings.values()].sort((a, b) => a.source.localeCompare(b.source) || (a.line ?? 0) - (b.line ?? 0) || a.target.localeCompare(b.target) || a.reason.localeCompare(b.reason));
  return { index: { ...index, graph: { nodes: [...nodes.values()], edges: edges.filter((edge) => nodes.has(edge.source) && nodes.has(edge.target)) } }, warnings: { items: items.slice(0, WARNING_LIMIT), total: items.length, omitted: Math.max(0, items.length - WARNING_LIMIT) } };
}
