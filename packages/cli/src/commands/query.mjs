import { resolve } from 'node:path';
import { vectorCacheSession } from '../query/cache-session.mjs';
import { usage } from '../cli/usage.mjs';
import { readMemoryConfig } from '../memory/config.mjs';
import { collectDocumentationChunks } from '../query/chunks.mjs';
import { resolveEmbedder } from '../query/embedder.mjs';
import { resolveEmbeddingProfile } from '../query/embedding-config.mjs';
import { isValidNormalizedVectorValues, profileFingerprint, writeVectorCache } from '../query/store.mjs';

import { projectCorpus, keywordCandidates, fuseCandidates, attachRelationships } from '../query/hybrid.mjs';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const EMBED_BATCH_SIZE = 16;

export function parseQueryOptions(argv) {
  const options = { root: '.', query: '', limit: DEFAULT_LIMIT, json: false, scope: 'all', search: 'hybrid' };
  let rootSet = false;
  const queryParts = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--scope') { options.scope = argv[++i]; if (!['docs', 'code', 'all'].includes(options.scope)) usage('--scope must be docs, code or all.', 'query'); }
    else if (arg === '--search') { options.search = argv[++i]; if (!['hybrid', 'keyword', 'vector'].includes(options.search)) usage('--search must be hybrid, keyword or vector.', 'query'); }
    else if (arg === '--limit') { const value = Number(argv[++i]); if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) usage(`--limit must be an integer from 1 to ${MAX_LIMIT}.`, 'query'); options.limit = value; }
    else if (arg.startsWith('-')) usage(`Unknown option: ${arg}`, 'query');
    else if (!rootSet) { options.root = resolve(arg); rootSet = true; }
    else queryParts.push(arg);
  }
  options.query = queryParts.join(' ').trim();
  if (!options.query) usage('query requires search text.', 'query');
  return options;
}

function assertVector(vector, dimensions, label) {
  if (!vector || vector.length !== dimensions || !isValidNormalizedVectorValues(vector, dimensions)) throw new Error(`${label} must be a finite normalized ${dimensions}-dimensional vector.`);
}

export function cosineScore(left, vectors, offset = 0, dimensions = left?.length) {
  assertVector(left, dimensions, 'Query vector');
  const right = vectors?.subarray ? vectors.subarray(offset, offset + dimensions) : vectors?.slice(offset, offset + dimensions);
  assertVector(right, dimensions, 'Passage vector');
  let score = 0;
  for (let index = 0; index < dimensions; index += 1) score += left[index] * right[index];
  return Math.max(-1, Math.min(1, score));
}

export function rankVectorFiles(queryVector, index) {
  const dimensions = index?.manifest?.dimensions ?? queryVector?.length;
  assertVector(queryVector, dimensions, 'Query vector');
  if (!index || !Array.isArray(index.chunks) || index.vectors?.length !== index.chunks.length * dimensions || !isValidNormalizedVectorValues(index.vectors, dimensions)) throw new Error('Vector index contains invalid passage vectors.');
  const ranked = index.chunks.map((chunk, position) => ({ ...chunk, vectorScore: cosineScore(queryVector, index.vectors, position * dimensions, dimensions) }))
    .sort((left, right) => right.vectorScore - left.vectorScore || left.path.localeCompare(right.path) || left.id.localeCompare(right.id));
  const results = []; const seen = new Set();
  for (const chunk of ranked) if (!seen.has(chunk.path)) { seen.add(chunk.path); results.push(chunk); }
  return results;
}

function lexicalBoost(query, chunk) {
  const terms = new Set(query.toLowerCase().split(/[^\p{L}\p{N}_.:/-]+/u).filter((term) => term.length > 1));
  if (!terms.size) return 0;
  const haystack = `${chunk.path} ${chunk.heading}`.toLowerCase();
  let matches = 0; for (const term of terms) if (haystack.includes(term)) matches += 1;
  return Math.min(0.08, (matches / terms.size) * 0.08);
}

