import { DEFAULT_IMPACT_RANKING_POLICY, SEMANTIC_RELATIONS, cloneImpactRankingPolicy, defaultMemoryConfig, traceabilityRelationWeights } from '../memory/config.mjs';
import { retrievalMetadataForPath } from '../graph/metadata.mjs';
import { buildPersonalizedPageRank, compareImpactItems, docsArea, hasCuratedImpactReason, isLowActionabilityImpactItem, isSemanticOnlyImpactItem, isTestPath, scoreImpactItem } from './scoring.mjs';
import { normalizeChangedPath } from './vector-profile.mjs';
import { MAX_VECTOR_EVIDENCE_CHUNK_ID_CHARS, MAX_VECTOR_EVIDENCE_HEADING_CHARS } from './vector-overlay.mjs';

function addImpactItem(group, item, limit = 10) {
  if (group.items.some((existing) => existing.id === item.id)) return;
  if (group.items.length >= limit) {
    group.omitted += 1;
    return;
  }
  group.items.push(item);
}

function normalizeChangedPaths(changedPaths) {
  const values = Array.isArray(changedPaths) ? changedPaths : [changedPaths];
  return [...new Set(values.map(normalizeChangedPath).filter(Boolean))];
}

function selectImpactItems(sortedItems, maxRelated, seeds) {
  const seedSet = new Set(seeds);
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
    if (!force && !seedSet.has(item.id) && selected.length < firstPageLimit) {
      if (pathKey && (firstPagePathCounts.get(pathKey) ?? 0) >= 2) return deferred.push(item);
      if (isLowActionabilityImpactItem(item) && lowActionabilityInFirstPage >= 2) return deferred.push(item);
      if (isSemanticOnlyImpactItem(item) && semanticOnlyInFirstPage >= 3) return deferred.push(item);
    }
    selected.push(item);
    selectedIds.add(item.id);
    if (selected.length <= firstPageLimit && !seedSet.has(item.id)) {
      if (pathKey) firstPagePathCounts.set(pathKey, (firstPagePathCounts.get(pathKey) ?? 0) + 1);
      if (isLowActionabilityImpactItem(item)) lowActionabilityInFirstPage += 1;
      if (isSemanticOnlyImpactItem(item)) semanticOnlyInFirstPage += 1;
    }
  };
  for (const item of sortedItems) if (seedSet.has(item.id)) add(item, true);
  for (const item of sortedItems) if (!seedSet.has(item.id)) add(item);
  for (const item of deferred) add(item, true);
  return selected;
}

function buildCombinedImpactReport(index, changedPaths, limits = {}) {
  const baseGraph = index?.graph ?? { nodes: [], edges: [] };
  const overlay = limits.overlay ?? { status: 'disabled', edges: [] };
  const graph = { nodes: baseGraph.nodes, edges: [...baseGraph.edges, ...(overlay.edges ?? [])] };
  const config = index?.memoryConfig ? { ...defaultMemoryConfig(), ...index.memoryConfig } : defaultMemoryConfig();
  const policy = cloneImpactRankingPolicy(config.impactRanking ?? DEFAULT_IMPACT_RANKING_POLICY);
  const traceabilityWeights = traceabilityRelationWeights(config.traceability);
  policy.relationWeights = { ...policy.relationWeights, ...traceabilityWeights };
  const curatedRelations = new Set(Object.keys(traceabilityWeights));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const seeds = changedPaths.map((path) => `file:${path}`);
  const seedSet = new Set(seeds);
  const maxRelated = Math.max(limits.related ?? 25, seeds.length);
  const groups = { files: { items: [], omitted: 0 }, docs: { items: [], omitted: 0 }, contracts: { items: [], omitted: 0 }, tests: { items: [], omitted: 0 }, commands: { items: [], omitted: 0 }, events: { items: [], omitted: 0 }, packageResources: { items: [], omitted: 0 }, symbols: { items: [], omitted: 0 } };
  const relatedIds = new Set(seeds);
  const reasons = new Map(seeds.map((seed) => [seed, new Set(['changed-file'])]));
  const vectorEvidence = new Map();
  const addReason = (id, reason) => {
    relatedIds.add(id);
    if (!reasons.has(id)) reasons.set(id, new Set());
    reasons.get(id).add(reason);
  };

  for (const edge of graph.edges) {
    if (edge.relation === 'vector_similarity' && seedSet.has(edge.source)) vectorEvidence.set(edge.target, {
      score: edge.score,
      heading: typeof edge.heading === 'string' ? edge.heading.slice(0, MAX_VECTOR_EVIDENCE_HEADING_CHARS) : undefined,
      chunkId: typeof edge.chunkId === 'string' ? edge.chunkId.slice(0, MAX_VECTOR_EVIDENCE_CHUNK_ID_CHARS) : undefined,
      confidence: edge.confidence,
    });
    if (seedSet.has(edge.source)) addReason(edge.target, edge.relation);
    if (seedSet.has(edge.target)) addReason(edge.source, `incoming:${edge.relation}`);
  }
  const expansionRelations = new Set([...curatedRelations, ...SEMANTIC_RELATIONS]);
  for (const edge of graph.edges) {
    if (!expansionRelations.has(edge.relation)) continue;
    if (relatedIds.has(edge.source) && !seedSet.has(edge.target)) addReason(edge.target, edge.relation);
  }

  const pprScores = buildPersonalizedPageRank(graph, seeds, policy);
  const relatedAll = [...relatedIds].map((id) => {
    const node = nodeById.get(id) ?? { id };
    const path = node.path ?? id.replace(/^file:/, '').replace(/^test:/, '');
    const reasonList = [...(reasons.get(id) ?? [])];
    const retrieval = node.retrieval ?? retrievalMetadataForPath(path);
    const reasonSignals = reasonList.map((reason) => `reason:${reason}`);
    const hasCuratedEvidence = reasonList.some((reason) => curatedRelations.has(reason.replace(/^incoming:/, '')));
    const scored = scoreImpactItem({ ...node, reasons: reasonList, retrieval }, seedSet, changedPaths, policy, pprScores);
    return { ...node, reasons: reasonList, hasCuratedEvidence, ...(vectorEvidence.has(id) ? { vectorEvidence: vectorEvidence.get(id) } : {}), retrieval: { ...retrieval, signals: [...new Set([...(retrieval.signals ?? []), ...reasonSignals])] }, ...scored };
  }).sort(compareImpactItems(seeds));
  const related = selectImpactItems(relatedAll, maxRelated, seeds);
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
  return { changed: changedPaths[0], changedFiles: changedPaths, semantic: { status: overlay.status ?? 'disabled', ...(limits.verboseSemantic ? { diagnostics: overlay.diagnostics } : {}) }, ranking: { method: 'weighted-personalized-pagerank+memory', configSource: index?.memoryConfig?.source ?? 'default', connectionCap: policy.connectionCap, memoryCap: policy.memoryCap, pprReference: policy.ppr.reference }, related, groups, omittedRelated: Math.max(0, relatedAll.length - related.length) };
}

