import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_EMBEDDING_PROFILE, embeddingInputFormat, embeddingProfileIdentity, resolveEmbeddingProfile } from './embedding-config.mjs';
import { importTransformers, resolveTransformersModule } from './embedding-runtime.mjs';

const localPipelines = new Map();

function normalize(row) {
  if (!Array.isArray(row) || row.length === 0 || row.some((value) => !Number.isFinite(value))) throw new Error('Embedding provider returned an invalid vector.');
  const norm = Math.sqrt(row.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) throw new Error('Embedding provider returned a zero-length vector.');
  return row.map((value) => value / norm);
}

async function localEmbedder(profile) {
  if (!localPipelines.has(profile.model)) {
    localPipelines.set(profile.model, importTransformers().then(async ({ env, pipeline }) => {
      env.allowLocalModels = true;
      return pipeline('feature-extraction', profile.model);
    }));
  }
  const model = await localPipelines.get(profile.model);
  return async (texts) => (await model(texts, { pooling: 'mean', normalize: true })).tolist().map(normalize);
}

function startLocalInference(profile, options) {
  const { signal } = options;
  signal?.throwIfAborted();
  const runtime = resolveTransformersModule(options);
  const entry = fileURLToPath(new URL('./local-inference.mjs', import.meta.url));
  const child = spawn(process.execPath, [entry, runtime, profile.model], { cwd: options.cwd, shell: false, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const stop = () => { if (!child.killed && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); };
  let pending = Promise.withResolvers();
  let dead = false;
  const ready = pending.promise;
  const failed = () => {
    dead = true;
    pending?.reject(signal?.aborted ? signal.reason : new Error('Local embedding inference helper exited unexpectedly.'));
  };
  child.on('message', (message) => {
    if (!pending) return;
    if (message?.type === 'error' && typeof message.message === 'string') pending.reject(new Error(message.message));
    else if (message?.type === 'ready') pending.resolve();
    else if (message?.type === 'result' && Array.isArray(message.rows)) pending.resolve(message.rows);
    else pending.reject(new Error('Local embedding inference helper returned an invalid response.'));
    pending = null;
  });
  child.on('error', failed);
  const closed = new Promise((resolve) => child.once('close', () => {
    signal?.removeEventListener('abort', stop);
    failed();
    resolve();
  }));
  signal?.addEventListener('abort', stop, { once: true });
  return {
    async open() {
      await ready;
      return async (texts) => {
        signal?.throwIfAborted();
        if (dead) throw new Error('Local embedding inference helper exited unexpectedly.');
        pending = Promise.withResolvers();
        const { promise } = pending;
        child.send(texts, (error) => { if (error) failed(); });
        return (await promise).map(normalize);
      };
    },
    async close() { stop(); await closed; },
  };
}

// One lazy child per project query or impact; reuse the pipeline for every batch.
export async function withEmbeddingOperation(options, run) {
  let local;
  try {
    return await run({ ...options, openLocal: (profile) => {
      local ??= startLocalInference(profile, options);
      return local.open();
    } });
  } finally { await local?.close(); }
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
      const error = new Error(`Remote embedding ${category} failure.`);
      if (response.status === 400 || response.status === 413) {
        const body = (await response.text()).slice(0, 8192);
        error.tokenLimit = /(?:exceed\w*[\s\S]{0,120}tokens?|tokens?[\s\S]{0,120}(?:exceed|limit|too (?:long|many))|maximum context length)/i.test(body);
      }
      throw error;
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

function withInputFormat(embed, profile) {
  const format = embeddingInputFormat(profile);
  return (texts, role) => {
    if (role !== undefined && role !== 'query' && role !== 'document') throw new Error('Embedding role must be query or document.');
    return embed(role === undefined ? texts : texts.map((text) => format[`${role}Prefix`] + text));
  };
}

export async function createEmbedder(profile, options = {}) {
  const embed = profile.provider === 'local' ? await (options.openLocal ?? localEmbedder)(profile) : remoteEmbedder(profile);
  async function embedBatch(texts) {
    if (texts.length === 0) return [];
    let rows;
    try { rows = await embed(texts); }
    catch (error) {
      if (!error.tokenLimit || texts.length === 1) throw error;
      const middle = Math.ceil(texts.length / 2);
      rows = [...await embedBatch(texts.slice(0, middle)), ...await embedBatch(texts.slice(middle))];
    }
    if (!Array.isArray(rows) || rows.length !== texts.length) throw new Error('Embedding provider returned an unexpected vector count.');
    const dimensions = rows[0]?.length;
    if (!dimensions || rows.some((row) => row.length !== dimensions)) throw new Error('Embedding provider returned inconsistent vector dimensions.');
    return rows;
  }
  return withInputFormat(embedBatch, profile);
}

export async function resolveEmbedder(root, options = {}) {
  const resolved = options.profile || options.embed ? { profile: options.profile ?? DEFAULT_EMBEDDING_PROFILE, source: options.source ?? 'injected', path: null } : resolveEmbeddingProfile(root, options);
  if (!resolved.profile) throw new Error('Embedding is not configured. Set embedding in project or global configuration to use vector search.');
  return { ...resolved, identity: embeddingProfileIdentity(resolved.profile), embed: options.embed ? withInputFormat(options.embed, resolved.profile) : await createEmbedder(resolved.profile, options) };
}

export async function embedTexts(texts) {
  const { embed } = await resolveEmbedder('.');
  return embed(texts);
}
