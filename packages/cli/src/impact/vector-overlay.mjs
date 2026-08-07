import { buildVectorIndex, rankVectorFiles } from '../commands/query.mjs';
import { embedTexts } from '../query/embedder.mjs';
import { VECTOR_MODEL } from '../query/store.mjs';
import { buildChangedFileProfile, canonicalizeChangedPath } from './vector-profile.mjs';

export const VECTOR_RELATION_WEIGHT = 2;
export const MAX_VECTOR_EVIDENCE_HEADING_CHARS = 160;
export const MAX_VECTOR_EVIDENCE_CHUNK_ID_CHARS = 200;

function boundedEvidence(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit) : undefined;
}

export async function buildVectorImpactOverlay(root, index, changedPaths, options = {}) {
  const semantic = index?.memoryConfig?.impactRanking?.semantic ?? {};
  if (semantic.enabled === false || semantic.topKPerFile === 0) return { status: 'disabled', edges: [], diagnostics: { enabled: false } };
  const embed = options.embed ?? embedTexts;
  const threshold = semantic.threshold ?? 0.5;
  const topK = semantic.topKPerFile ?? 5;
  try {
    const vectorIndex = await (options.buildIndex ?? buildVectorIndex)(root, embed);
    const edges = [];
    const normalizedChangedPaths = [...new Set(changedPaths.map((path) => canonicalizeChangedPath(root, path)).filter(Boolean))];
    for (const changed of normalizedChangedPaths) {
      const profile = buildChangedFileProfile(root, changed, index?.graph);
      if (!profile) continue;
      const [queryVector] = await embed([`query: ${profile.text}`]);
      if (!queryVector) throw new Error('Changed-file embedding was empty.');
      const matches = rankVectorFiles(queryVector, vectorIndex)
        .filter((match) => match.path !== changed && match.vectorScore >= threshold)
        .slice(0, topK);
      for (const match of matches) {
        edges.push({
          source: `file:${changed}`,
          target: `file:${match.path}`,
          relation: 'vector_similarity',
          weight: VECTOR_RELATION_WEIGHT * match.vectorScore,
          score: Number(match.vectorScore.toFixed(6)),
          confidence: 'INFERRED_VECTOR_SEMANTIC',
          heading: boundedEvidence(match.heading, MAX_VECTOR_EVIDENCE_HEADING_CHARS),
          chunkId: boundedEvidence(match.id, MAX_VECTOR_EVIDENCE_CHUNK_ID_CHARS),
        });
      }
    }
    return { status: 'available', edges, diagnostics: { enabled: true, model: VECTOR_MODEL, corpusChunks: vectorIndex.chunks.length, threshold, topK, embedded: vectorIndex.manifest?.embedded, reused: vectorIndex.manifest?.reused } };
  } catch (error) {
    return { status: 'unavailable', edges: [], diagnostics: { enabled: true, reason: error instanceof Error ? error.message : String(error) } };
  }
}
