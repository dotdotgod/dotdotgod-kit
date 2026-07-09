import { DEFAULT_IMPACT_RANKING_POLICY, SEMANTIC_RELATIONS, cloneImpactRankingPolicy, defaultMemoryConfig } from '../memory/config.mjs';
import { retrievalMetadataForPath } from '../graph/metadata.mjs';
import { buildPersonalizedPageRank, compareImpactItems, docsArea, hasCuratedImpactReason, isLowActionabilityImpactItem, isSemanticOnlyImpactItem, isTestPath, scoreImpactItem } from './scoring.mjs';

function addImpactItem(group, item, limit = 10) {
  if (group.items.some((existing) => existing.id === item.id)) return;
  if (group.items.length >= limit) {
    group.omitted += 1;
    return;
  }
  group.items.push(item);
}

function selectImpactItems(sortedItems, maxRelated, seed) {
  const selected = [];
  const selectedIds = new Set();
  const deferred = [];
  const firstPageLimit = Math.min(maxRelated, 10);
  let semanticOnlyInFirstPage = 0;
  let lowActionabilityInFirstPage = 0;
  const firstPagePathCounts = new Map();
  const add = (item, force = false) => {
    if (selected.length >= maxRelated || selectedIds.has(item.id)) return;
    const pathKey = item.path ?? item.id;
    if (!force && item.id !== seed && selected.length < firstPageLimit) {
      if (pathKey && (firstPagePathCounts.get(pathKey) ?? 0) >= 2) return deferred.push(item);
      if (isLowActionabilityImpactItem(item) && lowActionabilityInFirstPage >= 2) return deferred.push(item);
      if (isSemanticOnlyImpactItem(item) && semanticOnlyInFirstPage >= 3) return deferred.push(item);
    }
    selected.push(item);
    selectedIds.add(item.id);
    if (selected.length <= firstPageLimit && item.id !== seed) {
      if (pathKey) firstPagePathCounts.set(pathKey, (firstPagePathCounts.get(pathKey) ?? 0) + 1);
      if (isLowActionabilityImpactItem(item)) lowActionabilityInFirstPage += 1;
      if (isSemanticOnlyImpactItem(item)) semanticOnlyInFirstPage += 1;
    }
  };
  for (const item of sortedItems) if (item.id === seed) add(item, true);
  for (const item of sortedItems) if (item.id !== seed) add(item);
  for (const item of deferred) add(item, true);
  return selected;
}

export function buildImpactReport(index, changedPath, limits = {}) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const config = index?.memoryConfig ? { ...defaultMemoryConfig(), ...index.memoryConfig } : defaultMemoryConfig();
  const policy = cloneImpactRankingPolicy(config.impactRanking ?? DEFAULT_IMPACT_RANKING_POLICY);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const seed = `file:${changedPath}`;
  const maxRelated = limits.related ?? 25;
  const groups = { files: { items: [], omitted: 0 }, docs: { items: [], omitted: 0 }, contracts: { items: [], omitted: 0 }, tests: { items: [], omitted: 0 }, commands: { items: [], omitted: 0 }, events: { items: [], omitted: 0 }, packageResources: { items: [], omitted: 0 }, symbols: { items: [], omitted: 0 } };
  const relatedIds = new Set([seed]);
  const reasons = new Map([[seed, new Set(['changed-file'])]]);
  const addReason = (id, reason) => {
    relatedIds.add(id);
    if (!reasons.has(id)) reasons.set(id, new Set());
    reasons.get(id).add(reason);
  };

  for (const edge of graph.edges) {
    if (edge.source === seed) addReason(edge.target, edge.relation);
    if (edge.target === seed) addReason(edge.source, `incoming:${edge.relation}`);
  }
  const expansionRelations = new Set(['implemented_by', 'verified_by', 'related_doc', 'verification_command', ...SEMANTIC_RELATIONS]);
  for (const edge of graph.edges) {
    if (!expansionRelations.has(edge.relation)) continue;
    if (relatedIds.has(edge.source) && edge.target !== seed) addReason(edge.target, edge.relation);
  }

  const pprScores = buildPersonalizedPageRank(graph, seed, policy);
  const candidatePprMax = Math.max(0, ...[...relatedIds].filter((id) => id !== seed).map((id) => pprScores.get(id) ?? 0));
  const relatedAll = [...relatedIds].map((id) => {
    const node = nodeById.get(id) ?? { id };
    const path = node.path ?? id.replace(/^file:/, '').replace(/^test:/, '');
    const reasonList = [...(reasons.get(id) ?? [])];
    const retrieval = node.retrieval ?? retrievalMetadataForPath(path);
    const reasonSignals = reasonList.map((reason) => `reason:${reason}`);
    const scored = scoreImpactItem({ ...node, reasons: reasonList, retrieval }, seed, changedPath, policy, pprScores, candidatePprMax);
    return { ...node, reasons: reasonList, retrieval: { ...retrieval, signals: [...new Set([...(retrieval.signals ?? []), ...reasonSignals])] }, ...scored };
  }).sort(compareImpactItems(seed));
  const related = selectImpactItems(relatedAll, maxRelated, seed);
  for (const item of related) {
    if (item.type === 'file') {
      const area = docsArea(item.path);
      if (area) addImpactItem(groups.docs, { ...item, area }, limits.docs ?? 10);
      else if (isTestPath(item.path)) addImpactItem(groups.tests, item, limits.tests ?? 10);
      else addImpactItem(groups.files, item, limits.files ?? 10);
    } else if (item.type === 'contract') addImpactItem(groups.contracts, item, limits.contracts ?? 10);
    else if (item.type === 'test') addImpactItem(groups.tests, item, limits.tests ?? 10);
    else if (item.type === 'command') addImpactItem(groups.commands, item, limits.commands ?? 10);
    else if (item.type === 'event') addImpactItem(groups.events, item, limits.events ?? 10);
    else if (item.type === 'package_resource') addImpactItem(groups.packageResources, item, limits.packageResources ?? 10);
  }
  return { changed: changedPath, ranking: { method: policy.ppr.enabled === false ? 'policy-score' : 'personalized-pagerank+policy', preset: policy.preset, configSource: index?.memoryConfig?.source ?? 'default', weights: policy.weights, ppr: policy.ppr }, related, groups, omittedRelated: Math.max(0, relatedAll.length - related.length) };
}

