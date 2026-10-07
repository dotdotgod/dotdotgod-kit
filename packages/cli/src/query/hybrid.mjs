import { collectDocumentationChunks } from './chunks.mjs';
import { readMemoryConfig } from '../memory/config.mjs';
import { resolveEmbeddingProfile } from './embedding-config.mjs';
import { buildOutlines, outlineChunks } from '../symbols/store.mjs';
import { addOutlineGraph } from '../symbols/graph.mjs';

export const resultKey = (chunk) => chunk.kind === 'symbol' ? chunk.id : chunk.path;
const terms = (text) => [...new Set(text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))];
export function keywordCandidates(query, chunks) {
  const words = terms(query);
  if (!words.length) return [];
  const literal = query.toLowerCase();
  return chunks.map((chunk) => {
    const names = `${chunk.qualifiedName ?? ''} ${chunk.heading ?? ''} ${chunk.path}`.toLowerCase();
    const body = `${chunk.signature ?? ''} ${chunk.documentation ?? chunk.text}`.toLowerCase();
    const haystack = new Set(terms(`${names} ${body}`));
    const matched = words.filter((word) => haystack.has(word)).length;
    const exact = chunk.qualifiedName?.toLowerCase() === literal || chunk.name?.toLowerCase() === literal;
    return { ...chunk, exactNameMatch: Boolean(exact), keywordScore: exact ? 3 : matched / words.length + (names.includes(literal) ? 0.5 : body.includes(literal) ? 0.25 : 0) };
  }).filter((chunk) => chunk.keywordScore > 0).sort((a, b) => b.keywordScore - a.keywordScore || a.id.localeCompare(b.id));
}
export function fuseCandidates(keyword, vector, limit) {
  const candidates = new Map();
  for (const [channel, rows] of [['keyword', keyword], ['vector', vector]]) {
    const seenIds = new Set(); let rank = 0;
    rows.forEach((chunk) => {
      if (seenIds.has(chunk.id)) return;
      seenIds.add(chunk.id); rank += 1;
      const existing = candidates.get(chunk.id) ?? { ...chunk, score: 0, retrieval: [] };
      existing.score += 1 / (60 + rank);
      existing.retrieval.push(channel);
      if (chunk.vectorScore !== undefined) existing.vectorScore = chunk.vectorScore;
      if (chunk.keywordScore !== undefined) existing.keywordScore = chunk.keywordScore;
      candidates.set(chunk.id, existing);
    });
  }
  const seen = new Set();
  return [...candidates.values()].sort((a, b) => Number(b.exactNameMatch ?? false) - Number(a.exactNameMatch ?? false) || b.score - a.score || a.id.localeCompare(b.id)).filter((chunk) => {
    const key = resultKey(chunk);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, limit);
}
export async function projectCorpus(root, scope) {
  const config = readMemoryConfig(root);
  const docs = scope === 'code' ? [] : collectDocumentationChunks(root, config.load?.documentationSummary?.exclude, config.documentation?.root ?? 'docs').map((chunk) => ({ ...chunk, kind: 'document' }));
  const outlines = scope === 'docs' ? null : await buildOutlines(root);
  return { chunks: [...docs, ...(outlines ? outlineChunks(outlines) : [])], outlines };
}
export function assertCodeEmbeddingConsent(root, options, chunks) {
  if (!chunks.some((chunk) => chunk.kind === 'symbol')) return;
  const profile = options.profile ?? resolveEmbeddingProfile(root).profile;
  if (profile.provider !== 'local' && options.allowCodeEmbedding !== true) throw new Error('Remote code-metadata embedding requires --allow-code-embedding; use --search keyword or --scope docs instead.');
}
export function attachRelationships(results, outlines) {
  if (!outlines) return results;
  const graph = addOutlineGraph({ nodes: [], edges: [] }, outlines);
  return results.map((result) => {
    const relationships = graph.edges.filter((edge) => edge.source === result.id || edge.target === result.id || (edge.source === `file:${result.path}` && edge.relation === 'imports'));
    return { ...result, relationshipCount: relationships.length, relationships: relationships.slice(0, 10) };
  });
}
