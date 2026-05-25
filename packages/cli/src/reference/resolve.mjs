import { resolve } from 'node:path';
import { usage } from '../cli/usage.mjs';
import { readMemoryConfig } from '../memory/config.mjs';
import { readFreshIndex } from '../index/cache.mjs';
import { buildCompactImpactReport, buildImpactReport } from '../impact/report.mjs';
import { DEFAULT_REFERENCE_LIMIT, extractBracketReferences, extractFuzzyReferences, isArchiveBodyPath, normalizeReferenceAlias, referenceCandidateAliases, referencePathForNode } from './extract.mjs';

function incomingRouteBonus(graph, nodeId) {
  return graph.edges.some((edge) => edge.target === nodeId && edge.relation === 'routes_to') ? 6 : 0;
}

function exactReferenceScore(ref, alias, kind) {
  const rawRef = String(ref).trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const rawAlias = String(alias).trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (rawRef === rawAlias) return kind === 'heading' ? 92 : 110;
  if (rawRef.toLowerCase() === rawAlias.toLowerCase()) return kind === 'heading' ? 88 : 105;
  return 0;
}

export function resolveReferenceCandidates(index, ref, options = {}) {
  const graph = index?.graph ?? { nodes: [], edges: [] };
  const includeArchive = options.includeArchive === true;
  const limit = Number.isFinite(options.maxResults) ? options.maxResults : DEFAULT_REFERENCE_LIMIT;
  const query = String(ref ?? '').trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
  const normalized = normalizeReferenceAlias(query);
  const byId = new Map();
  for (const node of graph.nodes ?? []) {
    if (!['file', 'heading'].includes(node.type)) continue;
    const path = referencePathForNode(node);
    if (!includeArchive && isArchiveBodyPath(path)) continue;
    let best = null;
    for (const entry of referenceCandidateAliases(node)) {
      const aliasKey = normalizeReferenceAlias(entry.alias);
      if (!aliasKey) continue;
      let score = exactReferenceScore(query, entry.alias, entry.kind);
      if (aliasKey === normalized) score = Math.max(score, entry.kind === 'heading' ? 86 : 96);
      else if (aliasKey.endsWith(normalized) && normalized.length >= 4) score = Math.max(score, entry.kind === 'heading' ? 62 : 70);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { score, alias: entry.alias, aliasKind: entry.kind };
    }
    if (!best) continue;
    const retrievalPriority = Number(node.retrievalPriority ?? node.retrieval?.priority ?? 30);
    const routeBonus = incomingRouteBonus(graph, node.id);
    const memoryBonus = Math.min(12, Math.max(0, retrievalPriority / 10));
    const headingBonus = node.type === 'heading' ? 2 : 0;
    const score = Number((best.score + routeBonus + memoryBonus + headingBonus).toFixed(1));
    const reasons = [best.aliasKind === 'heading' ? 'heading_alias' : 'path_alias'];
    if (routeBonus) reasons.push('readme_routed');
    if (memoryBonus) reasons.push('memory_priority');
    const candidate = { id: node.id, type: node.type, path, title: node.title, score, matchedAlias: best.alias, reasons, retrieval: node.retrieval, memoryArea: node.memoryArea };
    const previous = byId.get(node.id);
    if (!previous || candidate.score > previous.score) byId.set(node.id, candidate);
  }
  const candidates = [...byId.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
  const shown = candidates.slice(0, limit);
  return { input: ref, query, normalized, candidates: shown, top: shown[0] ?? null, ambiguous: shown.length > 1 && shown[0].score - shown[1].score < 5, omitted: Math.max(0, candidates.length - shown.length) };
}

function parseReferenceOptions(argv, command) {
  const filtered = [];
  const options = { maxResults: DEFAULT_REFERENCE_LIMIT, includeArchive: false, withImpact: false, fuzzy: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--max-results') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-') || Number.isNaN(Number.parseInt(next, 10))) usage('Missing or invalid value for --max-results.', command);
      options.maxResults = Math.max(1, Number.parseInt(next, 10));
      i += 1;
    } else if (arg === '--include-archive') options.includeArchive = true;
    else if (arg === '--with-impact') options.withImpact = true;
    else if (arg === '--fuzzy') {
      if (command !== 'expand') usage(`Unknown option: ${arg}`, command);
      options.fuzzy = true;
    }
    else if (arg === '--json') filtered.push(arg);
    else if (arg.startsWith('-')) usage(`Unknown option: ${arg}`, command);
    else filtered.push(arg);
  }
  const operands = filtered.filter((arg) => !arg.startsWith('-'));
  return { ...options, root: resolve(operands[0] ?? '.'), json: filtered.includes('--json'), rootArgv: operands.slice(1) };
}

