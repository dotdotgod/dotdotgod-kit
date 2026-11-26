import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildDecisionDocsMap } from '../src/memory/documentation-map.mjs';
import { hasHelpToken } from '../src/cli/usage.mjs';
import { queryProject } from '../src/commands/query.mjs';
import { CACHE_VERSION } from '../src/primitives.mjs';
import { expandReferences } from '../src/reference/resolve.mjs';
import { buildOutlines } from '../src/symbols/store.mjs';

const bin = fileURLToPath(new URL('../bin/dotdotgod.mjs', import.meta.url));
const configPath = 'dotdotgod.config.json';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-decision-readonly-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content) => {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const run = (command, ...args) => spawnSync(process.execPath, [bin, command, root, ...args], {
    env: { ...process.env, HOME: join(root, 'isolated-home'), USERPROFILE: join(root, 'isolated-home') },
    encoding: 'utf8', timeout: 3000,
  });
  return { root, write, run, config: (data) => write(configPath, JSON.stringify(data)) };
}

function snapshot(root) {
  return readdirSync(root, { recursive: true }).sort().map((path) => {
    const fullPath = join(root, path);
    const stat = lstatSync(fullPath);
    return [path, stat.mtimeMs, stat.ino, stat.isFile() ? readFileSync(fullPath, 'base64') : null];
  });
}

test('end-of-options preserves literal help and flag-like prompt operands', (t) => {
  const { run, write } = fixture(t);
  write('docs/README.md', '# Grounded help\n\nsearch with impact');
  assert.equal(hasHelpToken(['help', '--', '-h']), true);
  for (const token of ['help', '--help', '-h', '--search', '--with-impact']) {
    assert.equal(hasHelpToken(['--', token]), false);
    const query = run('query', '--json', '--no-write', '--', token);
    assert.equal(query.status, 0, query.stderr);
    assert.equal(JSON.parse(query.stdout).query, token);
    const expand = run('expand', '--json', '--no-write', '--scope', 'shared', '--', token);
    assert.equal(expand.status, 0, expand.stderr);
    assert.equal(JSON.parse(expand.stdout).prompt, token);
  }
  assert.match(run('query', '--help').stdout, /Usage:/);
});

test('decision map and read-only query refuse symlinks at the docs root or a parent', async (t) => {
  const external = fixture(t);
  external.write('docs/ESCAPED.md', '# Escaped\n\nsensitive');
  for (const parent of [false, true]) {
    const { root, config, run } = fixture(t);
    config({ documentation: { root: parent ? 'parent/docs' : 'docs' } });
    symlinkSync(parent ? external.root : join(external.root, 'docs'), join(root, parent ? 'parent' : 'docs'));
    const map = buildDecisionDocsMap(root);
    assert.equal(map.ok, false);
    assert.doesNotMatch(JSON.stringify(map), /ESCAPED/);
    await assert.rejects(queryProject(root, 'sensitive', { readOnly: true, search: 'keyword' }), /documentation root/i);
    assert.equal(run('query', '--json', '--no-write', '--', 'sensitive').status, 1);
  }
});

test('decision map ignores configured load exclusions but hard-excludes private paths and limits depth', (t) => {
  const { root, write, config } = fixture(t);
  config({
    documentation: { root: 'guide/docs' },
    memory: { areas: [{ id: 'private', scope: 'local', freshness: 'fresh', paths: ['guide/docs/INTERNAL.md'] }] },
    load: { documentationSummary: { exclude: [] } },
  });
  for (const path of [
    'README.md', 'spec/PUBLIC.md', 'spec/deep/TOO_DEEP.md', 'plan/PLAN.md', 'archive/README.md',
    'INTERNAL.md', '.hidden/HIDDEN.md', '.HIDDEN.md', 'node_modules/PACKAGE.md', 'build/OUT.md', 'secret.md', 'credentials/KEY.md',
  ]) write(`guide/docs/${path}`, 'not in the map');
  symlinkSync('README.md', join(root, 'guide/docs/SYMLINK.md'));
  const map = buildDecisionDocsMap(root);
  assert.equal(map.ok, true);
  assert.equal(map.depth, 2);
  assert.deepEqual(map.paths, ['guide/docs/README.md', 'guide/docs/spec/PUBLIC.md']);
  assert.doesNotMatch(map.tree, /not in the map/);
});

test('decision map caps both path count and UTF-8 output size', (t) => {
  const first = fixture(t);
  for (let i = 0; i < 105; i++) first.write(`docs/P${i}.md`, '# Doc');
  assert.equal(buildDecisionDocsMap(first.root).paths.length, 100);
  const second = fixture(t);
  for (let i = 0; i < 50; i++) second.write(`docs/spec/${'한'.repeat(65)}-${i}.md`, '# Doc');
  const map = buildDecisionDocsMap(second.root);
  assert.ok(map.paths.length > 0 && map.paths.length < 50);
  assert.ok(Buffer.byteLength(map.paths.join('\n')) <= 4096);
  assert.ok(Buffer.byteLength(map.tree) <= 4096);
});

