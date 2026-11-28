import { resolve } from 'node:path';
import { DotdotgodServiceError } from './map.mjs';
import { readPreparedVectorSnapshot, sqliteVectorSnapshot, vectorCacheSession } from '../query/cache-session.mjs';
import { usage } from '../cli/usage.mjs';
import { readMemoryConfig } from '../memory/config.mjs';
import { refreshDocs, documentationChunks } from '../storage/change-detector.mjs';
import { chunkCorpus, openReadOnly, openWriter } from '../storage/index-store.mjs';
import { ftsCandidates } from '../storage/fts-search.mjs';
import { resolveEmbedder, withEmbeddingOperation } from '../query/embedder.mjs';
import { DEFAULT_EMBEDDING_PROFILE, embeddingProfileIdentity, resolveEmbeddingProfile } from '../query/embedding-config.mjs';
import { isValidNormalizedVectorValues, profileFingerprint, writeVectorCache } from '../query/store.mjs';

import { projectCorpus, keywordCandidates, fuseCandidates, attachRelationships, indexPathFilter } from '../query/hybrid.mjs';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const EMBED_BATCH_SIZE = 16;

export function parseQueryOptions(argv) {
  const options = { root: '.', query: '', limit: DEFAULT_LIMIT, json: false, scope: 'all', search: 'hybrid' };
  const operands = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      operands.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--json') options.json = true;
    else if (arg === '--no-write') options.readOnly = true;
    else if (arg === '--prepared-only') options.indexPolicy = 'prepared-only';
    else if (arg === '--scope') { options.scope = argv[++i]; if (!['docs', 'code', 'all', 'shared'].includes(options.scope)) usage('--scope must be docs, code, all or shared.', 'query'); }
    else if (arg === '--search') { options.search = argv[++i]; if (!['hybrid', 'keyword', 'vector'].includes(options.search)) usage('--search must be hybrid, keyword or vector.', 'query'); }
    else if (arg === '--limit') { const value = Number(argv[++i]); if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) usage(`--limit must be an integer from 1 to ${MAX_LIMIT}.`, 'query'); options.limit = value; }
    else if (arg.startsWith('-')) usage(`Unknown option: ${arg}`, 'query');
    else operands.push(arg);
  }
  const [root = '.', ...queryParts] = operands;
  options.root = resolve(root);
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

async function awaitEmbedding(signal, start) {
  if (!signal) return start();
  signal.throwIfAborted();
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    const result = await Promise.race([cancelled, Promise.resolve().then(() => {
      signal.throwIfAborted();
      return start();
    })]);
    signal.throwIfAborted();
    return result;
  } finally { signal.removeEventListener('abort', abort); }
}

export async function buildVectorIndex(root, embedOrOptions = {}) {
  const options = typeof embedOrOptions === 'function' ? { embed: embedOrOptions } : embedOrOptions;
  const { signal } = options;
  const resolved = await awaitEmbedding(signal, () => resolveEmbedder(root, options));
  const { embed } = resolved;
  if (signal) resolved.embed = (...args) => awaitEmbedding(signal, () => embed(...args));
  signal?.throwIfAborted();
  const config = readMemoryConfig(root);
  const exclude = config.load?.documentationSummary?.exclude ?? ['docs/plan', 'docs/archive'];
  let chunks = options.chunks;
  if (!chunks) {
    const reader = openReadOnly(root);
    try { chunks = documentationChunks(root, config, reader); }
    finally { reader?.close(); }
  }
  const refreshed = options.corpora ?? (options.chunks ? [...new Set(chunks.map(chunkCorpus))] : ['docs']);
  const updateDocs = !options.chunks || options.refreshDocs;
  const refresh = updateDocs || options.refreshOutlines ? (store) => {
    options.refreshOutlines?.(store);
    if (updateDocs) refreshDocs(root, store, config);
  } : null;
  return vectorCacheSession(root, resolved.identity, async (session, diagnostics) => {
    signal?.throwIfAborted();
    let dimensions;
    const rows = new Array(chunks.length);
    const missing = [];
    const counters = Object.fromEntries(refreshed.map((corpus) => [corpus, { chunks: 0, embedded: 0, reused: 0, recovered: 0 }]));
    const corpora = new Map(refreshed.map((corpus) => [corpus, []]));
    chunks.forEach((chunk, index) => {
      const corpus = chunkCorpus(chunk);
      if (!counters[corpus]) throw new Error(`Chunk ${chunk.id} does not belong to a refreshed corpus.`);
      const counts = counters[corpus];
      corpora.get(corpus).push(chunk.fingerprint);
      counts.chunks += 1;
      const old = session.lookup(chunk.fingerprint);
      if (!old) { missing.push({ chunk, index }); counts.embedded += 1; return; }
      dimensions ??= old.dimensions;
      assertVector(old.vector, dimensions, 'Cached passage vector');
      rows[index] = old.vector;
      counts.reused += 1;
      if (!old.committed) counts.recovered += 1;
    });
    const isolated = resolved.profile.provider === 'local' && options.openLocal && !options.embed;
    const staged = [];
    try {
      for (let offset = 0; offset < missing.length; offset += EMBED_BATCH_SIZE) {
        const batch = missing.slice(offset, offset + EMBED_BATCH_SIZE);
        const embedded = await resolved.embed(batch.map(({ chunk }) => chunk.passage), 'document');
        signal?.throwIfAborted();
        if (!Array.isArray(embedded) || embedded.length !== batch.length) throw new Error('Embedder returned an unexpected vector count.');
        const completed = embedded.map((vector, i) => {
          dimensions ??= vector.length;
          assertVector(vector, dimensions, 'Passage vector');
          rows[batch[i].index] = vector;
          return { fingerprint: batch[i].chunk.fingerprint, corpus: chunkCorpus(batch[i].chunk), vector };
        });
        if (isolated) staged.push(...completed);
        else session.save(dimensions, completed);
      }
    } catch (error) {
      if (staged.length && !signal?.aborted) session.save(dimensions, staged);
      throw error;
    }
    signal?.throwIfAborted();
    session.commit(dimensions, staged, corpora, refresh, options.scope === 'shared');
    const vectors = new Float32Array(chunks.length * (dimensions ?? 0));
    rows.forEach((row, index) => vectors.set(row, index * dimensions));
    const storedChunks = chunks.map(({ passage, ...chunk }) => chunk);
    const metadata = { provider: resolved.profile.provider, model: resolved.profile.model, dimensions, profileFingerprint: profileFingerprint(resolved.identity), excluded: exclude, embedded: missing.length, reused: chunks.length - missing.length, diagnostics: { ...diagnostics, corpora: counters } };
    const manifest = dimensions && options.exportLegacy ? writeVectorCache(root, storedChunks, vectors, metadata) : { chunks: chunks.length, ...metadata };
    return { chunks: storedChunks, vectors, manifest, embedding: resolved };
  });
}

