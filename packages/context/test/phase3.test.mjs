import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { composeEnvironment, ContextStore, fetchAndIndex, healContextDatabase, IngestionJobRunner, validateSessionId } from '../src/index.mjs';

function fixture() { return mkdtempSync(join(tmpdir(), 'ddg-phase3-')); }

test('bounded trigram retrieval tolerates a typo and preserves scope SQL filtering', () => {
  const root = fixture(); const store = new ContextStore(root);
  try {
    store.index({ id: 'wanted', scope: 'project', label: 'architecture', text: 'transactional migration ledger' });
    store.index({ id: 'other', scope: 'session', label: 'architecture', text: 'transactional migration ledger' });
    const rows = store.search({ query: 'transactonal', scope: 'project' });
    assert.equal(rows[0].sourceId, 'wanted'); assert.ok(rows.every((row) => row.scope === 'project'));
  } finally { store.destroy(); }
});

test('schema migration ledger is versioned and restart recovery requeues running jobs', () => {
  const root = fixture(); let store = new ContextStore(root);
  const job = store.createJob({ kind: 'index', input: { path: 'x' } });
  assert.equal(store.claimNextJob().id, job.id); store.close();
  store = new ContextStore(root);
  try {
    assert.equal(store.getJob(job.id).state, 'queued');
    assert.throws(() => store.createJob({ kind: 'index', input: { value: 'x'.repeat(70 * 1024) } }), /64 KiB/);
    const db = new DatabaseSync(store.path, { readOnly: true });
    assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version), [1, 2]); db.close();
  } finally { store.destroy(); }
});

test('explicit healing creates a backup for recognized schemas', () => {
  const root = fixture(); const store = new ContextStore(root); const path = store.path; store.close();
  const result = healContextDatabase(root);
  assert.equal(result.ok, true); assert.equal(result.rebuilt, true); assert.ok(readFileSync(result.backupPath).length > 0);
  const reopened = new ContextStore(root); assert.equal(reopened.stats().sources, 0); reopened.destroy();
});

test('durable worker completes bounded file ingestion and exposes status', async () => {
  const root = fixture(); writeFileSync(join(root, 'note.txt'), 'durable background content'); const store = new ContextStore(root);
  try {
    const runner = new IngestionJobRunner(store, { sessionId: 'resume-1' });
    const job = runner.enqueue('index', { root, path: 'note.txt' });
    for (let attempt = 0; attempt < 50 && !['completed', 'failed'].includes(runner.status(job.id).state); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(runner.status(job.id).state, 'completed');
  } finally { store.destroy(); }
});

test('allowlist environment mode is opt-in and reports names only', () => {
  const result = composeEnvironment({ inherited: { PATH: '/bin', SECRET: 'hidden' }, overrides: { PATH: '/usr/bin' }, mode: 'allowlist-v1', allow: ['PATH'] });
  assert.deepEqual(result.env, { PATH: '/usr/bin' }); assert.deepEqual(result.policy.allowedNames, ['PATH']); assert.ok(!JSON.stringify(result.policy).includes('hidden'));
  assert.throws(() => composeEnvironment({ inherited: {}, overrides: { SECRET: 'x' }, mode: 'allowlist-v1', allow: ['PATH'] }), /not in the explicit allowlist/);
});

test('session IDs are explicit opaque validated values', () => {
  assert.equal(validateSessionId('resume_2026-01'), 'resume_2026-01'); assert.throws(() => validateSessionId('../bad'), /sessionId/);
});

test('browser renderer is absent by default and injected capability stays bounded and untrusted', async () => {
  const root = fixture(); const store = new ContextStore(root);
  try {
    await assert.rejects(fetchAndIndex(store, { url: 'https://example.test', browser: true }, 's'), /unavailable/);
    const result = await fetchAndIndex(store, { url: 'https://example.test', browser: true, maxBytes: 1024 }, 's', undefined, { renderer: async () => ({ text: '<title>T</title><p>Rendered</p>' }) });
    const row = store.search({ query: 'Rendered' })[0]; assert.equal(row.trust, 'external-untrusted'); assert.equal(result.bytes > 0, true);
  } finally { store.destroy(); }
});
