import { Graph, leiden } from 'leiden-ts';

const DURABLE_COMMUNITY_NODE_TYPES = new Set(['file', 'memory_area', 'package_resource', 'package', 'script', 'binary']);

function docsArea(path = '') {
  if (path.startsWith('docs/spec/')) return 'spec';
  if (path.startsWith('docs/test/')) return 'test';
  if (path.startsWith('docs/arch/')) return 'architecture';
  if (path.startsWith('docs/plan/')) return 'active-plan';
  if (path.startsWith('docs/archive/')) return 'archive';
  return null;
}

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

export function relationWeight(relation) {
  if (relation === 'implemented_by' || relation === 'verified_by') return 4;
  if (relation === 'includes_resource' || relation === 'routes_to' || relation === 'related_doc' || relation === 'verification_command') return 3;
  if (relation === 'links_to' || relation === 'belongs_to_area' || relation === 'declares_package' || relation === 'declares_bin' || relation === 'semantic_similarity') return 2;
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
