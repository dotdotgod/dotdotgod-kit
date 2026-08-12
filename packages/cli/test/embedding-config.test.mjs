import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { queryDocumentation, buildVectorIndex } from '../src/commands/query.mjs';
import { embeddingProfileIdentity, resolveEmbeddingProfile, sanitizeEmbeddingProfile, validateEmbeddingProfile } from '../src/query/embedding-config.mjs';
import { createEmbedder } from '../src/query/embedder.mjs';
import { readVectorCache, VECTOR_SCHEMA_VERSION } from '../src/query/store.mjs';

function fixture() { const root = mkdtempSync(join(tmpdir(), 'dotdotgod-embedding-')); mkdirSync(join(root, 'docs'), { recursive: true }); writeFileSync(join(root, 'docs/README.md'), '# Docs\n\nSemantic retrieval text.\n'); return root; }
function unitVector(index, dimensions = 3) { return Array.from({ length: dimensions }, (_, position) => position === index ? 1 : 0); }

async function server(handler) { const instance = createServer(handler); await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve)); return { instance, url: `http://127.0.0.1:${instance.address().port}` }; }

describe('embedding configuration and providers', () => {
  it('resolves default, global, and whole-project profiles', () => {
    const root = fixture(); const home = mkdtempSync(join(tmpdir(), 'dotdotgod-home-')); mkdirSync(join(home, '.dotdotgod'), { recursive: true });
    assert.equal(resolveEmbeddingProfile(root, { home }).source, 'default');
    writeFileSync(join(home, '.dotdotgod/config.json'), JSON.stringify({ embedding: { provider: 'ollama', model: 'nomic-embed-text' } }));
    assert.equal(resolveEmbeddingProfile(root, { home }).profile.provider, 'ollama');
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ embedding: { provider: 'local', model: 'arbitrary/model' } }));
    assert.deepEqual(resolveEmbeddingProfile(root, { home }).profile, { provider: 'local', model: 'arbitrary/model' });
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ embedding: null }));
    assert.throws(() => resolveEmbeddingProfile(root, { home }), /project embedding must be an object/);
  });

  it('validates and redacts direct credentials', () => {
    assert.throws(() => validateEmbeddingProfile({ provider: 'openai-compatible', model: 'm', apiKey: 'x', apiKeyEnv: 'KEY' }), /mutually exclusive/);
    assert.throws(() => validateEmbeddingProfile({ provider: 'openai-compatible', model: 'm', baseUrl: 'https://user:secret@example.com' }), /must not contain credentials/);
    const safe = sanitizeEmbeddingProfile({ provider: 'openai-compatible', model: 'm', apiKey: 'secret' });
    assert.equal(safe.apiKey, '[redacted]');
    assert.deepEqual(embeddingProfileIdentity({ provider: 'openai-compatible', model: 'm', apiKey: 'secret', apiKeyEnv: 'KEY' }), { provider: 'openai-compatible', model: 'm' });
  });

  it('uses an OpenAI-compatible endpoint and rebuilds schema-1 caches', async () => {
    const requests = [];
    const remote = await server(async (request, response) => { let body = ''; for await (const chunk of request) body += chunk; const parsed = JSON.parse(body); requests.push({ authorization: request.headers.authorization, parsed }); response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ data: parsed.input.map((_, index) => ({ index, embedding: unitVector(index % 2) })) })); });
    try {
      const root = fixture();
      const profile = { provider: 'openai-compatible', model: 'remote-model', baseUrl: remote.url, apiKey: 'secret' };
      const payload = await queryDocumentation(root, 'retrieval', { profile, source: 'project', limit: 1 });
      assert.equal(payload.provider, 'openai-compatible'); assert.equal(payload.dimensions, 3); assert.equal(requests[0].authorization, 'Bearer secret');
      assert.equal(readVectorCache(root, embeddingProfileIdentity(profile)).manifest.schemaVersion, VECTOR_SCHEMA_VERSION);
      const manifestPath = join(root, '.dotdotgod/vectors/manifest.json'); const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); manifest.schemaVersion = 1; writeFileSync(manifestPath, JSON.stringify(manifest));
      let calls = 0; await buildVectorIndex(root, { profile, embed: async (texts) => { calls += 1; return texts.map(() => unitVector(0)); } }); assert(calls > 0);
      assert(!readFileSync(manifestPath, 'utf8').includes('secret'));
    } finally { remote.instance.close(); }
  });

  it('supports native Ollama responses and sanitizes remote failures', async () => {
    const remote = await server(async (request, response) => { if (request.url === '/api/embed') { let body = ''; for await (const chunk of request) body += chunk; const parsed = JSON.parse(body); response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ embeddings: parsed.input.map(() => unitVector(0)) })); } else if (request.url === '/bad/embeddings') { response.statusCode = 401; response.end('secret response body'); } else { response.setHeader('content-type', 'application/json'); response.end('{bad json'); } });
    try {
      const root = fixture(); const payload = await queryDocumentation(root, 'docs', { profile: { provider: 'ollama', model: 'nomic', baseUrl: remote.url } }); assert.equal(payload.provider, 'ollama');
      process.env.TEST_EMBEDDING_KEY = 'environment-secret';
      const unauthorized = await createEmbedder({ provider: 'openai-compatible', model: 'm', baseUrl: `${remote.url}/bad`, apiKeyEnv: 'TEST_EMBEDDING_KEY' });
      await assert.rejects(() => unauthorized(['text']), /authentication failure/);
      const malformed = await createEmbedder({ provider: 'openai-compatible', model: 'm', baseUrl: remote.url });
      await assert.rejects(() => malformed(['text']), /malformed JSON/);
    } finally { delete process.env.TEST_EMBEDDING_KEY; remote.instance.close(); }
  });
});
