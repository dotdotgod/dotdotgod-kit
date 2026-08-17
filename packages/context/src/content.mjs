import { readFileSync, statSync } from 'node:fs';
import { resolveExistingWithinRoot } from './paths.mjs';
import { safeFetch } from './safe-fetch.mjs';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FETCH_BYTES = 10 * 1024 * 1024;

export function indexFile(store, input, sessionId) {
  const path = resolveExistingWithinRoot(input.root || process.cwd(), input.path);
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error('Only regular files are supported in the first release.');
  const maxBytes = Math.min(input.maxBytes ?? MAX_FILE_BYTES, MAX_FILE_BYTES);
  if (stat.size > maxBytes) throw new Error(`File exceeds maximum size: ${stat.size} bytes`);
  return store.index({
    scope: input.scope ?? 'session',
    sessionId,
    label: input.source ?? path,
    kind: 'file',
    text: readFileSync(path, 'utf8'),
    metadata: { path, size: stat.size },
    ttlMs: input.ttlMs ?? null,
  });
}

export async function fetchAndIndex(store, input, sessionId, signal) {
  const maxBytes = Math.min(input.maxBytes ?? MAX_FETCH_BYTES, MAX_FETCH_BYTES);
  const fetched = await safeFetch(input.url, {
    signal,
    timeoutMs: input.timeoutMs,
    maxBytes,
    maxWireBytes: maxBytes,
  });
  return store.index({
    scope: input.scope ?? 'project',
    sessionId,
    label: input.source ?? fetched.url,
    kind: 'url',
    text: fetched.text,
    metadata: {
      url: fetched.url,
      originalUrl: fetched.originalUrl,
      finalUrl: fetched.url,
      redirects: fetched.redirects,
      contentType: fetched.contentType,
      contentEncoding: fetched.contentEncoding,
      status: fetched.status,
      bytes: fetched.bytes,
      wireLength: fetched.wireLength,
    },
    provenance: { sourceType: 'fetched-url', origin: fetched.url, contentType: fetched.contentType },
    ttlMs: input.ttlMs ?? 24 * 60 * 60 * 1000,
  });
}
