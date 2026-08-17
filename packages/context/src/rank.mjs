const TERM_PATTERN = /[\p{L}\p{N}_./:@-]+/gu;
const MAX_TERMS = 20;
const MAX_RESULTS = 1000;
const DEFAULT_RRF_K = 60;

export function normalizeSearchTerms(value, limit = MAX_TERMS) {
  const terms = String(value ?? '').toLowerCase().match(TERM_PATTERN) ?? [];
  return [...new Set(terms)].slice(0, Math.min(MAX_TERMS, Math.max(1, limit)));
}

export function candidateKey(candidate) {
  if (candidate?.sourceId != null) return `${candidate.sourceId}:${candidate.ordinal ?? 0}`;
  if (candidate?.id != null) return String(candidate.id);
  throw new Error('Ranking candidate requires sourceId or id.');
}

export function reciprocalRankFusion(providers, options = {}) {
  const k = Number(options.k ?? DEFAULT_RRF_K);
  if (!Number.isFinite(k) || k <= 0) throw new Error('RRF k must be a positive number.');
  const limit = Math.min(MAX_RESULTS, Math.max(1, Number(options.limit ?? 50)));
  const keyOf = options.key ?? candidateKey;
  const fused = new Map();

  for (const provider of providers ?? []) {
    const name = String(provider?.name ?? '').trim();
    if (!name) throw new Error('RRF provider requires a name.');
    const seen = new Set();
    for (const [index, candidate] of (provider.candidates ?? []).entries()) {
      const key = String(keyOf(candidate));
      if (seen.has(key)) continue;
      seen.add(key);
      const rank = index + 1;
      const entry = fused.get(key) ?? { key, candidate, rrfScore: 0, ranks: [] };
      entry.rrfScore += 1 / (k + rank);
      entry.ranks.push({ provider: name, rank });
      fused.set(key, entry);
    }
  }

  return [...fused.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function normalizedField(value) {
  return String(value ?? '').toLowerCase();
}

function tokenCoverage(value, terms) {
  if (terms.length === 0) return 0;
  const field = normalizedField(value);
  return terms.filter((term) => field.includes(term)).length / terms.length;
}

export function termProximity(text, query) {
  const terms = Array.isArray(query) ? query : normalizeSearchTerms(query);
  if (terms.length < 2) return 0;
  const words = normalizedField(text).match(TERM_PATTERN) ?? [];
  const positions = terms.map((term) => {
    const matches = [];
    words.forEach((word, index) => { if (word === term || word.includes(term)) matches.push(index); });
    return matches;
  });
  if (positions.some((matches) => matches.length === 0)) return 0;

  let bestSpan = Infinity;
  const cursors = positions.map(() => 0);
  while (true) {
    const current = positions.map((matches, index) => matches[cursors[index]]);
    bestSpan = Math.min(bestSpan, Math.max(...current) - Math.min(...current));
    const minimum = Math.min(...current);
    const positionIndex = current.indexOf(minimum);
    cursors[positionIndex] += 1;
    if (cursors[positionIndex] >= positions[positionIndex].length) break;
  }
  const extraSpan = Math.max(0, bestSpan - (terms.length - 1));
  return 1 / (1 + extraSpan);
}

export function scoreCandidateSignals(candidate, query, options = {}) {
  const terms = Array.isArray(query) ? query : normalizeSearchTerms(query);
  const phrase = terms.join(' ');
  const label = normalizedField(candidate?.label);
  const path = normalizedField(candidate?.metadata?.path ?? candidate?.path);
  const titleExact = phrase.length > 0 && label === phrase;
  const pathExact = phrase.length > 0 && path === phrase;
  const titleCoverage = tokenCoverage(label, terms);
  const pathCoverage = tokenCoverage(path, terms);
  const proximity = termProximity(candidate?.body ?? candidate?.text, terms);
  const weights = { exact: 0.01, coverage: 0.004, proximity: 0.003, ...options.weights };
  const score = (titleExact || pathExact ? weights.exact : 0)
    + Math.max(titleCoverage, pathCoverage) * weights.coverage
    + proximity * weights.proximity;
  const signals = [];
  if (titleExact) signals.push('exact-title');
  if (pathExact) signals.push('exact-path');
  if (titleCoverage > 0) signals.push(`title-coverage:${titleCoverage.toFixed(3)}`);
  if (pathCoverage > 0) signals.push(`path-coverage:${pathCoverage.toFixed(3)}`);
  if (proximity > 0) signals.push(`term-proximity:${proximity.toFixed(3)}`);
  return { score, signals: signals.slice(0, Math.min(8, Math.max(0, options.maxExplanations ?? 4))) };
}

export function rerankCandidates(fused, query, options = {}) {
  const limit = Math.min(MAX_RESULTS, Math.max(1, Number(options.limit ?? 50)));
  return (fused ?? []).map((entry) => {
    const rerank = scoreCandidateSignals(entry.candidate, query, options);
    return {
      ...entry,
      score: entry.rrfScore + rerank.score,
      ranking: { rrfScore: entry.rrfScore, rerankScore: rerank.score, signals: rerank.signals },
    };
  }).sort((a, b) => b.score - a.score || b.rrfScore - a.rrfScore || a.key.localeCompare(b.key)).slice(0, limit);
}
