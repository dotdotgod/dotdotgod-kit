import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
    assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version), [1, 2, 3]); db.close();
  } finally { store.destroy(); }
});

test('explicit healing checkpoints WAL, creates a readable backup, and removes stale sidecars', () => {
  const root = fixture(); const store = new ContextStore(root); const path = store.path;
  store.index({ id: 'wal-source', scope: 'project', label: 'wal', text: 'checkpointed content' });
  store.close();
  const result = healContextDatabase(root);
  assert.equal(result.ok, true); assert.equal(result.rebuilt, true); assert.ok(readFileSync(result.backupPath).length > 0);
  const backup = new DatabaseSync(result.backupPath, { readOnly: true });
  assert.equal(backup.prepare("SELECT count(*) AS count FROM sources WHERE id = 'wal-source'").get().count, 1); backup.close();
  assert.equal(existsSync(`${path}-wal`), false); assert.equal(existsSync(`${path}-shm`), false);
  const reopened = new ContextStore(root); assert.equal(reopened.stats().sources, 1); reopened.destroy(); rmSync(result.backupPath, { force: true });
});

test('failed healing leaves no partial rebuilt artifact', () => {
  const root = fixture(); const directory = join(root, '.dotdotgod', 'context'); mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'context.sqlite')); db.exec('CREATE TABLE unrelated(value TEXT)'); db.close();
  assert.throws(() => healContextDatabase(root), /not a recognized recoverable/);
  assert.deepEqual(readdirSync(directory).filter((name) => name.includes('.healed-')), []);
  rmSync(root, { recursive: true, force: true });
});

test('trigram lane samples old and new rows rather than excluding old relevant content', () => {
  const root = fixture(); const store = new ContextStore(root);
  try {
    store.index({ id: 'old', scope: 'project', label: 'old', text: 'persistant historical marker' });
    for (let index = 0; index < 220; index += 1) store.index({ id: `new-${index}`, scope: 'project', label: `new-${index}`, text: `unrelated recent value ${index}` });
    assert.equal(store.search({ query: 'persistent', scope: 'project', limit: 1 })[0]?.sourceId, 'old');
  } finally { store.destroy(); }
});

test('durable worker persists enqueue-time session identity and completes ingestion', async () => {
  const root = fixture(); writeFileSync(join(root, 'note.txt'), 'durable background content'); const store = new ContextStore(root);
  try {
    const runner = new IngestionJobRunner(store, { sessionId: 'resume-1' });
    const job = runner.enqueue('index', { root, path: 'note.txt' });
    runner.sessionId = 'resume-2';
    for (let attempt = 0; attempt < 50 && !['completed', 'failed'].includes(runner.status(job.id).state); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(runner.status(job.id).state, 'completed'); assert.equal(runner.status(job.id).sessionId, 'resume-1');
    assert.equal(store.search({ query: 'durable', sessionId: 'resume-1' }).length, 1);
    assert.equal(store.search({ query: 'durable', sessionId: 'resume-2' }).length, 0);
  } finally { store.destroy(); }
});

test('queue capacity check and insertion are one transaction', () => {
  const root = fixture(); const store = new ContextStore(root);
  try {
    for (let index = 0; index < 100; index += 1) store.createJob({ id: crypto.randomUUID(), kind: 'index', input: { path: `${index}` } });
    assert.throws(() => store.createJob({ kind: 'index', input: { path: 'overflow' } }), /queue is full/);
    assert.equal(store.listPendingJobs(100).length, 100);
  } finally { store.destroy(); }
});

test('allowlist environment mode is opt-in and reports names only', () => {
  const result = composeEnvironment({ inherited: { PATH: '/bin', SECRET: 'hidden' }, overrides: { PATH: '/usr/bin' }, mode: 'allowlist-v1', allow: ['PATH'] });
  assert.deepEqual(result.env, { PATH: '/usr/bin' }); assert.deepEqual(result.policy.allowedNames, ['PATH']); assert.ok(!JSON.stringify(result.policy).includes('hidden'));
  assert.throws(() => composeEnvironment({ inherited: {}, overrides: { SECRET: 'x' }, mode: 'allowlist-v1', allow: ['PATH'] }), /not in the explicit allowlist/);
});

test('session IDs are explicit opaque validated values', () => {
  assert.equal(validateSessionId('resume_2026-01~retry'), 'resume_2026-01~retry');
  assert.throws(() => validateSessionId('resume:2026'), /sessionId/);
  assert.throws(() => validateSessionId('../bad'), /sessionId/);
});

test('browser renderer is absent by default and injected capability stays bounded and untrusted', async () => {
  const root = fixture(); const store = new ContextStore(root);
  try {
    await assert.rejects(fetchAndIndex(store, { url: 'https://example.test', browser: true }, 's'), /unavailable/);
    const result = await fetchAndIndex(store, { url: 'https://example.test', browser: true, maxBytes: 1024 }, 's', undefined, { renderer: async () => ({ text: '<title>T</title><p>Rendered</p>' }) });
    const row = store.search({ query: 'Rendered' })[0]; assert.equal(row.trust, 'external-untrusted'); assert.equal(result.bytes > 0, true);
    await assert.rejects(fetchAndIndex(store, { url: 'https://example.test', browser: true, timeoutMs: 10 }, 's', undefined, { renderer: () => new Promise(() => {}) }), /timed out/);
    await assert.rejects(fetchAndIndex(store, { url: 'https://example.test', browser: true }, 's', undefined, { renderer: async () => ({ text: 'x', status: 999 }) }), /invalid HTTP status/);
  } finally { store.destroy(); }
});