export async function buildVectorIndex(root, embedOrOptions = {}) {
  const options = typeof embedOrOptions === 'function' ? { embed: embedOrOptions } : embedOrOptions;
  const resolved = await resolveEmbedder(root, options);
  const config = readMemoryConfig(root);
  const exclude = config.load?.documentationSummary?.exclude ?? ['docs/plan', 'docs/archive'];
  const chunks = options.chunks ?? collectDocumentationChunks(root, exclude, config.documentation?.root ?? 'docs');
  return vectorCacheSession(root, resolved.identity, async (state, save, diagnostics) => {
  const selectedFingerprints = new Set(chunks.map((chunk) => chunk.fingerprint));
  state.pending = state.pending.filter((row) => selectedFingerprints.has(row.chunk.fingerprint));
  const recovered = new Set(state.pending.map((row) => row.chunk.fingerprint));
  const cacheRows = [...state.docs, ...state.code, ...state.pending];
  const cached = state.dimensions ? { chunks: cacheRows.map((row) => row.chunk), vectors: Float32Array.from(cacheRows.flatMap((row) => row.vector)), manifest: { dimensions: state.dimensions } } : null;
  const cachedOffsets = new Map((cached?.chunks ?? []).map((chunk, index) => [chunk.fingerprint, index]));
  const rows = new Array(chunks.length);
  const missing = []; let reused = 0;
  chunks.forEach((chunk, index) => { const oldIndex = cachedOffsets.get(chunk.fingerprint); if (oldIndex === undefined || !cached) missing.push({ chunk, index }); else { const d = cached.manifest.dimensions; rows[index] = Array.from(cached.vectors.subarray(oldIndex * d, (oldIndex + 1) * d)); reused += 1; } });
  for (let offset = 0; offset < missing.length; offset += EMBED_BATCH_SIZE) {
    const batch = missing.slice(offset, offset + EMBED_BATCH_SIZE);
    const embedded = await resolved.embed(batch.map(({ chunk }) => chunk.passage), 'document');
    if (!Array.isArray(embedded) || embedded.length !== batch.length) throw new Error('Embedder returned an unexpected vector count.');
    embedded.forEach((vector, index) => {
      const dimensions = state.dimensions ?? vector.length;
      assertVector(vector, dimensions, 'Passage vector');
      state.dimensions = dimensions;
      rows[batch[index].index] = vector;
      const { passage, ...chunk } = batch[index].chunk;
      state.pending.push({ chunk, vector: Array.from(vector) });
    });
    save();
  }
  const dimensions = rows[0]?.length ?? cached?.manifest?.dimensions;
  if (!dimensions && chunks.length) throw new Error('No documentation chunks were available to establish vector dimensions.');
  if (rows.some((row) => !row || row.length !== dimensions)) throw new Error('Embedder returned inconsistent passage-vector dimensions.');
  const vectors = new Float32Array(chunks.length * dimensions);
  rows.forEach((row, index) => { assertVector(row, dimensions, 'Passage vector'); vectors.set(row, index * dimensions); });
  const storedChunks = chunks.map(({ passage, ...chunk }) => chunk);
  const refreshed = options.corpora ?? (options.chunks ? [...new Set(chunks.map((chunk) => chunk.kind === 'symbol' ? 'code' : 'docs'))] : ['docs']);
  const counters = {};
  for (const corpus of refreshed) {
    const positions = chunks.map((chunk, index) => ({ chunk, index })).filter(({ chunk }) => (chunk.kind === 'symbol' ? 'code' : 'docs') === corpus);
    state[corpus] = positions.map(({ index }) => ({ chunk: storedChunks[index], vector: Array.from(rows[index]) }));
    counters[corpus] = { chunks: positions.length, embedded: missing.filter(({ chunk }) => (chunk.kind === 'symbol' ? 'code' : 'docs') === corpus).length, recovered: positions.filter(({ chunk }) => recovered.has(chunk.fingerprint)).length };
    counters[corpus].reused = positions.length - counters[corpus].embedded;
  }
  state.pending = [];
  save();
  const metadata = { provider: resolved.profile.provider, model: resolved.profile.model, dimensions, profileFingerprint: profileFingerprint(resolved.identity), excluded: exclude, embedded: missing.length, reused, diagnostics: { ...diagnostics, corpora: counters } };
  // Keep the legacy export readable; authoritative snapshots remain atomic above.
  const manifest = dimensions ? writeVectorCache(root, storedChunks, vectors, metadata) : { chunks: 0, ...metadata };
  return { chunks: storedChunks, vectors, manifest, embedding: resolved };
  });
}

