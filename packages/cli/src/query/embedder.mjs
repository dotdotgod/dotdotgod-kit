import { embeddingProfileIdentity, resolveEmbeddingProfile } from './embedding-config.mjs';

const localPipelines = new Map();

function normalize(row) {
  if (!Array.isArray(row) || row.length === 0 || row.some((value) => !Number.isFinite(value))) throw new Error('Embedding provider returned an invalid vector.');
  const norm = Math.sqrt(row.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) throw new Error('Embedding provider returned a zero-length vector.');
  return row.map((value) => value / norm);
}

async function localEmbedder(profile) {
  if (!localPipelines.has(profile.model)) {
    localPipelines.set(profile.model, import('@huggingface/transformers').then(async ({ env, pipeline }) => {
      env.allowLocalModels = true;
      return pipeline('feature-extraction', profile.model);
    }));
  }
  const model = await localPipelines.get(profile.model);
  return async (texts) => (await model(texts, { pooling: 'mean', normalize: true })).tolist().map(normalize);
}

function credential(profile) {
  if (profile.apiKey) return profile.apiKey;
  if (!profile.apiKeyEnv) return null;
  const value = process.env[profile.apiKeyEnv];
  if (!value) throw new Error(`Embedding credential environment variable is not set: ${profile.apiKeyEnv}`);
  return value;
}

async function postJson(url, body, profile) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const key = credential(profile);
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) {
      const category = response.status === 401 || response.status === 403 ? 'authentication' : response.status === 429 ? 'rate limit' : `HTTP ${response.status}`;
      throw new Error(`Remote embedding ${category} failure.`);
    }
    try { return await response.json(); } catch { throw new Error('Remote embedding returned malformed JSON.'); }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Remote embedding request timed out.');
    throw error;
  } finally { clearTimeout(timer); }
}

function remoteEmbedder(profile) {
  if (profile.provider === 'ollama') return async (texts) => {
    const data = await postJson(`${profile.baseUrl ?? 'http://localhost:11434'}/api/embed`, { model: profile.model, input: texts }, profile);
    if (!Array.isArray(data.embeddings)) throw new Error('Ollama embedding response is missing embeddings.');
    return data.embeddings.map(normalize);
  };
  return async (texts) => {
    const data = await postJson(`${profile.baseUrl ?? 'https://api.openai.com/v1'}/embeddings`, { model: profile.model, input: texts }, profile);
    if (!Array.isArray(data.data)) throw new Error('OpenAI-compatible embedding response is missing data.');
    const ordered = [...data.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
    return ordered.map(normalize);
  };
}

export async function createEmbedder(profile) {
  const embed = profile.provider === 'local' ? await localEmbedder(profile) : remoteEmbedder(profile);
  return async (texts) => {
    if (texts.length === 0) return [];
    const rows = await embed(texts);
    if (!Array.isArray(rows) || rows.length !== texts.length) throw new Error('Embedding provider returned an unexpected vector count.');
    const dimensions = rows[0]?.length;
    if (!dimensions || rows.some((row) => row.length !== dimensions)) throw new Error('Embedding provider returned inconsistent vector dimensions.');
    return rows;
  };
}

export async function resolveEmbedder(root, options = {}) {
  const resolved = options.profile ? { profile: options.profile, source: options.source ?? 'injected', path: null } : resolveEmbeddingProfile(root, options);
  return { ...resolved, identity: embeddingProfileIdentity(resolved.profile), embed: options.embed ?? await createEmbedder(resolved.profile) };
}

export async function embedTexts(texts) {
  const { embed } = await resolveEmbedder('.');
  return embed(texts);
}