test('read-only query stays keyword-only, filters shared docs and outlines, and changes no cache paths', async (t) => {
  const { root, write, config, run } = fixture(t);
  config({
    memory: { areas: [{ id: 'private', scope: 'local', freshness: 'fresh', paths: ['docs/PRIVATE.md', 'private.mjs'] }] },
    load: { documentationSummary: { exclude: [] } },
    embedding: { provider: 'openai-compatible', model: 'not-used', baseUrl: 'http://127.0.0.1:1' },
  });
  write('docs/PUBLIC.md', '# Public\n\nneedle');
  for (const path of ['docs/PRIVATE.md', 'docs/plan/PLAN.md', 'docs/archive/README.md', 'docs/secret.md']) write(path, '# Private\n\nneedle');
  write('shared.mjs', 'export function needlePublic() {}');
  write('private.mjs', 'export function needlePrivate() {}');
  const cold = snapshot(root);
  const embed = () => assert.fail('read-only query invoked embeddings');
  const options = { readOnly: true, search: 'keyword', scope: 'shared', embed };
  const coldResult = await queryProject(root, 'needle', options);
  assert.deepEqual(coldResult.results.map(({ path }) => path), ['docs/PUBLIC.md']);
  assert.equal(coldResult.outlines, null);
  assert.deepEqual(snapshot(root), cold);
  await buildOutlines(root);
  write('.dotdotgod/vectors/manifest.json', 'untouched-vector-sentinel');
  write('.dotdotgod/manifest.json', 'untouched-graph-sentinel');
  write('shared.mjs', 'export function notCached() {}');
  const warm = snapshot(root);
  const result = await queryProject(root, 'needle', options);
  assert.deepEqual(new Set(result.results.map(({ path }) => path)), new Set(['docs/PUBLIC.md', 'shared.mjs']));
  assert.equal(result.embeddingSource, 'not-used');
  assert.deepEqual(result.warnings, []);
  const cli = run('query', '--json', '--no-write', '--scope', 'shared', '--', 'needle');
  assert.equal(cli.status, 0, cli.stderr);
  const payload = JSON.parse(cli.stdout);
  assert.equal(payload.search, 'keyword');
  assert.equal(payload.embeddingSource, 'not-used');
  assert.deepEqual(payload.warnings, []);
  assert.deepEqual(snapshot(root), warm);
});

test('read-only expansion on cold or mismatched caches succeeds empty, never refreshes or runs impact', (t) => {
  const { root, write, run } = fixture(t);
  write('docs/PUBLIC.md', '# Public');
  const options = { readOnly: true, scope: 'shared' };
  const args = ['--json', '--no-write', '--scope', 'shared'];
  const cold = snapshot(root);
  const result = run('expand', ...args, '--', '[[PUBLIC]]');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).refs, []);
  assert.equal(JSON.parse(result.stdout).ok, true);
  assert.deepEqual(snapshot(root), cold);
  assert.throws(() => expandReferences(root, '[[PUBLIC]]', { ...options, withImpact: true }), /--with-impact/);
  const impact = run('expand', ...args, '--with-impact', '--', '[[PUBLIC]]');
  assert.equal(impact.status, 2);
  assert.match(impact.stderr, /--with-impact.*--no-write/);
  for (const schemaVersion of [undefined, CACHE_VERSION]) {
    write('.dotdotgod/manifest.json', JSON.stringify({
      version: CACHE_VERSION - 1, schemaVersion,
      graph: { nodes: [{ id: 'file:docs/PUBLIC.md', type: 'file', path: 'docs/PUBLIC.md' }], edges: [] },
    }));
    const stale = snapshot(root);
    assert.deepEqual(expandReferences(root, '[[PUBLIC]]', options).refs, []);
    assert.deepEqual(snapshot(root), stale);
  }
});

test('shared expansion filters explicit and fuzzy candidates before ranking and keeps the cache unchanged', (t) => {
  const { root, write, config } = fixture(t);
  config({
    memory: { areas: [{ id: 'private', scope: 'local', freshness: 'fresh', paths: ['docs/private/**'] }] },
    load: { documentationSummary: { exclude: [] } },
  });
  const paths = ['docs/PUBLIC_DOC.md', 'docs/private/PUBLIC_DOC.md', 'docs/private/PRIVATE_DOC.md', 'docs/plan/PRIVATE_PLAN.md', 'docs/archive/PRIVATE_ARCHIVE.md', 'docs/credentials.md'];
  const nodes = paths.map((path) => ({ id: `file:${path}`, type: 'file', path }));
  write('.dotdotgod/manifest.json', JSON.stringify({ version: CACHE_VERSION, graph: { nodes, edges: [] } }));
  const before = snapshot(root);
  const options = { readOnly: true, scope: 'shared', includeArchive: true, fuzzy: true, maxResults: 1 };
  const prompt = '[[PUBLIC_DOC]] [[PRIVATE_PLAN]] [[docs/credentials.md]] PRIVATE_DOC PRIVATE_ARCHIVE';
  const result = expandReferences(root, prompt, options);
  assert.equal(result.ok, true);
  assert.deepEqual(result.refs.map((ref) => ref.top.path), ['docs/PUBLIC_DOC.md']);
  const fuzzy = expandReferences(root, 'PUBLIC_DOC PRIVATE_DOC', options);
  assert.deepEqual([...new Set(fuzzy.refs.map((ref) => ref.top.path))], ['docs/PUBLIC_DOC.md']);
  assert.deepEqual(snapshot(root), before);
});

test('shared impact cannot restore links to filtered local paths', (t) => {
  const { root, write, config } = fixture(t);
  config({ memory: { areas: [{ id: 'private', scope: 'local', freshness: 'fresh', paths: ['docs/private/**'] }] } });
  write('docs/PUBLIC.md', '# Public\n\n[local](private/HIDDEN.md)\n[related](RELATED.md)');
  write('docs/private/HIDDEN.md', '# Hidden');
  write('docs/RELATED.md', '# Related');
  const result = expandReferences(root, '[[PUBLIC]]', { scope: 'shared', withImpact: true });
  assert.equal(result.ok, true);
  assert.ok(result.refs[0].impact.related.some(({ path }) => path === 'docs/RELATED.md'));
  assert.doesNotMatch(JSON.stringify(result.refs[0].impact), /private\/HIDDEN/);
});
