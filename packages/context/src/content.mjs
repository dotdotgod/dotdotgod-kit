import { readFileSync, statSync } from 'node:fs';
import { resolveExistingWithinRoot } from './paths.mjs';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FETCH_BYTES = 10 * 1024 * 1024;

export function indexFile(store, input, sessionId) {
  const path = resolveExistingWithinRoot(input.root || process.cwd(), input.path);
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error('Only regular files are supported in the first release.');
  if (stat.size > (input.maxBytes ?? MAX_FILE_BYTES)) throw new Error(`File exceeds maximum size: ${stat.size} bytes`);
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

export async function fetchAndIndex(store, input, sessionId) {
  const url = new URL(input.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https URLs are supported.');
  const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(input.timeoutMs ?? 30_000, 120_000)) });
  if (!response.ok) throw new Error(`Fetch failed: HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > (input.maxBytes ?? MAX_FETCH_BYTES)) throw new Error(`Response exceeds maximum size: ${length} bytes`);
  const text = await response.text();
  if (Buffer.byteLength(text) > (input.maxBytes ?? MAX_FETCH_BYTES)) throw new Error('Response exceeds maximum size after download.');
  const contentType = response.headers.get('content-type') || 'text/plain';
  return store.index({
    scope: input.scope ?? 'project',
    sessionId,
    label: input.source ?? url.href,
    kind: 'url',
    text,
    metadata: { url: url.href, contentType, status: response.status },
    ttlMs: input.ttlMs ?? 24 * 60 * 60 * 1000,
  });
}
