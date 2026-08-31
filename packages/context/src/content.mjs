import { readFileSync, statSync } from 'node:fs';
import { readManifestFile, walkDirectoryManifest } from './directory-ingestion.mjs';
import { normalizeHtml } from './html-normalize.mjs';
import { resolveExistingWithinRoot } from './paths.mjs';
import { safeFetch } from './safe-fetch.mjs';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FETCH_BYTES = 10 * 1024 * 1024;

function indexRegularFile(store, input, sessionId, path, stat, label = input.source ?? path, bytes) {
  const maxBytes = Math.min(input.maxBytes ?? MAX_FILE_BYTES, MAX_FILE_BYTES);
  if (stat.size > maxBytes) throw new Error(`File exceeds maximum size: ${stat.size} bytes`);
  const content = bytes ?? readFileSync(path);
  if (content.length > maxBytes) throw new Error(`File exceeds maximum size: ${content.length} bytes`);
  return store.index({
    scope: input.scope ?? 'session',
    sessionId,
    label,
    kind: 'file',
    text: content.toString('utf8'),
    metadata: { path, size: stat.size },
    ttlMs: input.ttlMs ?? null,
  });
}

function indexDirectory(store, input, sessionId, signal) {
  const manifest = walkDirectoryManifest({
    root: input.root || process.cwd(),
    path: input.path,
    includeExtensions: input.includeExtensions,
    excludePaths: input.excludePaths,
    followFileSymlinks: input.followFileSymlinks,
    maxDepth: input.maxDepth,
    maxVisitedEntries: input.maxVisitedEntries,
    maxFiles: input.maxFiles,
    maxFileBytes: Math.min(input.maxBytes ?? MAX_FILE_BYTES, MAX_FILE_BYTES),
    maxAggregateBytes: input.maxAggregateBytes,
    signal,
  });
  const indexed = [];
  const failed = [...manifest.failed];
  const aggregateLimit = input.maxAggregateBytes ?? 100 * 1024 * 1024;
  let indexedBytes = 0;
  for (const entry of manifest.files) {
    if (signal?.aborted) break;
    try {
      const remaining = aggregateLimit - indexedBytes;
      if (remaining < 0) throw new Error('Directory aggregate byte limit exceeded.');
      const bytes = readManifestFile(entry, manifest.root, Math.min(input.maxBytes ?? MAX_FILE_BYTES, MAX_FILE_BYTES, remaining));
      const label = input.source ? `${input.source}/${entry.path}` : entry.absolutePath;
      indexed.push({ path: entry.path, ...indexRegularFile(store, input, sessionId, entry.absolutePath, entry, label, bytes) });
      indexedBytes += bytes.length;
    } catch (error) {
      failed.push({ path: entry.path, reason: 'index-failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    directory: manifest.directory,
    indexed,
    skipped: manifest.skipped,
    failed,
    aborted: manifest.aborted || signal?.aborted === true,
    truncated: manifest.truncated,
    visitedEntries: manifest.visitedEntries,
    aggregateBytes: indexedBytes,
  };
}

export function indexFile(store, input, sessionId, signal) {
  const path = resolveExistingWithinRoot(input.root || process.cwd(), input.path);
  const stat = statSync(path);
  if (stat.isDirectory()) return indexDirectory(store, input, sessionId, signal);
  if (!stat.isFile()) throw new Error('Only regular files and directories are supported.');
  return indexRegularFile(store, input, sessionId, path, stat);
}

export async function fetchAndIndex(store, input, sessionId, signal, capabilities = {}) {
  const maxBytes = Math.min(input.maxBytes ?? MAX_FETCH_BYTES, MAX_FETCH_BYTES);
  let fetched;
  if (input.browser === true) {
    if (typeof capabilities.renderer !== 'function') throw new Error('Browser rendering capability is unavailable; strict fetch remains the default.');
    const url = new URL(input.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) browser rendering is supported.');
    const timeoutMs = Math.min(input.timeoutMs ?? 10_000, 120_000);
    const controller = new AbortController();
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const abort = () => { const reason = signal?.reason instanceof Error ? signal.reason : new Error('Browser rendering aborted.'); controller.abort(reason); rejectAbort(reason); };
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(new Error('Browser rendering timed out.')); reject(new Error(`Browser rendering timed out after ${timeoutMs}ms.`)); }, timeoutMs); });
    let rendered;
    try { rendered = await Promise.race([capabilities.renderer({ url: url.href, signal: controller.signal, timeoutMs, maxBytes }), timeout, aborted]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    if (!rendered || typeof rendered !== 'object' || Array.isArray(rendered)) throw new Error('Browser renderer returned an invalid result.');
    if (rendered.body !== undefined && !Buffer.isBuffer(rendered.body)) throw new Error('Browser renderer body must be a Buffer.');
    if (rendered.text !== undefined && typeof rendered.text !== 'string') throw new Error('Browser renderer text must be a string.');
    if (rendered.body === undefined && rendered.text === undefined) throw new Error('Browser renderer must return body or text.');
    const body = rendered.body ?? Buffer.from(rendered.text, 'utf8');
    if (body.length > maxBytes) throw new Error(`Rendered content exceeds maximum size: ${body.length} bytes`);
    const finalUrl = String(rendered.url ?? url.href);
    if (finalUrl.length > 4096 || !['http:', 'https:'].includes(new URL(finalUrl).protocol)) throw new Error('Browser renderer returned an invalid final URL.');
    const contentType = String(rendered.contentType ?? 'text/html; charset=utf-8');
    if (contentType.length > 512 || /[\r\n]/u.test(contentType)) throw new Error('Browser renderer returned invalid content type metadata.');
    const status = rendered.status ?? 200;
    if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error('Browser renderer returned an invalid HTTP status.');
    fetched = { body, text: body.toString('utf8'), url: finalUrl, originalUrl: url.href, redirects: [], contentType, contentEncoding: 'identity', status, bytes: body.length, wireLength: body.length };
  } else fetched = await safeFetch(input.url, {
    signal,
    timeoutMs: input.timeoutMs,
    maxBytes,
    maxWireBytes: maxBytes,
  });
  const isHtml = /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/iu.test(fetched.contentType);
  const normalized = isHtml ? normalizeHtml(fetched.body, {
    contentType: fetched.contentType,
    maxInputBytes: maxBytes,
    maxOutputBytes: maxBytes,
  }) : null;
  const text = normalized?.text ?? fetched.text;
  return store.index({
    scope: input.scope ?? 'project',
    sessionId,
    label: input.source ?? normalized?.title ?? fetched.url,
    kind: 'url',
    text,
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
      ...(normalized ? {
        htmlTitle: normalized.title,
        htmlInputBytes: normalized.inputBytes,
        htmlOutputBytes: normalized.outputBytes,
        htmlTruncated: normalized.truncated,
        htmlFallbackReason: normalized.fallbackReason,
      } : {}),
      acquisitionMode: input.browser === true ? 'browser-renderer' : 'strict-fetch',
    },
    provenance: {
      sourceType: 'fetched-url',
      origin: fetched.url,
      contentType: normalized ? 'text/markdown' : fetched.contentType,
      extractor: normalized?.extractor,
    },
    ttlMs: input.ttlMs ?? 24 * 60 * 60 * 1000,
  });
}
