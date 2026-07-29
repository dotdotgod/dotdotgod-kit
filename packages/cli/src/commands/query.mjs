import { resolve } from 'node:path';
import { usage } from '../cli/usage.mjs';
import { readMemoryConfig } from '../memory/config.mjs';
import { collectDocumentationChunks } from '../query/chunks.mjs';
import { embedTexts } from '../query/embedder.mjs';
import { readVectorCache, VECTOR_DIMENSIONS, VECTOR_MODEL, writeVectorCache } from '../query/store.mjs';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const EMBED_BATCH_SIZE = 16;

export function parseQueryOptions(argv) {
  const options = { root: '.', query: '', limit: DEFAULT_LIMIT, json: false };
  let rootSet = false;
  const queryParts = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--limit') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) usage(`--limit must be an integer from 1 to ${MAX_LIMIT}.`, 'query');
      options.limit = value;
    } else if (arg.startsWith('-')) usage(`Unknown option: ${arg}`, 'query');
    else if (!rootSet) {
      options.root = resolve(arg);
      rootSet = true;
    } else queryParts.push(arg);
  }
  options.query = queryParts.join(' ').trim();
  if (!options.query) usage('query requires search text.', 'query');
  return options;
}

function cosine(left, vectors, offset) {
  let score = 0;
  for (let index = 0; index < VECTOR_DIMENSIONS; index += 1) score += left[index] * vectors[offset + index];
  return score;
}

function lexicalBoost(query, chunk) {
  const queryTerms = new Set(query.toLowerCase().split(/[^\p{L}\p{N}_.:/-]+/u).filter((term) => term.length > 1));
  if (queryTerms.size === 0) return 0;
  const haystack = `${chunk.path} ${chunk.heading}`.toLowerCase();
  let matches = 0;
  for (const term of queryTerms) if (haystack.includes(term)) matches += 1;
  return Math.min(0.08, (matches / queryTerms.size) * 0.08);
}

export async function buildVectorIndex(root, embed = embedTexts) {
  const config = readMemoryConfig(root);
  const exclude = config.load?.documentationSummary?.exclude ?? ['docs/plan', 'docs/archive'];
  const chunks = collectDocumentationChunks(root, exclude);
  const cached = readVectorCache(root);
  const cachedOffsets = new Map((cached?.chunks ?? []).map((chunk, index) => [chunk.fingerprint, index * VECTOR_DIMENSIONS]));
  const vectors = new Float32Array(chunks.length * VECTOR_DIMENSIONS);
  const missing = [];
  let reused = 0;
  chunks.forEach((chunk, index) => {
    const oldOffset = cachedOffsets.get(chunk.fingerprint);
    if (oldOffset === undefined || !cached) missing.push({ chunk, index });
    else {
      vectors.set(cached.vectors.subarray(oldOffset, oldOffset + VECTOR_DIMENSIONS), index * VECTOR_DIMENSIONS);
      reused += 1;
    }
  });
  for (let offset = 0; offset < missing.length; offset += EMBED_BATCH_SIZE) {
    const batch = missing.slice(offset, offset + EMBED_BATCH_SIZE);
    const embedded = await embed(batch.map(({ chunk }) => `passage: ${chunk.passage}`));
    embedded.forEach((vector, index) => vectors.set(vector, batch[index].index * VECTOR_DIMENSIONS));
  }
  const storedChunks = chunks.map(({ passage, ...chunk }) => chunk);
  const manifest = writeVectorCache(root, storedChunks, vectors, {
    excluded: exclude,
    embedded: missing.length,
    reused,
  });
  return { chunks: storedChunks, vectors, manifest };
}

export async function queryDocumentation(root, query, options = {}) {
  const embed = options.embed ?? embedTexts;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const index = await buildVectorIndex(root, embed);
  const [queryVector] = await embed([`query: ${query}`]);
  const rankedChunks = index.chunks.map((chunk, position) => {
    const vectorScore = cosine(queryVector, index.vectors, position * VECTOR_DIMENSIONS);
    return { ...chunk, score: Number((vectorScore + lexicalBoost(query, chunk)).toFixed(6)), vectorScore: Number(vectorScore.toFixed(6)) };
  }).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  const results = [];
  const seenPaths = new Set();
  for (const chunk of rankedChunks) {
    if (seenPaths.has(chunk.path)) continue;
    seenPaths.add(chunk.path);
    results.push(chunk);
    if (results.length === limit) break;
  }
  return { ok: true, command: 'query', root, query, model: VECTOR_MODEL, dimensions: VECTOR_DIMENSIONS, limit, index: index.manifest, results };
}

function formatQueryResult(payload) {
  const lines = [`dotdotgod query: ${payload.query}`, `- model: ${payload.model}`, `- results: ${payload.results.length}`];
  payload.results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.path}${result.heading ? ` — ${result.heading}` : ''} (${result.score.toFixed(3)})`);
    const excerpt = result.text.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (excerpt) lines.push(`   ${excerpt}${result.text.length > 240 ? '…' : ''}`);
  });
  return lines.join('\n');
}

export async function runQuery(argv) {
  const options = parseQueryOptions(argv);
  try {
    const payload = await queryDocumentation(options.root, options.query, options);
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else console.log(formatQueryResult(payload));
  } catch (error) {
    const message = `dotdotgod query failed: ${error instanceof Error ? error.message : String(error)}`;
    if (options.json) console.log(JSON.stringify({ ok: false, command: 'query', root: options.root, query: options.query, error: message }, null, 2));
    else console.error(message);
    process.exitCode = 1;
  }
}
