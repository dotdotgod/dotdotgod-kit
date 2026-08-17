import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkContent, chunkJson, chunkMarkdown, chunkText } from '../src/chunks.mjs';

function assertByteBound(chunks, maxBytes) {
  assert.ok(chunks.length > 0);
  for (const chunk of chunks) {
    assert.ok(Buffer.byteLength(chunk.text) <= maxBytes, `${Buffer.byteLength(chunk.text)} exceeds ${maxBytes}`);
    assert.doesNotMatch(chunk.text, /\uFFFD/u);
  }
}

test('chunkText preserves legacy character bounds and overlap', () => {
  const chunks = chunkText('a'.repeat(9000), { maxChars: 4000, overlap: 400 });
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 4000));
  assert.equal(chunks[1].start, 3600);
});

test('chunkMarkdown records heading ancestry and keeps a bounded fence intact', () => {
  const markdown = '# Guide\n\nIntro.\n\n## Install\n\n```js\nconsole.log("ok");\n```\n';
  const chunks = chunkMarkdown(markdown, { maxBytes: 256 });
  assertByteBound(chunks, 256);
  const fence = chunks.find((chunk) => chunk.metadata.blockType === 'fence');
  assert.equal(fence.text, '```js\nconsole.log("ok");\n```\n');
  assert.deepEqual(fence.metadata.headings, ['Guide', 'Install']);
  assert.equal(fence.metadata.title, 'Guide > Install');
  assert.equal(fence.metadata.language, 'js');
  assert.deepEqual(chunks.map((chunk) => chunk.ordinal), chunks.map((_, index) => index));
});

test('chunkMarkdown splits oversized fences deterministically on Unicode boundaries', () => {
  const markdown = '# Data\n\n```txt\n' + '한글🙂'.repeat(80) + '\n```\n';
  const first = chunkMarkdown(markdown, { maxBytes: 80 });
  const second = chunkMarkdown(markdown, { maxBytes: 80 });
  assert.deepEqual(first, second);
  assertByteBound(first, 80);
  const continuations = first.filter((chunk) => chunk.metadata.blockType === 'fence');
  assert.ok(continuations.length > 1);
  assert.deepEqual(continuations.map((chunk) => chunk.metadata.continuation),
    Array.from({ length: continuations.length }, (_, index) => index + 1));
  assert.ok(continuations.every((chunk) => chunk.metadata.continuations === continuations.length));
});

test('chunkJson emits deterministic sorted key paths and hard byte bounds', () => {
  const value = JSON.stringify({ z: '끝'.repeat(80), users: [{ name: 'Ada', id: 1 }], empty: {} });
  const first = chunkJson(value, { maxBytes: 72 });
  const second = chunkJson(value, { maxBytes: 72 });
  assert.deepEqual(first, second);
  assertByteBound(first, 72);
  const paths = first.map((chunk) => chunk.metadata.path);
  assert.equal(paths[0], '$.empty');
  assert.ok(paths.includes('$.users[0].id'));
  assert.ok(paths.includes('$.users[0].name'));
  assert.ok(paths.includes('$.z'));
  assert.ok(first.filter((chunk) => chunk.metadata.path === '$.z').length > 1);
});

test('chunkJson falls back to bounded text for malformed input', () => {
  const chunks = chunkJson('{"broken": ' + '🙂'.repeat(80), { maxBytes: 68 });
  assertByteBound(chunks, 68);
  assert.ok(chunks.every((chunk) => chunk.metadata.extractor === 'json-fallback'));
  assert.ok(chunks.every((chunk) => chunk.metadata.format === 'text'));
});

test('chunkJson rejects structures beyond the nesting policy', () => {
  assert.throws(() => chunkJson('{"a":{"b":{"c":1}}}', { maxDepth: 2 }), /nesting exceeds/);
});

test('chunkContent dispatches MIME formats and bounds generic text by UTF-8 bytes', () => {
  assert.equal(chunkContent('# Title\n', { contentType: 'text/markdown' })[0].metadata.format, 'markdown');
  assert.equal(chunkContent('{"a":1}', { contentType: 'application/problem+json' })[0].metadata.format, 'json');
  const generic = chunkContent('🙂'.repeat(40), { maxBytes: 64 });
  assertByteBound(generic, 64);
  assert.ok(generic.every((chunk) => chunk.metadata.format === 'text'));
});
