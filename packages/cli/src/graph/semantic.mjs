import { basename } from 'node:path';
import { DEFAULT_IMPACT_RANKING_POLICY, SEMANTIC_RELATIONS, cloneImpactRankingPolicy, defaultMemoryConfig } from '../memory/config.mjs';
import { addEdge } from './store.mjs';

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
  const profile = { id: fileNode.id, path: fileNode.path, retrieval: fileNode.retrieval, pathTokens: new Set(), headingTokens: new Set(), packageTokens: new Set(), allTokens: new Set() };
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
  for (const set of [profile.pathTokens, profile.headingTokens, profile.packageTokens]) for (const token of set) profile.allTokens.add(token);
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
  const enabledSignals = new Set(policy.semantic.signals ?? ['path', 'filename', 'heading', 'package']);
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
        addEdge(baseGraph, source.id, candidate.target.id, candidate.relation, { confidence: 'INFERRED_LEXICAL_SEMANTIC', score: Math.round(candidate.score * 1000) / 1000, matchedTerms: candidate.matchedTerms, signals: candidate.signals });
      });
  }
  return baseGraph;
}