function compactScoreBreakdown(scoreBreakdown = {}) {
  const compact = {};
  for (const [key, value] of Object.entries(scoreBreakdown)) if (value !== 0 && value !== undefined) compact[key] = value;
  return compact;
}

export function compactImpactItem(item) {
  const compact = { id: item.id, type: item.type, impactScore: item.impactScore, reasons: (item.reasons ?? []).slice(0, 6), scoreBreakdown: compactScoreBreakdown(item.scoreBreakdown) };
  for (const key of ['path', 'area', 'name', 'command', 'target', 'kind', 'specifier', 'title', 'contractId', 'sections']) if (item[key] !== undefined) compact[key] = item[key];
  if (item.retrieval) compact.retrieval = { area: item.retrieval.area, role: item.retrieval.role, priority: item.retrieval.priority, freshness: item.retrieval.freshness };
  return compact;
}

function compactImpactGroup(group = { items: [], omitted: 0 }, limit = 5) {
  const items = (group.items ?? []).slice(0, limit).map(compactImpactItem);
  return { items, omitted: (group.omitted ?? 0) + Math.max(0, (group.items?.length ?? 0) - items.length) };
}

export function buildCompactImpactReport(impact, limits = {}) {
  const relatedLimit = limits.related ?? 10;
  const groupLimit = limits.groupItems ?? 5;
  const related = (impact.related ?? []).slice(0, relatedLimit).map(compactImpactItem);
  const groupNames = ['files', 'docs', 'contracts', 'tests', 'commands', 'events', 'packageResources', 'symbols'];
  const groups = Object.fromEntries(groupNames.map((name) => [name, compactImpactGroup(impact.groups?.[name], groupLimit)]));
  const top10 = (impact.related ?? []).filter((item) => item.id !== `file:${impact.changed}`).slice(0, 10);
  return { changed: impact.changed, compact: true, ranking: { method: impact.ranking?.method, preset: impact.ranking?.preset, configSource: impact.ranking?.configSource }, related, groups, omittedRelated: (impact.omittedRelated ?? 0) + Math.max(0, (impact.related?.length ?? 0) - related.length), quality: { rawRelated: impact.related?.length ?? 0, compactRelated: related.length, semanticOnlyTop10: top10.filter((item) => isSemanticOnlyImpactItem(item)).length, curatedTop10: top10.filter((item) => hasCuratedImpactReason(item)).length, lowActionabilityTop10: top10.filter((item) => isLowActionabilityImpactItem(item)).length } };
}
