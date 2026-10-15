import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { queryDocumentation, queryProject, buildVectorIndex } from '../src/commands/query.mjs';
import { embeddingProfileIdentity, resolveEmbeddingProfile, sanitizeEmbeddingProfile, validateEmbeddingProfile } from '../src/query/embedding-config.mjs';
import { createEmbedder, resolveEmbedder } from '../src/query/embedder.mjs';
import { readVectorCache, profileFingerprint, VECTOR_SCHEMA_VERSION } from '../src/query/store.mjs';

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
    assert.deepEqual(embeddingProfileIdentity({ provider: 'openai-compatible', model: 'm', apiKey: 'secret', apiKeyEnv: 'KEY' }), {
      provider: 'openai-compatible', model: 'm', inputFormatVersion: 1,
      inputFormat: { queryPrefix: 'query: ', documentPrefix: 'passage: ' },
    });
  });

  it('validates literal input formats without merging project and global profiles', () => {
    const profile = { provider: 'local', model: 'm' };
    for (const inputFormat of [null, [], {}, { queryPrefix: '' }, { queryPrefix: 1, documentPrefix: '' }, { queryPrefix: '', documentPrefix: '', extra: '' }]) {
      assert.throws(() => validateEmbeddingProfile({ ...profile, inputFormat }), /inputFormat/);
    }
    const inputFormat = { queryPrefix: '  Q:\n', documentPrefix: '' };
    assert.deepEqual(validateEmbeddingProfile({ ...profile, inputFormat }).inputFormat, inputFormat);
    const root = fixture(); const home = mkdtempSync(join(tmpdir(), 'dotdotgod-input-home-'));
    mkdirSync(join(home, '.dotdotgod'));
    writeFileSync(join(home, '.dotdotgod/config.json'), JSON.stringify({ embedding: { ...profile, inputFormat } }));
    assert.deepEqual(resolveEmbeddingProfile(root, { home }).profile.inputFormat, inputFormat);
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ embedding: profile }));
    assert.equal(resolveEmbeddingProfile(root, { home }).profile.inputFormat, undefined);
  });

  it('formats each role once for remote providers and injected local execution', async () => {
    const requests = [];
    const remote = await server(async (request, response) => {
      let body = ''; for await (const chunk of request) body += chunk;
      const { input } = JSON.parse(body); requests.push(input);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(request.url === '/api/embed'
        ? { embeddings: input.map(() => unitVector(0)) }
        : { data: input.map((_, index) => ({ index, embedding: unitVector(0) })) }));
    });
    try {
      for (const provider of ['openai-compatible', 'ollama', 'local']) {
        const profile = { provider, model: 'm', inputFormat: { queryPrefix: ' Q:\n', documentPrefix: ' D: ' } };
        const embed = provider === 'local'
          ? (await resolveEmbedder('.', { profile, embed: async (texts) => { requests.push(texts); return texts.map(() => unitVector(0)); } })).embed
          : await createEmbedder({ ...profile, baseUrl: remote.url });
        const start = requests.length;
        await embed(['query: original'], 'query'); await embed(['passage: original'], 'document'); await embed(['raw']);
        assert.deepEqual(requests.slice(start), [[' Q:\nquery: original'], [' D: passage: original'], ['raw']]);
        assert.throws(() => embed(['x'], 'invalid'), /role/);
      }
      const plain = await createEmbedder({ provider: 'ollama', model: 'm', baseUrl: remote.url, inputFormat: { queryPrefix: '', documentPrefix: '' } });
      await plain(['query: original'], 'query');
      assert.deepEqual(requests.at(-1), ['query: original']);
      await plain(['passage: original'], 'document');
      assert.deepEqual(requests.at(-1), ['passage: original']);
    } finally { remote.instance.close(); }
  });

  it('invalidates legacy and changed formats but reuses equivalent effective identities', async () => {
    const root = fixture(); let calls = 0;
    const profile = { provider: 'local', model: 'm' };
    const embed = async (texts) => { calls += texts.length; return texts.map(() => unitVector(0)); };
    const initial = await buildVectorIndex(root, { profile, embed });
    const equivalent = { model: 'm', inputFormat: { documentPrefix: 'passage: ', queryPrefix: 'query: ' }, provider: 'local' };
    assert.deepEqual(embeddingProfileIdentity(profile), embeddingProfileIdentity(equivalent));
    assert.equal((await buildVectorIndex(root, { profile: equivalent, embed })).manifest.embedded, 0);
    assert.equal(calls, initial.chunks.length);
    const manifestPath = join(root, '.dotdotgod/vectors/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath));
    manifest.profileFingerprint = profileFingerprint({ provider: 'local', model: 'm' });
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.equal((await buildVectorIndex(root, { profile, embed })).manifest.embedded, initial.chunks.length);
    const changed = { ...profile, inputFormat: { queryPrefix: 'Q: ', documentPrefix: 'passage: ' } };
    assert.equal((await buildVectorIndex(root, { profile: changed, embed })).manifest.embedded, initial.chunks.length);
    const changedDocument = { ...profile, inputFormat: { queryPrefix: 'Q: ', documentPrefix: 'D: ' } };
    assert.equal((await buildVectorIndex(root, { profile: changedDocument, embed })).manifest.embedded, initial.chunks.length);
  });

  it('formats docs, code, query and impact inputs through the same boundary', async () => {
    const root = fixture(); mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/widget.mjs'), '/** Widget lookup. */\nexport function widgetLookup() {}\n');
    const profile = { provider: 'local', model: 'm', inputFormat: { queryPrefix: 'Q|', documentPrefix: 'D|' } };
    const inputs = []; const embed = async (texts) => { inputs.push(...texts); return texts.map(() => unitVector(0)); };
    await queryDocumentation(root, 'docs', { profile, embed });
    assert(inputs.some((text) => text.startsWith('D|Path: docs/'))); assert(inputs.includes('Q|docs'));
    inputs.length = 0;
    await queryProject(root, 'widgetLookup', { profile, embed, search: 'vector' });
    assert(inputs.some((text) => text.startsWith('D|') && text.includes('widgetLookup'))); assert(inputs.includes('Q|widgetLookup'));
    const { buildVectorImpactOverlay } = await import('../src/impact/vector-overlay.mjs');
    const { buildIndex } = await import('../src/core.mjs');
    inputs.length = 0;
    const overlay = await buildVectorImpactOverlay(root, buildIndex(root), ['src/widget.mjs'], { profile, embed });
    assert.equal(overlay.status, 'available'); assert(inputs.some((text) => text.startsWith('Q|Path: src/widget.mjs')));
    await queryProject(root, 'widgetLookup', { search: 'keyword', profile, embed: async () => { throw new Error('must not embed'); } });
  });

  it('uses an OpenAI-compatible endpoint and rebuilds schema-1 caches', async () => {
    const requests = [];
    const remote = await server(async (request, response) => { let body = ''; for await (const chunk of request) body += chunk; const parsed = JSON.parse(body); requests.push({ authorization: request.headers.authorization, parsed }); response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ data: parsed.input.map((_, index) => ({ index, embedding: unitVector(index % 2) })) })); });
    try {
      const root = fixture();
      const profile = { provider: 'openai-compatible', model: 'remote-model', baseUrl: remote.url, apiKey: 'secret' };
      const payload = await queryDocumentation(root, 'retrieval', { profile, source: 'project', limit: 1 });
      assert.equal(payload.provider, 'openai-compatible'); assert.equal(payload.dimensions, 3); assert.equal(requests[0].authorization, 'Bearer secret');
      assert(requests[0].parsed.input.every((text) => text.startsWith('passage: ')));
      assert.deepEqual(requests.at(-1).parsed.input, ['query: retrieval']);
      assert.equal(readVectorCache(root, embeddingProfileIdentity(profile)).manifest.schemaVersion, VECTOR_SCHEMA_VERSION);
      const manifestPath = join(root, '.dotdotgod/vectors/manifest.json'); const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); manifest.schemaVersion = 1; writeFileSync(manifestPath, JSON.stringify(manifest));
      let calls = 0; await buildVectorIndex(root, { profile, embed: async (texts) => { calls += 1; return texts.map(() => unitVector(0)); } }); assert(calls > 0);
      assert(!readFileSync(manifestPath, 'utf8').includes('secret'));
    } finally { remote.instance.close(); }
  });

  it('halves token-limited batches in order without retrying other errors or single inputs', async () => {
    const sizes = []; const received = [];
    let failure = 'tokens';
    const remote = await server(async (request, response) => {
      let body = ''; for await (const chunk of request) body += chunk;
      const { input } = JSON.parse(body); sizes.push(input.length); received.push(...input);
      response.setHeader('content-type', 'application/json');
      if (failure !== 'tokens' || input.length > 2 || input[0] === 'oversized') {
        response.statusCode = failure === 'auth' ? 401 : 400;
        response.end(JSON.stringify({ error: { message: failure === 'tokens' ? 'Embedding input exceeds 4096 tokens in total, including special tokens' : 'invalid model secret' } }));
      } else response.end(JSON.stringify({ data: input.map((text, index) => ({ index, embedding: unitVector(Number(text.replace(/^D\|/, '')) % 3) })) }));
    });
    try {
      const embed = await createEmbedder({ provider: 'openai-compatible', model: 'm', baseUrl: remote.url });
      const texts = Array.from({ length: 16 }, (_, index) => String(index));
      assert.deepEqual(await embed(texts), texts.map((text) => unitVector(Number(text) % 3)));
      assert.deepEqual(sizes, [16, 8, 4, 2, 2, 4, 2, 2, 8, 4, 2, 2, 4, 2, 2]);
      const formatted = await createEmbedder({ provider: 'openai-compatible', model: 'm', baseUrl: remote.url, inputFormat: { queryPrefix: '', documentPrefix: 'D|' } });
      received.length = 0;
      assert.deepEqual(await formatted(texts, 'document'), texts.map((text) => unitVector(Number(text) % 3)));
      assert(received.every((text) => /^D\|\d+$/.test(text)), 'recursive retries never duplicate prefixes');
      sizes.length = 0;
      await assert.rejects(() => embed(['oversized']), /HTTP 400 failure/);
      assert.deepEqual(sizes, [1]);
      for (failure of ['auth', 'invalid']) {
        sizes.length = 0;
        await assert.rejects(() => embed(texts), failure === 'auth' ? /authentication failure/ : /HTTP 400 failure/);
        assert.deepEqual(sizes, [16]);
      }
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
