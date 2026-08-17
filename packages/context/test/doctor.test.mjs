import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { runDoctor } from '../src/doctor.mjs';
import { ContextStore } from '../src/store.mjs';

function temporaryRoot() {
  return mkdtempSync(join(tmpdir(), 'dotdotgod-doctor-test-'));
}

test('runDoctor reports local capabilities without creating project storage or using fetch', () => {
  const root = temporaryRoot();
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('doctor must not use the network');
  };
  try {
    const before = readdirSync(root);
    const result = runDoctor({ root });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'WARN');
    assert.equal(fetchCalled, false);
    assert.deepEqual(readdirSync(root), before);
    assert.equal(result.checks.find((entry) => entry.id === 'schema-compatibility').status, 'WARN');
    assert.equal(result.checks.find((entry) => entry.id === 'sqlite-fts5-porter').status, 'OK');
    assert.equal(result.checks.find((entry) => entry.id === 'fetch-policy').details.networkDuringDoctor, false);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(root, { recursive: true, force: true });
  }
});

test('runDoctor inspects an existing context schema read-only', () => {
  const root = temporaryRoot();
  const store = new ContextStore(root);
  store.index({ id: 'fixture', scope: 'project', label: 'fixture', text: 'doctor fixture' });
  const dbPath = store.path;
  store.close();
  try {
    const before = statSync(dbPath);
    const result = runDoctor({ root, dbPath, stats: { sources: 1, chunks: 1 } });
    const after = statSync(dbPath);
    assert.equal(result.ok, true);
    assert.equal(result.status, 'OK');
    assert.equal(result.checks.find((entry) => entry.id === 'schema-compatibility').status, 'OK');
    assert.equal(result.checks.find((entry) => entry.id === 'store-statistics').details.sources, 1);
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeMs, before.mtimeMs);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runDoctor fails an incompatible database without repairing it', () => {
  const root = temporaryRoot();
  const dbPath = join(root, 'incompatible.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)');
  db.close();
  try {
    const before = statSync(dbPath);
    const result = runDoctor({ root, dbPath });
    const after = statSync(dbPath);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'FAIL');
    assert.deepEqual(result.checks.find((entry) => entry.id === 'schema-compatibility').details.missing.sort(), ['chunks', 'sources']);
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeMs, before.mtimeMs);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
