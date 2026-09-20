import { resolveMemoryArea } from '../memory/config.mjs';

function edgeKey(edge) {
  return `${edge.source}\0${edge.target}\0${edge.relation}`;
}

function labelForNode(node) {
  if (node.type === 'contract') return node.title ?? node.contractId ?? node.id;
  return node.path ?? node.command ?? node.name ?? node.target ?? node.id;
}

function adjacencyFor(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  return adjacency;
}

function rootReachability(nodes, edges, seedIds) {
  const adjacency = adjacencyFor(nodes, edges);
  const reachable = new Set();
  const depthByNode = new Map();
  const nearestRootByNode = new Map();
  const queue = [];
  for (const node of nodes) {
    if (!seedIds.has(node.id)) continue;
    reachable.add(node.id);
    depthByNode.set(node.id, 0);
    nearestRootByNode.set(node.id, node.id);
    queue.push(node.id);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const neighbor of adjacency.get(current) ?? []) {
      if (reachable.has(neighbor)) continue;
      reachable.add(neighbor);
      depthByNode.set(neighbor, (depthByNode.get(current) ?? 0) + 1);
      nearestRootByNode.set(neighbor, nearestRootByNode.get(current));
      queue.push(neighbor);
    }
  }
  return { reachable, depthByNode, nearestRootByNode };
}

export function buildImpactGraphPayload(index, impact) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const config = index?.memoryConfig;
  const seedIds = new Set((impact.changedFiles ?? [impact.changed]).map((path) => `file:${path}`));
  const impactItems = new Map((impact.related ?? []).map((item) => [item.id, item]));
  const isAllowedNode = (node) => {
    if (!node) return false;
    if (node.path && resolveMemoryArea(node.path, config)?.scope === 'local') return false;
    return true;
  };
  const sourceNodes = (graph.nodes ?? []).filter(isAllowedNode);
  const indexedNodes = new Map(sourceNodes.map((node) => [node.id, node]));

  const seenEdges = new Set();
  const edges = [];
  for (const edge of graph.edges ?? []) {
    if (!indexedNodes.has(edge.source) || !indexedNodes.has(edge.target)) continue;
    const key = edgeKey(edge);
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push({ source: edge.source, target: edge.target, relation: edge.relation, confidence: edge.confidence, weight: edge.weight ?? edge.relationWeight, score: edge.score, traceabilityKey: edge.traceabilityKey });
  }
  const { reachable, depthByNode, nearestRootByNode } = rootReachability(sourceNodes, edges, seedIds);
  const retainedNodes = sourceNodes.filter((node) => reachable.has(node.id));
  const retainedEdges = edges.filter((edge) => reachable.has(edge.source) && reachable.has(edge.target));
  const nodes = retainedNodes.map((source) => {
    const item = impactItems.get(source.id);
    const seed = seedIds.has(source.id);
    return {
      id: source.id,
      type: source.type ?? item?.type ?? 'file',
      path: source.path ?? item?.path,
      label: labelForNode({ ...source, ...item }),
      seed,
      ranked: Boolean(item),
      depth: depthByNode.get(source.id) ?? 0,
      nearestRoot: nearestRootByNode.get(source.id),
      component: 0,
      seededComponent: true,
      impactScore: seed ? 100 : item?.impactScore ?? 0,
      reasons: seed ? ['changed-file'] : item?.reasons ?? [],
      scoreBreakdown: seed ? { seed: 100 } : item?.scoreBreakdown,
      retrieval: item?.retrieval ?? source.retrieval,
      contractId: item?.contractId ?? source.contractId,
      title: item?.title ?? source.title,
      sections: item?.sections ?? source.sections,
      vectorEvidence: item?.vectorEvidence,
    };
  });

  return {
    changed: impact.changed,
    changedFiles: impact.changedFiles ?? [impact.changed],
    ranking: impact.ranking,
    semantic: impact.semantic,
    complete: true,
    nodes,
    edges: retainedEdges,
    components: retainedNodes.length > 0 ? [{ id: 0, size: retainedNodes.length, seeded: true }] : [],
    diagnostics: {
      rootNodes: retainedNodes.filter((node) => seedIds.has(node.id)).length,
      connectedNodes: retainedNodes.length,
      disconnectedNodesOmitted: sourceNodes.length - retainedNodes.length,
      maximumDepth: Math.max(0, ...depthByNode.values()),
    },
    omittedRelated: impact.omittedRelated ?? 0,
  };
}
