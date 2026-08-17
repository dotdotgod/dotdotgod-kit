import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { chunkText } from '../src/chunks.mjs';
import { executeBatch, executeCommand, executeFile } from '../src/execute.mjs';
import { ContextStore } from '../src/store.mjs';
import { projectImpact, projectInitialize, projectLoad } from '../src/project.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-context-test-'));
  const store = new ContextStore(root);
  return { root, store, close() { store.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('chunkText bounds chunks and preserves overlap', () => {
  const chunks = chunkText('a'.repeat(9000), { maxChars: 4000, overlap: 400 });
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 4000));
  assert.equal(chunks[1].start, 3600);
});

test('ContextStore indexes, searches, scopes, and purges', () => {
  const f = fixture();
  try {
    f.store.index({ id: 'one', scope: 'session', sessionId: 's1', label: 'build', text: 'fatal ECONNRESET while connecting' });
    f.store.index({ id: 'two', scope: 'project', label: 'docs', text: 'successful authentication callback' });
    assert.equal(f.store.search({ query: 'ECONNRESET', sessionId: 's1' }).length, 1);
    assert.equal(f.store.search({ query: 'authentication callback', scope: 'project' })[0].sourceId, 'two');
    assert.equal(f.store.search({ query: 'fatal: ECONNRESET', sessionId: 's1' }).length, 1);
    assert.equal(f.store.purge({ sourceId: 'one' }).removed, 1);
    assert.equal(f.store.stats().sources, 1);
  } finally { f.close(); }
});

test('executeCommand returns small output directly and indexes large output', async () => {
  const f = fixture();
  try {
    const small = await executeCommand({ executable: process.execPath, args: ['-e', "console.log('ok')"], shell: false }, { root: f.root, store: f.store, sessionId: 's1' });
    assert.equal(small.ok, true);
    assert.match(small.stdout, /ok/);
    const large = await executeCommand({ executable: process.execPath, args: ['-e', "console.log('needle '+ 'x'.repeat(20000))"], shell: false, directLimit: 100 }, { root: f.root, store: f.store, sessionId: 's1' });
    assert.equal(large.ok, true);
    assert.ok(large.indexed.id);
    assert.equal(f.store.search({ query: 'needle', sessionId: 's1' }).length, 1);
  } finally { f.close(); }
});

test('executeCommand stops capture at the internal hard ceiling', async () => {
  const f = fixture();
  try {
    const result = await executeCommand(
      { executable: process.execPath, args: ['-e', "process.stdout.write('x'.repeat(3000)); process.stderr.write('y'.repeat(3000))"], shell: false },
      { root: f.root, captureLimitBytes: 4096 },
    );
    assert.equal(result.ok, false);
    assert.equal(result.captureLimitExceeded, true);
    assert.equal(result.captureLimitBytes, 4096);
    assert.ok(result.stdoutBytes > 0);
    assert.ok(result.stderrBytes > 0);
    assert.ok(result.stdoutBytes + result.stderrBytes <= result.captureLimitBytes);
  } finally { f.close(); }
});

test('executeCommand enforces project paths and timeout', async () => {
  const f = fixture();
  try {
    await assert.rejects(() => executeCommand({ executable: process.execPath, args: ['-e', '0'], cwd: '..' }, { root: f.root }), /escapes project root/);
    const timed = await executeCommand({ executable: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 20 }, { root: f.root });
    assert.equal(timed.ok, false);
    assert.equal(timed.timedOut, true);
  } finally { f.close(); }
});

test('executeBatch preserves input order under concurrency', async () => {
  const result = await executeBatch({ concurrency: 2, commands: [
    { executable: process.execPath, args: ['-e', "setTimeout(()=>console.log('first'),40)"], shell: false },
    { executable: process.execPath, args: ['-e', "console.log('second')"], shell: false },
  ]});
  assert.match(result.results[0].stdout, /first/);
  assert.match(result.results[1].stdout, /second/);
});

test('executeFile keeps file bytes inside the child process', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-context-file-test-'));
  try {
    const path = join(root, 'input.txt');
    writeFileSync(path, 'alpha\nbeta\n');
    const result = await executeFile({ path, language: 'javascript', code: "console.log(FILE_CONTENT.split('\\n').filter(Boolean).length)" }, { root });
    assert.equal(result.ok, true);
    assert.match(result.stdout, /2/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('project workflows preserve bounded load, impact, and dry-run initialization contracts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-project-tools-test-'));
  try {
    const load = await projectLoad({ root });
    assert.equal(load.ok, true);
    assert.deepEqual(load.documentationTree, []);
    await assert.rejects(() => projectImpact({ root, paths: [] }), /at least one/);
    await assert.rejects(() => projectImpact({ root, paths: Array.from({ length: 21 }, (_, i) => `f${i}`) }), /limited to 20/);
    const initialized = await projectInitialize({ root });
    assert.equal(initialized.ok, true);
    assert.equal(initialized.dryRun, true);
    await assert.rejects(() => projectInitialize({ root, dryRun: false }), /confirmWrite/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('ContextStore rejects an incompatible existing schema without migration', () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-context-schema-test-'));
  const dir = join(root, '.dotdotgod', 'context');
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'context.sqlite'));
  db.exec('CREATE TABLE sources (id TEXT PRIMARY KEY); CREATE VIRTUAL TABLE chunks USING fts5(body);');
  db.close();
  try { assert.throws(() => new ContextStore(root), /Incompatible context database schema/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test('purge requires exactly one selector', () => {
  const f = fixture();
  try { assert.throws(() => f.store.purge({}), /exactly one/); }
  finally { f.close(); }
});
