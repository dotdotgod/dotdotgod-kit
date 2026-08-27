import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { embeddingRuntimeRoot, embeddingRuntimeStatus, installEmbeddingRuntime, resolvePersistentTransformers } from '../src/query/embedding-runtime.mjs';

function fixture() { return mkdtempSync(join(tmpdir(), 'dotdotgod-embedding-runtime-')); }
function fakePackage(home) {
  const root = embeddingRuntimeRoot({ home });
  const pkg = join(root, 'node_modules', '@huggingface', 'transformers');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"private":true}\n');
  writeFileSync(join(pkg, 'package.json'), '{"name":"@huggingface/transformers","version":"4.2.0","exports":{".":"./index.js"},"type":"module"}\n');
  writeFileSync(join(pkg, 'index.js'), 'export const env = {}; export const pipeline = async () => {};\n');
}

test('published package manifests do not install the optional runtime implicitly', () => {
  for (const path of ['../package.json', '../../claude-code/package.json', '../../codex/package.json']) {
    const manifest = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
    assert.equal(manifest.dependencies?.['@huggingface/transformers'], undefined, `${manifest.name} must require explicit embedding installation`);
  }
});

test('persistent embedding runtime status and resolution are local', () => {
  const home = fixture();
  try {
    assert.equal(embeddingRuntimeStatus({ home }).installed, false);
    assert.throws(() => resolvePersistentTransformers({ home }), /not installed/);
    fakePackage(home);
    const status = embeddingRuntimeStatus({ home });
    assert.equal(status.installed, true);
    assert.equal(status.packageVersion, '4.2.0');
    assert.match(resolvePersistentTransformers({ home }), /transformers\/index\.js$/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('persistent embedding runtime status rejects an incomplete package', () => {
  const home = fixture();
  try {
    const root = embeddingRuntimeRoot({ home });
    const pkg = join(root, 'node_modules', '@huggingface', 'transformers');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"private":true}\n');
    writeFileSync(join(pkg, 'package.json'), '{"name":"@huggingface/transformers","version":"4.2.0","exports":{".":"./missing.js"},"type":"module"}\n');
    assert.equal(embeddingRuntimeStatus({ home }).installed, false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('embedding install requires confirmation and uses fixed no-shell arguments', () => {
  const home = fixture(); let called = false;
  try {
    assert.throws(() => installEmbeddingRuntime({ home }), /explicit confirmation/);
    installEmbeddingRuntime({ home, confirm: true, spawnImpl(command, args, options) {
      called = true; assert.equal(command, 'npm'); assert.equal(options.shell, false); assert.ok(args.includes('@huggingface/transformers@4.2.0')); fakePackage(home); return { status: 0 };
    }});
    assert.equal(called, true);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