export async function queryDocumentation(root, query, options = {}) {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const index = await buildVectorIndex(root, options);
  const [queryVector] = await index.embedding.embed([query], 'query');
  const dimensions = index.manifest.dimensions;
  assertVector(queryVector, dimensions, 'Query vector');
  const results = rankVectorFiles(queryVector, index).map((chunk) => ({ ...chunk, score: Number((chunk.vectorScore + lexicalBoost(query, chunk)).toFixed(6)), vectorScore: Number(chunk.vectorScore.toFixed(6)) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
  return { ok: true, command: 'query', root, query, provider: index.embedding.profile.provider, model: index.embedding.profile.model, embeddingSource: index.embedding.source, dimensions, limit, index: index.manifest, results };
}

export async function queryProject(root, query, options = {}) {
  const scope = options.scope ?? 'all';
  const search = options.search ?? 'hybrid';
  const limit = options.limit ?? DEFAULT_LIMIT;
  const corpus = await projectCorpus(root, scope);
  const keyword = search === 'vector' ? [] : keywordCandidates(query, corpus.chunks);
  let vector = []; let index; let vectorError;
  let configured = false;
  if (search !== 'keyword') {
    try { configured = Boolean(options.profile || options.embed || resolveEmbeddingProfile(root, options).profile); }
    catch (error) { if (search === 'vector') throw error; vectorError = error.message; }
    if (!configured && !vectorError && search === 'vector') throw new Error('Embedding is not configured. Set embedding in project or global configuration to use vector search.');
  }
  if (search !== 'keyword' && configured) {
    try {
      index = await buildVectorIndex(root, { ...options, chunks: corpus.chunks, corpora: scope === 'all' ? ['docs', 'code'] : [scope] });
      const [queryVector] = index.chunks.length ? await index.embedding.embed([query], 'query') : [];
      vector = index.chunks.map((chunk, position) => ({ ...chunk, vectorScore: cosineScore(queryVector, index.vectors, position * index.manifest.dimensions, index.manifest.dimensions) }))
        .sort((a, b) => b.vectorScore - a.vectorScore || a.id.localeCompare(b.id));
    } catch (error) {
      if (search === 'vector') throw error;
      vectorError = error instanceof Error ? error.message : String(error);
    }
  }
  const results = attachRelationships(fuseCandidates(keyword, vector, limit), corpus.outlines).map(({ passage, ...result }) => result);
  return { ok: true, command: 'query', root, query, scope, search, limit,
    provider: index?.embedding.profile.provider ?? null, model: index?.embedding.profile.model ?? null,
    embeddingSource: index?.embedding.source ?? 'not-used', dimensions: index?.manifest.dimensions ?? null,
    index: index?.manifest ?? null, outlines: corpus.outlines ? { refresh: corpus.outlines.refresh, indexedFiles: corpus.outlines.files.length, diagnostics: corpus.outlines.files.filter((file) => file.status !== 'parsed').map(({ path, status }) => ({ path, status })) } : null,
    warnings: [...(vectorError ? [`Vector retrieval unavailable; keyword results only: ${vectorError}`] : []), ...(corpus.outlines?.files.filter((file) => file.status !== 'parsed').map((file) => `Outline ${file.status}: ${file.path}`) ?? [])], results };
}

function formatQueryResult(payload) {
  const lines = [`dotdotgod query: ${payload.query}`, `- embedding: ${payload.provider ? `${payload.provider}/${payload.model}` : 'not used'} (${payload.embeddingSource})`, `- results: ${payload.results.length}`, ...(payload.warnings ?? [])];
  payload.results.forEach((result, index) => { lines.push(`${index + 1}. ${result.path}${result.startLine ? `:${result.startLine}–${result.endLine}` : ''}${result.heading ? ` — ${result.heading}` : ''} (${result.score.toFixed(3)})`); const excerpt = result.text.replace(/\s+/g, ' ').trim().slice(0, 240); if (excerpt) lines.push(`   ${excerpt}${result.text.length > 240 ? '…' : ''}`); });
  return lines.join('\n');
}

export async function runQuery(argv) {
  const options = parseQueryOptions(argv);
  try { const payload = await queryProject(options.root, options.query, options); console.log(options.json ? JSON.stringify(payload, null, 2) : formatQueryResult(payload)); }
  catch (error) { const message = `dotdotgod query failed: ${error instanceof Error ? error.message : String(error)}`; if (options.json) console.log(JSON.stringify({ ok: false, command: 'query', root: options.root, query: options.query, error: message }, null, 2)); else console.error(message); process.exitCode = 1; }
}
