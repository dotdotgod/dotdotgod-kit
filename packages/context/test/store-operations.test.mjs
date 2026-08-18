import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { runDoctor } from '../src/doctor.mjs';
import { ContextStore, contextDbPath } from '../src/store.mjs';

function rootFixture(prefix = 'dotdotgod-store-operations-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function removeRoot(root) {
  rmSync(root, { recursive: true, force: true });
}

function openExisting(root, options = {}) {
  return new DatabaseSync(contextDbPath(root), options);
}

function indexSentinel(store, overrides = {}) {
  return store.index({
    id: 'sentinel-source',
    scope: 'project',
    label: 'private-label',
    text: 'PRIVATE_INDEXED_TEXT should never appear in statistics',
    metadata: { secret: 'PRIVATE_METADATA_VALUE' },
    ...overrides,
  });
}

function countRows(db, table, sourceId = 'sentinel-source') {
  return Number(db.prepare(`SELECT count(*) AS count FROM ${table} WHERE ${table === 'sources' ? 'id' : 'source_id'} = ?`).get(sourceId).count);
}

test('ContextStore reopens an existing WAL database without rewriting indexed content', () => {
  const root = rootFixture();
  try {
    const first = new ContextStore(root);
    indexSentinel(first);
    const before = first.db.prepare('SELECT id, scope, session_id, label, kind, metadata, created_at, expires_at FROM sources ORDER BY id').all();
    assert.equal(String(first.db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(), 'wal');
    first.close();

    const second = new ContextStore(root);
    try {
      assert.equal(second.search({ query: 'PRIVATE_INDEXED_TEXT', scope: 'project' })[0].sourceId, 'sentinel-source');
      assert.equal(second.stats().sources, 1);
      assert.deepEqual(second.db.prepare('SELECT id, scope, session_id, label, kind, metadata, created_at, expires_at FROM sources ORDER BY id').all(), before);
    } finally {
      second.close();
    }
  } finally {
    removeRoot(root);
  }
});

test('ContextStore configures WAL and an explicit bounded busy timeout on every writable connection', () => {
  const root = rootFixture();
  try {
    const first = new ContextStore(root);
    const second = new ContextStore(root);
    try {
      for (const store of [first, second]) {
        assert.equal(String(store.db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(), 'wal');
        const timeout = Number(store.db.prepare('PRAGMA busy_timeout').get().timeout);
        assert.ok(timeout > 0 && timeout <= 5000, `expected a bounded non-zero busy timeout, received ${timeout}`);
      }
    } finally {
      second.close();
      first.close();
    }
  } finally {
    removeRoot(root);
  }
});

test('WAL permits a concurrent reader and a competing writer succeeds after lock release', () => {
  const root = rootFixture();
  try {
    const writer = new ContextStore(root);
    const peer = new ContextStore(root);
    try {
      indexSentinel(writer);
      writer.db.exec('BEGIN IMMEDIATE');
      try {
        assert.equal(peer.stats().sources, 1);
        assert.throws(
          () => peer.index({ id: 'blocked', scope: 'project', label: 'blocked', text: 'blocked writer' }),
          /busy|locked/i,
        );
      } finally {
        writer.db.exec('ROLLBACK');
      }
      assert.equal(peer.index({ id: 'after-lock', scope: 'project', label: 'after', text: 'writer succeeds' }).id, 'after-lock');
    } finally {
      peer.close();
      writer.close();
    }
  } finally {
    removeRoot(root);
  }
});

test('source replacement is atomic when a write fails', () => {
  const root = rootFixture();
  const store = new ContextStore(root);
  try {
    indexSentinel(store, { text: 'original searchable body' });
    store.db.exec(`
      CREATE TRIGGER fail_source_write
      BEFORE INSERT ON sources
      WHEN new.id = 'sentinel-source'
      BEGIN
        SELECT RAISE(ABORT, 'injected source failure');
      END;
    `);
    assert.throws(() => indexSentinel(store, { text: 'replacement body' }), /injected source failure/);
    store.db.exec('DROP TRIGGER fail_source_write');
    assert.equal(store.search({ query: 'original searchable', source: 'sentinel-source' }).length, 1);
    assert.equal(store.search({ query: 'replacement', source: 'sentinel-source' }).length, 0);
    assert.equal(countRows(store.db, 'sources'), 1);
    assert.ok(countRows(store.db, 'chunks') > 0);
  } finally {
    store.close();
    removeRoot(root);
  }
});

test('purge is atomic when source deletion fails after chunk deletion', () => {
  const root = rootFixture();
  const store = new ContextStore(root);
  try {
    indexSentinel(store, { text: 'atomic purge searchable body' });
    store.db.exec(`
      CREATE TRIGGER fail_source_delete
      BEFORE DELETE ON sources
      WHEN old.id = 'sentinel-source'
      BEGIN
        SELECT RAISE(ABORT, 'injected source delete failure');
      END;
    `);
    assert.throws(() => store.purge({ sourceId: 'sentinel-source' }), /injected source delete failure/);
    store.db.exec('DROP TRIGGER fail_source_delete');
    assert.equal(countRows(store.db, 'sources'), 1);
    assert.ok(countRows(store.db, 'chunks') > 0);
    assert.equal(store.search({ query: 'atomic purge', source: 'sentinel-source' }).length, 1);
  } finally {
    store.close();
    removeRoot(root);
  }
});

test('expiry is atomic when deleting one expired source fails', () => {
  const root = rootFixture();
  const store = new ContextStore(root);
  try {
    indexSentinel(store, { text: 'atomic expiry searchable body', ttlMs: 0 });
    store.db.exec(`
      CREATE TRIGGER fail_expired_source_delete
      BEFORE DELETE ON sources
      WHEN old.id = 'sentinel-source'
      BEGIN
        SELECT RAISE(ABORT, 'injected expiry failure');
      END;
    `);
    assert.throws(() => store.expire(), /injected expiry failure/);
    store.db.exec('DROP TRIGGER fail_expired_source_delete');
    assert.equal(countRows(store.db, 'sources'), 1);
    assert.ok(countRows(store.db, 'chunks') > 0);
  } finally {
    store.close();
    removeRoot(root);
  }
});

test('an incomplete existing schema is rejected without creating missing tables', () => {
  const root = rootFixture();
  const path = contextDbPath(root);
  mkdirSync(join(root, '.dotdotgod', 'context'), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE sources (
    id TEXT PRIMARY KEY, scope TEXT NOT NULL, session_id TEXT, label TEXT NOT NULL,
    kind TEXT NOT NULL, metadata TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER
  );`);
  db.close();
  try {
    assert.throws(() => new ContextStore(root), /Incompatible context database schema/);
    const inspected = openExisting(root, { readOnly: true });
    try { assert.equal(inspected.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'chunks'").get().count, 0); }
    finally { inspected.close(); }
  } finally { removeRoot(root); }
});

test('incompatible schemas are rejected before mutation', () => {
  const root = rootFixture();
  const path = contextDbPath(root);
  mkdirSync(join(root, '.dotdotgod', 'context'), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE sources (id TEXT PRIMARY KEY); CREATE VIRTUAL TABLE chunks USING fts5(body);');
  const before = db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all();
  db.close();
  try {
    assert.throws(() => new ContextStore(root), /Incompatible context database schema/);
    const inspected = openExisting(root, { readOnly: true });
    try {
      assert.deepEqual(inspected.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all(), before);
    } finally {
      inspected.close();
    }
  } finally {
    removeRoot(root);
  }
});

test('doctor reports a corrupt database without repairing or rewriting it', () => {
  const root = rootFixture();
  const path = contextDbPath(root);
  mkdirSync(join(root, '.dotdotgod', 'context'), { recursive: true });
  const bytes = Buffer.from('not a sqlite database\nPRIVATE_CORRUPT_SENTINEL');
  writeFileSync(path, bytes);
  try {
    const result = runDoctor({ root, dbPath: path });
    assert.equal(result.ok, false);
    const schema = result.checks.find((entry) => entry.id === 'schema-compatibility');
    assert.equal(schema?.status, 'FAIL');
    assert.match(schema?.message ?? '', /could not be inspected/i);
    assert.deepEqual(readFileSync(path), bytes);
  } finally {
    removeRoot(root);
  }
});

test('store statistics remain measurable without exposing indexed or metadata content', () => {
  const root = rootFixture();
  const store = new ContextStore(root);
  try {
    indexSentinel(store);
    const stats = store.stats();
    assert.equal(stats.sources, 1);
    assert.ok(stats.chunks > 0);
    assert.deepEqual(stats.byScope.map((entry) => ({ ...entry })), [{ scope: 'project', count: 1 }]);
    const serialized = JSON.stringify(stats);
    for (const secret of ['PRIVATE_INDEXED_TEXT', 'PRIVATE_METADATA_VALUE', 'private-label']) {
      assert.equal(serialized.includes(secret), false, `statistics leaked ${secret}`);
    }
  } finally {
    store.close();
    removeRoot(root);
  }
});
