import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ContextStore } from '../src/store.mjs';
import { executeCommand } from '../src/execute.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-search-recovery-'));
  const store = new ContextStore(root);
  return { root, store, close() { store.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('failure recovery finds FAIL in the middle of retained nonzero stderr', async () => {
  const f = fixture();
  try {
    const run = await executeCommand({
      executable: process.execPath,
      args: ['-e', "process.stderr.write('padding\\n'.repeat(10000) + 'FAIL quota exceeded\\n' + 'padding\\n'.repeat(10000)); process.exitCode = 7;"],
      outputMode: 'auto', directLimit: 100,
    }, { root: f.root, store: f.store, sessionId: 'recovery' });
    assert.equal(run.ok, false);
    assert.equal(run.code, 7);
    assert.ok(run.indexed.id);
    const results = f.store.search({ query: 'fail OR error OR reason', source: run.indexed.id, sessionId: 'recovery', limit: 2 });
    assert.ok(results.some((row) => row.text.includes('FAIL quota exceeded')));
    assert.ok(results.every((row) => row.sourceId === run.indexed.id));
    assert.ok(f.store.search({ query: '*', source: run.indexed.id, sessionId: 'recovery', limit: 2 }).length > 0);
  } finally { f.close(); }
});

test('wildcard browsing is bounded, stable, filtered, and retains provenance', () => {
  const f = fixture();
  try {
    f.store.index({ id: 'target', scope: 'session', sessionId: 'ours', label: 'target-log', kind: 'command', text: 'a'.repeat(900000) });
    f.store.index({ id: 'foreign', scope: 'session', sessionId: 'theirs', label: 'foreign-log', text: 'secret' });
    f.store.index({ id: 'project', scope: 'project', label: 'project-log', text: 'project' });
    f.store.index({ id: 'expired', scope: 'session', sessionId: 'ours', label: 'expired-log', text: 'gone', ttlMs: 0 });
    const args = { query: ' * ', source: 'target', scope: 'session', sessionId: 'ours', limit: 2 };
    const results = f.store.search(args);
    assert.equal(results.length, 2);
    assert.deepEqual(results.map((row) => row.ordinal), [0, 1]);
    assert.deepEqual(f.store.search(args), results);
    for (const row of results) {
      assert.equal(row.sourceId, 'target');
      assert.equal(row.instructionAuthority, 'none');
      assert.equal(row.trust, 'tool-output');
      assert.ok(row.text.length <= 1202);
      assert.ok(row.contentHash);
    }
    assert.equal(f.store.search({ ...args, sessionId: 'theirs' }).length, 0);
    assert.equal(f.store.search({ ...args, scope: 'project' }).length, 0);
    assert.equal(f.store.search({ query: '*', source: 'absent' }).length, 0);
    assert.ok(f.store.search({ query: '*', scope: 'session', sessionId: 'ours' }).every((row) => row.sourceId === 'target'));
    assert.equal(f.store.search({ query: '*', source: 'target', limit: 1000 }).length, 50);
    assert.throws(() => f.store.search({ query: '!!!' }), /searchable term/);
    assert.throws(() => f.store.search({ query: '**' }), /searchable term/);
  } finally { f.close(); }
});