function attachImpactToRef(index, refResult) {
  const topPath = refResult.top?.path;
  if (!topPath) return refResult;
  const impact = buildCompactImpactReport(buildImpactReport(index, topPath));
  return { ...refResult, impact: { changed: topPath, related: impact.related, groups: impact.groups, omittedRelated: impact.omittedRelated, quality: impact.quality } };
}

function formatReferenceOutput(payload) {
  const refreshNote = payload.metadata.cacheRefreshed ? ', refreshed' : '';
  const lines = [`${payload.command}: ${payload.refs.length} reference(s) (${payload.status.status}${refreshNote} index)`];
  for (const ref of payload.refs) {
    const marker = ref.ambiguous ? ' ambiguous' : '';
    lines.push(`- ${ref.query || ref.input}:${marker} ${ref.candidates.length} candidate(s), ${ref.omitted} omitted`);
    for (const candidate of ref.candidates) {
      const title = candidate.title ? `#${candidate.title}` : '';
      lines.push(`  - ${candidate.path}${title} (${candidate.score}; ${candidate.reasons.join(', ')})`);
    }
  }
  return lines.join('\n');
}

export function runResolve(argv) {
  const options = parseReferenceOptions(argv, 'resolve');
  const ref = options.rootArgv?.join(' ');
  if (!ref) usage('Missing required argument: <ref>.', 'resolve');
  const { status, index, metadata } = readFreshIndex(options.root);
  const refs = [resolveReferenceCandidates(index, ref, options)];
  const payload = { ok: status.ok, command: 'resolve', root: options.root, status, metadata, refs, omitted: refs.reduce((sum, item) => sum + item.omitted, 0) };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(formatReferenceOutput(payload));
}

export function runExpand(argv) {
  const options = parseReferenceOptions(argv, 'expand');
  const prompt = options.rootArgv?.join(' ');
  if (!prompt) usage('Missing required argument: <prompt>.', 'expand');
  const refsInPrompt = extractBracketReferences(prompt);
  if (refsInPrompt.length === 0 && !options.fuzzy) usage('No [[refs]] found in prompt.', 'expand');
  const { status, index, metadata } = readFreshIndex(options.root);
  const fuzzyRefs = options.fuzzy ? extractFuzzyReferences(prompt, index, { ...options, memoryConfig: readMemoryConfig(options.root), existingTargets: refsInPrompt.map((item) => item.target) }) : [];
  let refs = [
    ...refsInPrompt.map((item) => ({ ...resolveReferenceCandidates(index, item.target, options), source: 'explicit', raw: item.raw, label: item.label })),
    ...fuzzyRefs.map((item) => ({ ...resolveReferenceCandidates(index, item.target, options), source: 'fuzzy', raw: item.raw, confidence: item.confidence, reasons: item.reasons })),
  ];
  if (options.withImpact) refs = refs.map((item) => attachImpactToRef(index, item));
  const payload = { ok: status.ok, command: 'expand', root: options.root, prompt, status, metadata, refs, omitted: refs.reduce((sum, item) => sum + item.omitted, 0) };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(formatReferenceOutput(payload));
}
