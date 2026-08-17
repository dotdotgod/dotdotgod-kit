import { createHash } from 'node:crypto';

export const PROVENANCE_VERSION = 1;
export const CHUNKER_VERSION = 1;

const TRUST_BY_SOURCE_TYPE = Object.freeze({
  'project-file': 'project-maintained',
  'command-output': 'tool-output',
  'fetched-url': 'external-untrusted',
  inline: 'unknown',
  unknown: 'unknown',
});

const EXTRACTORS = new Set(['plain', 'markdown-v1', 'json-v1']);
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

function asMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sourceType(value) {
  return Object.hasOwn(TRUST_BY_SOURCE_TYPE, value) ? value : 'unknown';
}

function hashInput(value) {
  if (value instanceof Uint8Array) return value;
  return String(value ?? '');
}

export function sha256Content(value) {
  return createHash('sha256').update(hashInput(value)).digest('hex');
}

/**
 * Add operation-owned provenance to caller metadata.
 *
 * Security fields are assigned after caller metadata, so callers cannot use
 * metadata to promote trust or spoof the recorded origin and content hash.
 */
export function createProvenanceMetadata(metadata, operation = {}) {
  const type = sourceType(operation.sourceType);
  const extractor = EXTRACTORS.has(operation.extractor) ? operation.extractor : 'plain';
  const indexedAt = operation.indexedAt instanceof Date
    ? operation.indexedAt.toISOString()
    : typeof operation.indexedAt === 'string'
      ? new Date(operation.indexedAt).toISOString()
      : new Date().toISOString();

  return {
    ...asMetadata(metadata),
    provenanceVersion: PROVENANCE_VERSION,
    sourceType: type,
    trust: TRUST_BY_SOURCE_TYPE[type],
    origin: String(operation.origin ?? ''),
    contentHash: sha256Content(operation.content),
    indexedAt,
    extractor,
    chunkerVersion: CHUNKER_VERSION,
  };
}

/** Return a non-mutating, safe view of persisted or legacy source metadata. */
export function readProvenanceMetadata(metadata) {
  const stored = asMetadata(metadata);
  const type = sourceType(stored.sourceType);
  const expectedTrust = TRUST_BY_SOURCE_TYPE[type];
  const currentVersion = stored.provenanceVersion === PROVENANCE_VERSION;

  return {
    ...stored,
    provenanceVersion: currentVersion ? PROVENANCE_VERSION : 0,
    sourceType: currentVersion ? type : 'unknown',
    trust: currentVersion && stored.trust === expectedTrust ? expectedTrust : 'unknown',
    origin: currentVersion && typeof stored.origin === 'string' ? stored.origin : null,
    contentHash: currentVersion && typeof stored.contentHash === 'string' && HASH_PATTERN.test(stored.contentHash)
      ? stored.contentHash
      : null,
    indexedAt: currentVersion && typeof stored.indexedAt === 'string' && Number.isFinite(Date.parse(stored.indexedAt))
      ? stored.indexedAt
      : null,
    extractor: currentVersion && EXTRACTORS.has(stored.extractor) ? stored.extractor : 'plain',
    chunkerVersion: currentVersion && Number.isInteger(stored.chunkerVersion) && stored.chunkerVersion > 0
      ? stored.chunkerVersion
      : 0,
  };
}
