import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SEMANTIC_RELATIONS } from '../memory/config.mjs';

const CACHE_DIR = '.dotdotgod';
const GRAPH_NODE_SHARDS = ['docs', 'packages', 'source'];
const GRAPH_EDGE_SHARDS = ['docs-links', 'packages', 'other'];

function graphNodeShard(node) {
  const path = node.path ?? '';
  if (path.startsWith('docs/') || node.type === 'heading') return 'docs';
  if (node.type === 'package' || node.type === 'script' || node.type === 'binary' || node.type === 'dependency' || node.type === 'package_resource') return 'packages';
  return 'source';
}

function graphEdgeShard(edge) {
  if (edge.relation === 'links_to' || edge.relation === 'routes_to' || edge.relation === 'contains_heading' || edge.relation === 'implemented_by' || edge.relation === 'verified_by' || edge.relation === 'related_doc' || edge.relation === 'verification_command' || SEMANTIC_RELATIONS.has(edge.relation)) return 'docs-links';
  if (edge.relation === 'declares_package' || edge.relation === 'declares_script' || edge.relation === 'declares_bin' || edge.relation === 'depends_on' || edge.relation === 'includes_resource') return 'packages';
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

export function shardFile(root, kind, name) {
  return join(root, CACHE_DIR, 'graph', kind, `${name}.json`);
}

export function jsonSize(file) {
  return existsSync(file) ? statSync(file).size : 0;
}

export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value)}\n`);
}

export function compactGraph(graph) {
  const nodes = Object.fromEntries(GRAPH_NODE_SHARDS.map((name) => [name, []]));
  const edges = Object.fromEntries(GRAPH_EDGE_SHARDS.map((name) => [name, []]));
  for (const node of graph.nodes) nodes[graphNodeShard(node)].push(compactNode(node));
  for (const edge of graph.edges) edges[graphEdgeShard(edge)].push(compactEdge(edge));
  return { nodes, edges };
}

export function expandGraph(compact) {
  return {
    nodes: Object.values(compact?.nodes ?? {}).flat().map(expandNode),
    edges: Object.values(compact?.edges ?? {}).flat().map(expandEdge),
  };
}

export function graphStats(graph) {
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
