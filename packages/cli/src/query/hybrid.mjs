import { posix } from 'node:path';
import { containedStat, documentationChunks, inspectFile, pathEligibility } from '../storage/change-detector.mjs';
import { inspectIndexPath, openReadOnly } from '../storage/index-store.mjs';
import { readMemoryConfig } from '../memory/config.mjs';
import { checkedDocumentationRoot, isSharedMemoryPath } from '../memory/documentation-map.mjs';
import { buildOutlines, outlineChunks, outlineRecord, readLegacyOutlines } from '../symbols/store.mjs';
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
export async function projectCorpus(root, scope, readOnly, { preparedOnly = false, stageOutlines = false } = {}) {
  const config = readMemoryConfig(root);
  const shared = scope === 'shared';
  const documentationRoot = config.documentation.root;
  if ((readOnly || shared || preparedOnly) && config.errors?.length) throw new Error('Project configuration is invalid.');
  if (preparedOnly && !checkedDocumentationRoot(root, documentationRoot)) return { missingDocumentationRoot: true, documentationRoot };
  const eligible = pathEligibility(root, config, scope);
  const allowPath = (path, kind) => (!shared || isSharedMemoryPath(path, config)) && eligible(path, kind);
  const outlines = scope === 'docs' || readOnly || preparedOnly ? null : await buildOutlines(root, { persist: !stageOutlines });
  const indexExists = inspectIndexPath(root).exists;
  const legacy = scope === 'docs' || indexExists ? null : readLegacyOutlines(root);
  const legacyFiles = legacy?.files.filter(({ path }) => allowPath(path, 'code') && containedStat(root, path));
  return { config, outlines, indexExists, legacy: legacy && { ...legacy, files: legacyFiles }, allowPath,
    chunks(store, kinds = ['docs', 'code']) {
      return [
        ...(scope === 'code' || !kinds.includes('docs') ? [] : documentationChunks(root, config, store, (path) => !shared || isSharedMemoryPath(path, config))),
        ...(kinds.includes('code') ? outlineChunks({ files: (outlines?.files ?? legacyFiles ?? []).filter(({ path }) => allowPath(path, 'code')) }) : []),
      ];
    },
  };
}

export function indexPathFilter(root, store, allowPath, allowStaleCode = false) {
  const memo = new Map();
  return (path, kind) => {
    if (!memo.has(path)) {
      const old = allowPath(path, kind) && store.file(path);
      if (kind === 'code' && allowStaleCode) memo.set(path, Boolean(old && containedStat(root, path)));
      else {
        const current = old && inspectFile(root, path, old, { code: kind === 'code' });
        memo.set(path, Boolean(current && current.hash === old.sha256));
      }
    }
    return memo.get(path);
  };
}

function relatedFiles(results, store, allowed) {
  const files = new Map();
  for (const path of new Set(results.map((result) => result.path))) {
    const file = allowed(path, 'code') && store.file(path);
    if (file?.kind === 'code') files.set(path, outlineRecord(store, file));
  }
  for (const file of [...files.values()]) for (const { specifier } of file.imports) {
    if (!specifier.startsWith('.')) continue;
    const base = posix.normalize(posix.join(posix.dirname(file.path), specifier));
    if (base.startsWith('../')) continue;
    const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
    const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'].map((extension) => `${stem}${extension}`),
      ...['.ts', '.js', '.py'].map((extension) => `${base}/index${extension}`)];
    const target = candidates.find((path) => store.file(path)?.kind === 'code' && allowed(path, 'code'));
    if (target && !files.has(target)) files.set(target, { path: target, symbols: [], imports: [] });
  }
  return { files: [...files.values()] };
}
export function attachRelationships(results, outlines, store, allowed) {
  const bounded = results.slice(0, 30);
  const source = store ? relatedFiles(bounded, store, allowed) : outlines;
  if (!source) return results;
  const graph = addOutlineGraph({ nodes: [], edges: [] }, source);
  return results.map((result, index) => {
    if (index >= 30) return result;
    const relationships = graph.edges.filter((edge) => edge.source === result.id || edge.target === result.id || (edge.source === `file:${result.path}` && edge.relation === 'imports'));
    return { ...result, relationshipCount: relationships.length, relationships: relationships.slice(0, 10) };
  });
}
