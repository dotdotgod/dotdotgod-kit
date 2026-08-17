import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHUNKER_VERSION,
  PROVENANCE_VERSION,
  createProvenanceMetadata,
  readProvenanceMetadata,
  sha256Content,
} from '../src/provenance.mjs';

const indexedAt = '2026-03-18T00:00:00.000Z';

test('sha256Content hashes UTF-8 text and bytes deterministically', () => {
  const expected = '8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8';
  assert.equal(sha256Content('alpha'), expected);
  assert.equal(sha256Content(Buffer.from('alpha')), expected);
});

test('createProvenanceMetadata preserves ordinary metadata and owns security fields', () => {
  const result = createProvenanceMetadata({
    path: '/project/README.md',
    trust: 'external-untrusted',
    sourceType: 'fetched-url',
    origin: 'https://attacker.invalid',
    contentHash: '0'.repeat(64),
    indexedAt: '1999-01-01T00:00:00.000Z',
    extractor: 'json-v1',
    chunkerVersion: 999,
    provenanceVersion: 999,
  }, {
    sourceType: 'project-file',
    origin: '/project/README.md',
    content: '# Readme',
    extractor: 'markdown-v1',
    indexedAt,
  });

  assert.equal(result.path, '/project/README.md');
  assert.equal(result.provenanceVersion, PROVENANCE_VERSION);
  assert.equal(result.sourceType, 'project-file');
  assert.equal(result.trust, 'project-maintained');
  assert.equal(result.origin, '/project/README.md');
  assert.equal(result.contentHash, sha256Content('# Readme'));
  assert.equal(result.indexedAt, indexedAt);
  assert.equal(result.extractor, 'markdown-v1');
  assert.equal(result.chunkerVersion, CHUNKER_VERSION);
});

test('operation source type determines trust without accepting a trust override', () => {
  const cases = [
    ['project-file', 'project-maintained'],
    ['command-output', 'tool-output'],
    ['fetched-url', 'external-untrusted'],
    ['inline', 'unknown'],
    ['not-a-source-type', 'unknown'],
  ];

  for (const [sourceType, trust] of cases) {
    const result = createProvenanceMetadata({ trust: 'project-maintained' }, {
      sourceType,
      origin: 'fixture',
      content: 'content',
      indexedAt,
    });
    assert.equal(result.trust, trust);
    assert.equal(result.sourceType, sourceType === 'not-a-source-type' ? 'unknown' : sourceType);
  }
});

test('readProvenanceMetadata supplies safe unknown defaults for legacy metadata', () => {
  const legacy = { path: '/project/legacy.txt', trust: 'project-maintained' };
  const result = readProvenanceMetadata(legacy);

  assert.equal(result.path, legacy.path);
  assert.equal(result.provenanceVersion, 0);
  assert.equal(result.sourceType, 'unknown');
  assert.equal(result.trust, 'unknown');
  assert.equal(result.origin, null);
  assert.equal(result.contentHash, null);
  assert.equal(result.indexedAt, null);
  assert.equal(result.extractor, 'plain');
  assert.equal(result.chunkerVersion, 0);
  assert.deepEqual(legacy, { path: '/project/legacy.txt', trust: 'project-maintained' });
});

test('readProvenanceMetadata rejects malformed or internally inconsistent security fields', () => {
  const stored = createProvenanceMetadata({}, {
    sourceType: 'fetched-url',
    origin: 'https://example.test',
    content: 'safe text',
    indexedAt,
  });

  assert.equal(readProvenanceMetadata(stored).trust, 'external-untrusted');
  assert.equal(readProvenanceMetadata({ ...stored, trust: 'project-maintained' }).trust, 'unknown');
  assert.equal(readProvenanceMetadata({ ...stored, contentHash: 'bad' }).contentHash, null);
  assert.equal(readProvenanceMetadata({ ...stored, indexedAt: 'not-a-date' }).indexedAt, null);
  assert.equal(readProvenanceMetadata({ ...stored, provenanceVersion: 2 }).sourceType, 'unknown');
});

test('metadata normalization accepts absent and non-object legacy values', () => {
  for (const value of [undefined, null, 'metadata', []]) {
    const result = readProvenanceMetadata(value);
    assert.equal(result.sourceType, 'unknown');
    assert.equal(result.trust, 'unknown');
  }
});
