import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import test from 'node:test';
import { verifyManifestFile, walkDirectoryManifest } from '../src/directory-ingestion.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-directory-'));
  return { root, close() { rmSync(root, { recursive: true, force: true }); } };
}

function write(root, path, content = path) {
  const target = join(root, path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content);
  return target;
}

test('walkDirectoryManifest returns stable lexical relative paths without contents', () => {
  const f = fixture();
  try {
    write(f.root, 'z.txt', 'secret-z');
    write(f.root, 'a/b.txt', 'secret-b');
    write(f.root, 'a/a.txt', 'secret-a');
    const first = walkDirectoryManifest({ root: f.root });
    const second = walkDirectoryManifest({ root: f.root });
    assert.deepEqual(first.files.map((entry) => entry.path), ['a/a.txt', 'a/b.txt', 'z.txt']);
    assert.deepEqual(first.files.map((entry) => entry.path), second.files.map((entry) => entry.path));
    assert.equal(JSON.stringify(first).includes('secret-'), false);
  } finally { f.close(); }
});

test('walkDirectoryManifest rejects requested paths outside the real project root', () => {
  const f = fixture();
  const outside = fixture();
  try {
    assert.throws(() => walkDirectoryManifest({ root: f.root, path: '..' }), /escapes project root/);
    symlinkSync(outside.root, join(f.root, 'outside'));
    assert.throws(() => walkDirectoryManifest({ root: f.root, path: 'outside' }), /Directory symlinks are not followed/);
  } finally { f.close(); outside.close(); }
});

test('symlinks are skipped by default and optional file symlinks stay inside root', () => {
  const f = fixture();
  const outside = fixture();
  try {
    write(f.root, 'real.txt', 'ok');
    write(outside.root, 'external.txt', 'no');
    symlinkSync('real.txt', join(f.root, 'alias.txt'));
    symlinkSync('missing.txt', join(f.root, 'broken.txt'));
    symlinkSync(join(outside.root, 'external.txt'), join(f.root, 'external.txt'));
    mkdirSync(join(f.root, 'dir'));
    symlinkSync('dir', join(f.root, 'dir-link'));

    const defaults = walkDirectoryManifest({ root: f.root });
    assert.deepEqual(defaults.files.map((entry) => entry.path), ['real.txt']);
    assert.deepEqual(Object.fromEntries(defaults.skipped.map((entry) => [entry.path, entry.reason])), {
      'alias.txt': 'file-symlink',
      'broken.txt': 'symlink-unresolvable',
      'dir-link': 'directory-symlink',
      'external.txt': 'symlink-outside-root',
    });

    const followed = walkDirectoryManifest({ root: f.root, followFileSymlinks: true });
    assert.deepEqual(followed.files.map((entry) => entry.path), ['alias.txt', 'real.txt']);
    assert.equal(followed.files[0].symlink, true);
  } finally { f.close(); outside.close(); }
});

test('depth, visited entry, file count, file bytes, and aggregate bytes are bounded', () => {
  const f = fixture();
  try {
    write(f.root, 'a.txt', 'aa');
    write(f.root, 'b.txt', 'bbb');
    write(f.root, 'deep/c.txt', 'c');
    const depth = walkDirectoryManifest({ root: f.root, maxDepth: 0 });
    assert.equal(depth.skipped.find((entry) => entry.path === 'deep').reason, 'depth-limit');

    const bytes = walkDirectoryManifest({ root: f.root, maxFileBytes: 2, maxAggregateBytes: 2, maxFiles: 1 });
    assert.deepEqual(bytes.files.map((entry) => entry.path), ['a.txt']);
    assert.equal(bytes.skipped.find((entry) => entry.path === 'b.txt').reason, 'file-byte-limit');
    assert.equal(bytes.skipped.find((entry) => entry.path === 'deep/c.txt').reason, 'file-count-limit');

    const aggregate = walkDirectoryManifest({ root: f.root, maxAggregateBytes: 2 });
    assert.equal(aggregate.skipped.find((entry) => entry.path === 'b.txt').reason, 'aggregate-byte-limit');

    const visited = walkDirectoryManifest({ root: f.root, maxVisitedEntries: 1 });
    assert.equal(visited.visitedEntries, 1);
    assert.equal(visited.truncated, true);
    assert.equal(visited.skipped.at(-1).reason, 'visited-entry-limit');
  } finally { f.close(); }
});

test('extension and explicit path filters are deterministic and case-insensitive', () => {
  const f = fixture();
  try {
    write(f.root, 'A.MD');
    write(f.root, 'a.txt');
    write(f.root, 'vendor/keep.md');
    const result = walkDirectoryManifest({ root: f.root, includeExtensions: ['md'], excludePaths: ['vendor'] });
    assert.deepEqual(result.files.map((entry) => entry.path), ['A.MD']);
    assert.deepEqual(result.skipped, [
      { path: 'a.txt', reason: 'extension-filter' },
      { path: 'vendor', reason: 'excluded-path' },
    ]);
    assert.throws(() => walkDirectoryManifest({ root: f.root, excludePaths: ['../outside'] }), /Invalid excluded path/);
  } finally { f.close(); }
});

test('abort signal stops traversal and reports the bounded partial manifest', () => {
  const f = fixture();
  try {
    write(f.root, 'a.txt');
    write(f.root, 'b.txt');
    let reads = 0;
    const signal = { get aborted() { reads += 1; return reads > 2; } };
    const result = walkDirectoryManifest({ root: f.root, signal });
    assert.equal(result.aborted, true);
    assert.ok(result.visitedEntries <= 1);
  } finally { f.close(); }
});

test('verifyManifestFile detects replacement between manifest and indexing', () => {
  const f = fixture();
  try {
    const target = write(f.root, 'a.txt', 'before');
    const manifest = walkDirectoryManifest({ root: f.root });
    assert.equal(verifyManifestFile(manifest.files[0], f.root), realpathSync(target));
    writeFileSync(target, 'after replacement with another size');
    assert.throws(() => verifyManifestFile(manifest.files[0], f.root), /changed before indexing/);
  } finally { f.close(); }
});

test('special filesystem entries are skipped without reading them', { skip: process.platform === 'win32' }, async () => {
  const f = fixture();
  const socketPath = join(f.root, 'service.sock');
  const server = createServer();
  try {
    await new Promise((resolve, reject) => server.listen(socketPath, resolve).once('error', reject));
    const result = walkDirectoryManifest({ root: f.root });
    assert.deepEqual(result.files, []);
    assert.deepEqual(result.skipped, [{ path: 'service.sock', reason: 'special-file' }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    f.close();
  }
});

test('invalid limits fail before traversal', () => {
  const f = fixture();
  try {
    assert.throws(() => walkDirectoryManifest({ root: f.root, maxFiles: -1 }), /non-negative safe integer/);
    assert.throws(() => walkDirectoryManifest({ root: f.root, maxFileBytes: 1.5 }), /non-negative safe integer/);
  } finally { f.close(); }
});
