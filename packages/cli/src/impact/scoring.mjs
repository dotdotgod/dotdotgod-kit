import { SEMANTIC_RELATIONS, resolveMemoryArea } from '../memory/config.mjs';
import { relationWeight } from '../graph/communities.mjs';

export function isTestPath(path = '') {
  return /(^|\/)(test|tests)\//.test(path) || /\.(test|spec)\.(mjs|cjs|js|jsx|ts|tsx)$/.test(path);
}

export function docsArea(path = '', config) {
  const area = resolveMemoryArea(path, config);
  const byRole = { 'behavior-truth': 'spec', 'architecture-rationale': 'arch', 'verification-knowledge': 'test-docs', 'active-task-intent': 'plan', 'historical-memory-map': 'archive-index', 'historical-memory-body': 'archive-index', 'project-documentation': 'docs', 'documentation-routing-map': 'docs' };
  return byRole[area?.role] ?? (area?.id === 'spec' ? 'spec' : area?.id === 'architecture' ? 'arch' : area?.id === 'test' ? 'test-docs' : undefined);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function roundProbability(value) {
  return Math.round(value * 1000000) / 1000000;
}

export function buildPersonalizedPageRank(graph, seeds, policy) {
  const seedList = Array.isArray(seeds) ? [...new Set(seeds)] : [seeds];
  const seedSet = new Set(seedList);
  const restart = seedList.length > 0 ? 1 / seedList.length : 0;
  const damping = policy.ppr.damping ?? 0.85;
  const iterations = policy.ppr.iterations ?? 20;
  const tolerance = policy.ppr.tolerance ?? 0.000001;
  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const seed of seedList) ids.add(seed);
  const adjacency = new Map([...ids].map((id) => [id, []]));
  for (const edge of graph.edges) {
    const weight = edge.weight ?? policy.relationWeights[edge.relation] ?? relationWeight(edge.relation);
    if (weight <= 0) continue;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source).push([edge.target, weight]);
    adjacency.get(edge.target).push([edge.source, weight]);
  }
  let ranks = new Map([...adjacency.keys()].map((id) => [id, seedSet.has(id) ? restart : 0]));
  for (let i = 0; i < iterations; i += 1) {
    const next = new Map([...adjacency.keys()].map((id) => [id, seedSet.has(id) ? (1 - damping) * restart : 0]));
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

export function scoreImpactItem(item, seeds, changedPaths, policy, pprScores, config) {
  const seedSet = seeds instanceof Set ? seeds : new Set(Array.isArray(seeds) ? seeds : [seeds]);
  const paths = Array.isArray(changedPaths) ? changedPaths : [changedPaths];
  const archiveSeeded = paths.some((path) => resolveMemoryArea(path, config)?.role?.startsWith('historical-memory'));
  if (seedSet.has(item.id)) return { impactScore: 100, scoreBreakdown: { seed: 100, connection: { ppr: 80, reference: policy.ppr.reference }, memory: { priority: 20, policyAdjustments: 0 } } };
  const retrieval = item.retrieval ?? {};
  const probability = pprScores.get(item.id) ?? 0;
  const connection = clamp((probability / policy.ppr.reference) * policy.connectionCap, 0, policy.connectionCap);
  const priority = clamp(((retrieval.priority ?? 30) / 100) * 15, 0, 15);
  let policyAdjustments = retrieval.freshness === 'fresh' ? 5 : retrieval.freshness === 'stale' ? -5 : 0;
  if (retrieval.includeBodiesByDefault === false && !archiveSeeded) policyAdjustments -= 5;
  const memory = clamp(priority + policyAdjustments, 0, policy.memoryCap);
  const reasons = item.reasons ?? [];
  const strongestReason = (values) => [...values].sort((a, b) => {
    const weightDelta = (policy.relationWeights[baseImpactReason(b)] ?? relationWeight(baseImpactReason(b))) - (policy.relationWeights[baseImpactReason(a)] ?? relationWeight(baseImpactReason(a)));
    return weightDelta || a.localeCompare(b);
  })[0];
  const strongestDirectRelation = strongestReason(reasons.filter((reason) => reason !== 'changed-file'));
  const impactScore = clamp(connection + memory, 0, 100);
  return {
    impactScore: roundScore(impactScore),
    scoreBreakdown: {
      connection: { ppr: roundScore(connection), probability: roundProbability(probability), reference: policy.ppr.reference },
      memory: { priority: roundScore(priority), policyAdjustments: roundScore(policyAdjustments) },
      ...(strongestDirectRelation ? { strongestDirectRelation } : {}),
    },
  };
}

const CURATED_IMPACT_REASONS = new Set(['implemented_by', 'verified_by', 'related_doc', 'design_decision', 'verification_command', 'links_to', 'routes_to', 'belongs_to_area']);
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
  return item.hasCuratedEvidence === true || (item.reasons ?? []).some((reason) => isCuratedImpactReason(reason));
}

export function isSemanticOnlyImpactItem(item) {
  const reasons = item.reasons ?? [];
  return reasons.length > 0 && reasons.every((reason) => isSemanticImpactReason(reason));
}

export function isLowActionabilityImpactItem(item) {
  return LOW_ACTIONABILITY_IMPACT_TYPES.has(item.type);
}

export function compareImpactItems(seeds) {
  const seedList = Array.isArray(seeds) ? seeds : [seeds];
  const seedOrder = new Map(seedList.map((seed, index) => [seed, index]));
  return (a, b) => {
    const aSeed = seedOrder.get(a.id);
    const bSeed = seedOrder.get(b.id);
    if (aSeed !== undefined || bSeed !== undefined) {
      if (aSeed === undefined) return 1;
      if (bSeed === undefined) return -1;
      return aSeed - bSeed;
    }
    return (b.impactScore ?? 0) - (a.impactScore ?? 0) || a.id.localeCompare(b.id);
  };
}
