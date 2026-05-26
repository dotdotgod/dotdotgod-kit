import { SEMANTIC_RELATIONS } from '../memory/config.mjs';
import { relationWeight } from '../graph/communities.mjs';

export function isTestPath(path = '') {
  return /(^|\/)(test|tests)\//.test(path) || /\.(test|spec)\.(mjs|cjs|js|jsx|ts|tsx)$/.test(path);
}

export function docsArea(path = '') {
  if (path.startsWith('docs/spec/')) return 'spec';
  if (path.startsWith('docs/arch/')) return 'arch';
  if (path.startsWith('docs/test/')) return 'test-docs';
  if (path.startsWith('docs/plan/')) return 'plan';
  if (path.startsWith('docs/archive/')) return 'archive-index';
  if (path.startsWith('docs/')) return 'docs';
  return undefined;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function sumReasonBoosts(reasons, boosts) {
  return reasons.reduce((sum, reason) => sum + (boosts[reason] ?? 0), 0);
}

function cappedTraceabilityScore(reasons, boosts, cap) {
  const values = reasons.map((reason) => boosts[reason] ?? 0).filter((value) => value > 0);
  if (values.length === 0) return 0;
  return clamp(Math.max(...values) + Math.min(5, Math.max(0, values.length - 1) * 2), 0, cap);
}

export function buildPersonalizedPageRank(graph, seed, policy) {
  if (policy.ppr.enabled === false) return new Map();
  const damping = policy.ppr.damping ?? 0.85;
  const iterations = policy.ppr.iterations ?? 20;
  const tolerance = policy.ppr.tolerance ?? 0.000001;
  const ids = new Set(graph.nodes.map((node) => node.id));
  ids.add(seed);
  const adjacency = new Map([...ids].map((id) => [id, []]));
  for (const edge of graph.edges) {
    const weight = policy.relationWeights[edge.relation] ?? relationWeight(edge.relation);
    if (weight <= 0) continue;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source).push([edge.target, weight]);
    adjacency.get(edge.target).push([edge.source, weight]);
  }
  let ranks = new Map([...adjacency.keys()].map((id) => [id, id === seed ? 1 : 0]));
  for (let i = 0; i < iterations; i += 1) {
    const next = new Map([...adjacency.keys()].map((id) => [id, id === seed ? 1 - damping : 0]));
    for (const [id, edges] of adjacency.entries()) {
      const rank = ranks.get(id) ?? 0;
      const total = edges.reduce((sum, [, weight]) => sum + weight, 0);
      if (total === 0) continue;
      for (const [target, weight] of edges) next.set(target, (next.get(target) ?? 0) + damping * rank * (weight / total));
    }
    const delta = [...next.entries()].reduce((sum, [id, rank]) => sum + Math.abs(rank - (ranks.get(id) ?? 0)), 0);
    ranks = next;
    if (delta < tolerance) break;
  }
  return ranks;
}

export function scoreImpactItem(item, seed, changedPath, policy, pprScores, maxPpr) {
  if (item.id === seed) return { impactScore: 100, scoreBreakdown: { seed: 100, ppr: 40, traceability: 0, memoryPolicy: 0, verification: 0, proximity: 0, semantic: 0, freshness: 0, archivePenalty: 0 } };
  const reasons = item.reasons ?? [];
  const retrieval = item.retrieval ?? {};
  const pprNormalized = maxPpr > 0 ? (pprScores.get(item.id) ?? 0) / maxPpr : 0;
  const ppr = clamp(pprNormalized * (policy.weights.ppr ?? 40), 0, Math.abs(policy.weights.ppr ?? 40));
  const traceability = cappedTraceabilityScore(reasons, policy.traceabilityBoosts, Math.abs(policy.weights.traceability ?? 30));
  const memoryPolicy = clamp(((retrieval.priority ?? 30) / 100) * Math.abs(policy.weights.memoryPolicy ?? 10), 0, Math.abs(policy.weights.memoryPolicy ?? 10));
  const verification = clamp(sumReasonBoosts(reasons, policy.verificationBoosts) + (item.type === 'test' || isTestPath(item.path ?? '') ? 10 : 0) + (item.type === 'verification_command' ? 12 : 0), 0, Math.abs(policy.weights.verification ?? 15));
  const proximity = clamp(sumReasonBoosts(reasons, policy.proximityBoosts), 0, Math.abs(policy.weights.proximity ?? 10));
  const semantic = clamp(sumReasonBoosts(reasons, policy.semanticBoosts), 0, Math.abs(policy.weights.semantic ?? 10));
  const freshness = retrieval.freshness === 'fresh' ? Math.abs(policy.weights.freshness ?? 5) : retrieval.freshness === 'stale' ? -Math.abs(policy.weights.freshness ?? 5) : 0;
  let archivePenalty = 0;
  if (!changedPath.startsWith('docs/archive/')) {
    if (retrieval.area === 'archive-body') archivePenalty -= Math.abs(policy.weights.archivePenalty ?? -25);
    if (retrieval.includeBodiesByDefault === false) archivePenalty -= 10;
    if (retrieval.freshness === 'stale' && retrieval.area !== 'archive-map') archivePenalty -= 5;
  }
  archivePenalty = clamp(archivePenalty, -Math.abs(policy.weights.archivePenalty ?? -25), 0);
  const impactScore = clamp(ppr + traceability + memoryPolicy + verification + proximity + semantic + freshness + archivePenalty, 0, 100);
  return { impactScore: roundScore(impactScore), scoreBreakdown: { ppr: roundScore(ppr), traceability: roundScore(traceability), memoryPolicy: roundScore(memoryPolicy), verification: roundScore(verification), proximity: roundScore(proximity), semantic: roundScore(semantic), freshness: roundScore(freshness), archivePenalty: roundScore(archivePenalty) } };
}

const CURATED_IMPACT_REASONS = new Set(['implemented_by', 'verified_by', 'related_doc', 'verification_command', 'links_to', 'routes_to', 'belongs_to_area']);
const LOW_ACTIONABILITY_IMPACT_TYPES = new Set(['dependency', 'package', 'script', 'binary', 'heading', 'memory_area']);

function baseImpactReason(reason = '') {
  return reason.replace(/^incoming:/, '');
}

export function isSemanticImpactReason(reason = '') {
  return SEMANTIC_RELATIONS.has(baseImpactReason(reason));
}

function isCuratedImpactReason(reason = '') {
  return CURATED_IMPACT_REASONS.has(baseImpactReason(reason));
}

export function hasCuratedImpactReason(item) {
  return (item.reasons ?? []).some((reason) => isCuratedImpactReason(reason));
}

export function isSemanticOnlyImpactItem(item) {
  const reasons = item.reasons ?? [];
  return reasons.length > 0 && reasons.every((reason) => isSemanticImpactReason(reason));
}

export function isLowActionabilityImpactItem(item) {
  return LOW_ACTIONABILITY_IMPACT_TYPES.has(item.type);
}

function impactSelectionScore(item) {
  let score = item.impactScore ?? 0;
  if (hasCuratedImpactReason(item)) score += 4;
  if (item.type === 'file' || item.type === 'test' || item.type === 'verification_command') score += 2;
  if (isSemanticOnlyImpactItem(item)) score -= 12;
  if (isLowActionabilityImpactItem(item)) score -= 15;
  return score;
}

export function compareImpactItems(seed) {
  return (a, b) => {
    if (a.id === seed) return -1;
    if (b.id === seed) return 1;
    return impactSelectionScore(b) - impactSelectionScore(a) || (b.impactScore ?? 0) - (a.impactScore ?? 0) || a.id.localeCompare(b.id);
  };
}