export async function queryDocumentation(root, query, options = {}) {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const index = await buildVectorIndex(root, { ...options, exportLegacy: true });
  const [queryVector] = await index.embedding.embed([query], 'query');
  const dimensions = index.manifest.dimensions;
  assertVector(queryVector, dimensions, 'Query vector');
  const results = rankVectorFiles(queryVector, index).map((chunk) => ({ ...chunk, score: Number((chunk.vectorScore + lexicalBoost(query, chunk)).toFixed(6)), vectorScore: Number(chunk.vectorScore.toFixed(6)) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
  return { ok: true, command: 'query', root, query, provider: index.embedding.profile.provider, model: index.embedding.profile.model, embeddingSource: index.embedding.source, dimensions, limit, index: index.manifest, results };
}

export async function queryProject(root, query, options = {}) {
  return withEmbeddingOperation(options, (operation) => queryWithEmbedding(root, query, operation));
}

async function queryWithEmbedding(root, query, options) {
  const { signal } = options;
  signal?.throwIfAborted();
  let store;
  try {
    const scope = options.scope ?? 'all';
    const search = options.readOnly ? 'keyword' : options.search ?? 'hybrid';
    const limit = options.limit ?? DEFAULT_LIMIT;
    const preparedOnly = options.indexPolicy === 'prepared-only';
    const resolveProfile = () => options.profile || options.embed
      ? { profile: options.profile ?? DEFAULT_EMBEDDING_PROFILE, source: options.source ?? 'injected' }
      : resolveEmbeddingProfile(root, options);
    let selection; let configurationError;
    if (!preparedOnly && search !== 'keyword') {
      try { selection = resolveProfile(); } catch (error) { configurationError = error; }
    }
    const stageOutlines = selection?.profile?.provider === 'local' && !options.embed;
    const corpus = await projectCorpus(root, scope, options.readOnly, { preparedOnly, stageOutlines });
    signal?.throwIfAborted();
    const response = { ok: true, command: 'query', root, query, scope, search, limit };
    if (corpus.missingDocumentationRoot) {
      return { ...response, provider: null, model: null, embeddingSource: 'not-used', dimensions: null, index: null, outlines: null, results: [],
        warnings: [`Documentation root "${corpus.documentationRoot}" is missing. Select a repository with a configured documentation directory and retry.`] };
    }
    const corpora = scope === 'all' || scope === 'shared' ? ['docs', 'code'] : [scope];
    const writable = !preparedOnly && !options.readOnly;
    const refresh = (docs, outlines) => {
      const writer = openWriter(root);
      try {
        if (outlines) corpus.outlines?.publish?.(writer);
        if (docs) refreshDocs(root, writer, corpus.config);
      } finally { writer.close(); }
    };
    if (!writable) store = openReadOnly(root);
    let allowed = store && indexPathFilter(root, store, corpus.allowPath, options.readOnly);
    let vector = []; let index; let vectorError; let refreshed = false; let publishedOutlines = false;
    if (search !== 'keyword') {
      try {
        if (configurationError) throw configurationError;
        const { profile, source } = selection ?? resolveProfile();
        const embeddingOptions = { ...options, profile, source };
        if (!profile) {
          if (search === 'vector') throw new Error('Embedding is not configured. Set embedding in project or global configuration to use vector search.');
        } else if (preparedOnly) {
          const identity = embeddingProfileIdentity(profile);
          const prepared = store ? sqliteVectorSnapshot(root, store, identity, corpora, allowed, limit)
            : corpus.indexExists ? { ready: false, reason: 'unusable' } : readPreparedVectorSnapshot(root, identity, corpus.chunks(), corpora);
          if (!prepared.ready) throw new Error(`Prepared snapshot not ready (${prepared.reason}).`);
          const embedding = await awaitEmbedding(signal, () => resolveEmbedder(root, embeddingOptions));
          index = { ...prepared, embedding };
        } else {
          const cached = openReadOnly(root);
          let chunks;
          try { chunks = corpus.chunks(cached); }
          finally { cached?.close(); }
          index = await buildVectorIndex(root, { ...embeddingOptions, chunks, corpora, refreshDocs: scope !== 'code', refreshOutlines: corpus.outlines?.publish });
          refreshed = scope !== 'code';
          publishedOutlines = true;
          store = openReadOnly(root);
          if (store) {
            allowed = indexPathFilter(root, store, corpus.allowPath);
            const prepared = sqliteVectorSnapshot(root, store, embeddingProfileIdentity(profile), corpora, allowed, limit);
            if (prepared.ready) index.rank = prepared.rank;
          }
        }
        if (index?.rank || index?.chunks.length) {
          const [queryVector] = await awaitEmbedding(signal, () => index.embedding.embed([query], 'query'));
          signal?.throwIfAborted();
          assertVector(queryVector, index.manifest.dimensions, 'Query vector');
          vector = index.rank ? index.rank(queryVector) : index.chunks.map((chunk, position) => ({ ...chunk, vectorScore: cosineScore(queryVector, index.vectors, position * index.manifest.dimensions, index.manifest.dimensions) }))
            .sort((a, b) => b.vectorScore - a.vectorScore || a.id.localeCompare(b.id));
        }
      } catch (error) {
        signal?.throwIfAborted();
        if (search === 'vector') throw error;
        vectorError = error instanceof Error ? error.message : String(error);
      }
    }
    if (writable) {
      const refreshDocumentation = scope !== 'code' && !refreshed;
      const refreshOutlines = !publishedOutlines && Boolean(corpus.outlines?.publish);
      if (refreshDocumentation || refreshOutlines) refresh(refreshDocumentation, refreshOutlines);
      if (!store) {
        store = openReadOnly(root);
        allowed = store && indexPathFilter(root, store, corpus.allowPath);
      }
    }
    let keyword = [];
    if (search !== 'vector') {
      const docsIndexed = !options.readOnly && store?.meta('docs_root') === corpus.config.documentation.root;
      const indexed = !store ? [] : corpora.filter((kind) => kind !== 'docs' || docsIndexed);
      const fallback = corpora.filter((kind) => !indexed.includes(kind));
      if (indexed.length) keyword = ftsCandidates(store, query, indexed, limit, allowed);
      if (fallback.length) keyword.push(...keywordCandidates(query, corpus.chunks(store, fallback)));
    }
    signal?.throwIfAborted();
    const results = attachRelationships(fuseCandidates(keyword, vector, limit), corpus.legacy, scope === 'docs' ? null : store, allowed).map(({ passage, ...result }) => result);
    let summary = null;
    if (scope !== 'docs') {
      const rows = store?.meta('outline_policy') ? store.sql("SELECT path,status FROM files WHERE kind='code' AND status IN ('failed','partial','unsupported') ORDER BY path").all()
        : corpus.legacy?.files.filter((file) => file.status !== 'parsed');
      if (rows) summary = { refresh: corpus.outlines?.refresh,
        indexedFiles: store ? Number(store.meta('outline_count') ?? 0) : corpus.legacy.files.length,
        diagnostics: rows.filter(({ path }) => corpus.allowPath(path, 'code')).map(({ path, status }) => ({ path, status })) };
    }
    return { ...response,
      provider: index?.embedding.profile.provider ?? null, model: index?.embedding.profile.model ?? null,
      embeddingSource: index?.embedding.source ?? 'not-used', dimensions: index?.manifest.dimensions ?? null,
      index: index?.manifest ?? null, outlines: summary,
      warnings: [...(vectorError ? [`Vector retrieval unavailable; keyword results only: ${vectorError}`] : []), ...(summary?.diagnostics.map((file) => `Outline ${file.status}: ${file.path}`) ?? [])], results };
  } catch (error) {
    signal?.throwIfAborted();
    throw DotdotgodServiceError.from(error, 'QUERY_FAILED');
  } finally { store?.close(); }
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