export function buildImpactReport(index, changedPaths, limits = {}) {
  const normalized = normalizeChangedPaths(changedPaths);
  const aggregate = buildCombinedImpactReport(index, normalized, limits);
  const perSeedLimit = limits.perSeed ?? 5;
  aggregate.perSeed = normalized.map((changed) => {
    const seedId = `file:${changed}`;
    const seedOverlay = limits.overlay ? { ...limits.overlay, edges: (limits.overlay.edges ?? []).filter((edge) => edge.source === seedId) } : undefined;
    const report = buildCombinedImpactReport(index, [changed], { ...limits, overlay: seedOverlay, related: Math.max(limits.related ?? 25, perSeedLimit + 1) });
    const related = report.related.filter((item) => item.id !== `file:${changed}`).slice(0, perSeedLimit);
    return { changed, related, omittedRelated: Math.max(0, report.related.length - 1 - related.length) + report.omittedRelated };
  });
  return aggregate;
}

function compactScoreBreakdown(scoreBreakdown = {}) {
  const compact = {};
  for (const [key, value] of Object.entries(scoreBreakdown)) if (value !== 0 && value !== undefined) compact[key] = value;
  return compact;
}

export function compactImpactItem(item) {
  const compact = { id: item.id, type: item.type, impactScore: item.impactScore, reasons: (item.reasons ?? []).slice(0, 6), scoreBreakdown: compactScoreBreakdown(item.scoreBreakdown) };
  for (const key of ['path', 'area', 'name', 'command', 'target', 'kind', 'specifier', 'title', 'contractId', 'sections', 'vectorEvidence']) if (item[key] !== undefined) compact[key] = item[key];
  if (item.retrieval) compact.retrieval = { area: item.retrieval.area, role: item.retrieval.role, priority: item.retrieval.priority, freshness: item.retrieval.freshness };
  return compact;
}

function compactImpactGroup(group = { items: [], omitted: 0 }, limit = 5) {
  const items = (group.items ?? []).slice(0, limit).map(compactImpactItem);
  return { items, omitted: (group.omitted ?? 0) + Math.max(0, (group.items?.length ?? 0) - items.length) };
}

export function buildCompactImpactReport(impact, limits = {}) {
  const relatedLimit = Math.max(limits.related ?? 10, impact.changedFiles?.length ?? 1);
  const groupLimit = limits.groupItems ?? 5;
  const changedFiles = impact.changedFiles ?? [impact.changed];
  const seedIds = new Set(changedFiles.map((path) => `file:${path}`));
  const related = (impact.related ?? []).slice(0, relatedLimit).map(compactImpactItem);
  const groupNames = ['files', 'docs', 'contracts', 'tests', 'commands', 'events', 'packageResources', 'symbols'];
  const groups = Object.fromEntries(groupNames.map((name) => [name, compactImpactGroup(impact.groups?.[name], groupLimit)]));
  const perSeed = (impact.perSeed ?? []).map((entry) => ({ changed: entry.changed, related: (entry.related ?? []).slice(0, limits.perSeed ?? 5).map(compactImpactItem), omittedRelated: entry.omittedRelated ?? 0 }));
  const top10 = (impact.related ?? []).filter((item) => !seedIds.has(item.id)).slice(0, 10);
  return { changed: impact.changed, changedFiles, perSeed, semantic: impact.semantic, compact: true, ranking: { method: impact.ranking?.method, configSource: impact.ranking?.configSource, connectionCap: impact.ranking?.connectionCap, memoryCap: impact.ranking?.memoryCap, pprReference: impact.ranking?.pprReference }, related, groups, omittedRelated: (impact.omittedRelated ?? 0) + Math.max(0, (impact.related?.length ?? 0) - related.length), quality: { rawRelated: impact.related?.length ?? 0, compactRelated: related.length, semanticOnlyTop10: top10.filter((item) => isSemanticOnlyImpactItem(item)).length, curatedTop10: top10.filter((item) => hasCuratedImpactReason(item)).length, lowActionabilityTop10: top10.filter((item) => isLowActionabilityImpactItem(item)).length } };
}
