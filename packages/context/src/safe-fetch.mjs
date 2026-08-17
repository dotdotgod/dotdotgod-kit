import { lookup as dnsLookup } from 'node:dns';
import { promisify } from 'node:util';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const lookup = promisify(dnsLookup);
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;

const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked4.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['100::', 64],
  ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blocked6.addSubnet(network, prefix, 'ipv6');

function normalizeAddress(address) {
  return String(address).split('%', 1)[0].toLowerCase();
}

export function isBlockedAddress(address) {
  const normalized = normalizeAddress(address);
  const family = isIP(normalized);
  if (!family) return true;
  return family === 4 ? blocked4.check(normalized, 'ipv4') : blocked6.check(normalized, 'ipv6');
}

export function validateUrl(value) {
  const url = value instanceof URL ? new URL(value.href) : new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https URLs are supported.');
  if (url.username || url.password) throw new Error('URL credentials are not allowed.');
  if (!url.hostname || /[\0\s]/u.test(url.hostname)) throw new Error('URL hostname is invalid.');
  return url;
}

async function resolveAddresses(hostname, resolver) {
  if (isIP(hostname)) return [{ address: normalizeAddress(hostname), family: isIP(hostname) }];
  const answers = await resolver(hostname);
  const normalized = (Array.isArray(answers) ? answers : [answers]).map((entry) => ({
    address: normalizeAddress(typeof entry === 'string' ? entry : entry.address),
    family: Number(typeof entry === 'string' ? isIP(entry) : entry.family || isIP(entry.address)),
  }));
  if (!normalized.length || normalized.some(({ address, family }) => !address || !family)) {
    throw new Error('DNS resolution returned no usable addresses.');
  }
  return normalized;
}

function decoderFor(value) {
  const encoding = String(value || 'identity').trim().toLowerCase();
  if (encoding === '' || encoding === 'identity') return null;
  if (encoding === 'gzip' || encoding === 'x-gzip') return createGunzip();
  if (encoding === 'deflate') return createInflate();
  if (encoding === 'br') return createBrotliDecompress();
  throw new Error(`Unsupported content encoding: ${encoding}`);
}

function acceptableMime(value) {
  const type = String(value || 'text/plain').split(';', 1)[0].trim().toLowerCase();
  return type.startsWith('text/') || /^(application\/(?:[a-z0-9.+-]+\+)?(?:json|xml)|application\/(?:javascript|x-javascript|x-www-form-urlencoded)|image\/svg\+xml)$/u.test(type);
}

function boundedCounter(limit, message) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > limit) return callback(new Error(message));
      callback(null, chunk);
    },
  });
}

function boundedSink(limit, message, chunks) {
  let bytes = 0;
  return new Writable({
    write(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > limit) return callback(new Error(message));
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
}

function requestOnce(url, addresses, options, signal) {
  const client = url.protocol === 'https:' ? https : http;
  const allowed = new Set(addresses.map(({ address }) => normalizeAddress(address)));
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; fn(value); } };
    const request = client.request(url, {
      method: 'GET',
      headers: { accept: 'text/plain, text/markdown, text/html, application/json, application/*+json;q=0.9, application/xml;q=0.8' },
      agent: false,
      lookup(_hostname, lookupOptions, callback) {
        const values = addresses.map((entry) => ({ address: entry.address, family: entry.family }));
        if (lookupOptions?.all) callback(null, values);
        else callback(null, selected.address, selected.family);
      },
    }, (response) => finish(resolve, { request, response, allowed }));
    request.once('socket', (socket) => {
      socket.once('connect', () => {
        const remote = normalizeAddress(socket.remoteAddress || '');
        if (!allowed.has(remote) || (!options.allowPrivateNetwork && isBlockedAddress(remote))) {
          request.destroy(new Error('Connected address is not allowed.'));
        }
      });
    });
    request.once('error', (error) => finish(reject, error));
    const abort = () => request.destroy(signal.reason instanceof Error ? signal.reason : new Error('Fetch aborted.'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    request.once('close', () => signal.removeEventListener('abort', abort));
    request.end();
  });
}

export async function safeFetch(value, options = {}) {
  const originalUrl = validateUrl(value);
  const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const maxWireBytes = Math.max(1, options.maxWireBytes ?? maxBytes);
  const maxRedirects = Math.max(0, options.maxRedirects ?? DEFAULT_REDIRECTS);
  const timeoutMs = Math.min(Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS), 120_000);
  const resolver = options.resolve ?? (async (hostname) => lookup(hostname, { all: true, verbatim: true }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Fetch timed out.')), timeoutMs);
  timer.unref?.();
  const externalAbort = () => controller.abort(options.signal.reason);
  if (options.signal?.aborted) externalAbort();
  else options.signal?.addEventListener('abort', externalAbort, { once: true });

  let current = originalUrl;
  let redirects = 0;
  try {
    while (true) {
      const addresses = await resolveAddresses(current.hostname, resolver);
      if (!options.allowPrivateNetwork && addresses.some(({ address }) => isBlockedAddress(address))) {
        throw new Error('URL resolves to a disallowed network address.');
      }
      const { request, response } = await requestOnce(current, addresses, options, controller.signal);
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.destroy();
        request.destroy();
        if (redirects >= maxRedirects) throw new Error('Too many redirects.');
        current = validateUrl(new URL(response.headers.location, current));
        redirects += 1;
        continue;
      }
      if (status < 200 || status >= 300) {
        response.destroy();
        throw new Error(`Fetch failed: HTTP ${status}`);
      }
      const contentType = String(response.headers['content-type'] || 'text/plain');
      if (!acceptableMime(contentType)) {
        response.destroy();
        throw new Error(`Unsupported content type: ${contentType}`);
      }
      const declared = Number(response.headers['content-length'] || 0);
      if (Number.isFinite(declared) && declared > maxWireBytes) {
        response.destroy();
        throw new Error(`Response exceeds wire size limit: ${declared} bytes`);
      }
      const decoder = decoderFor(response.headers['content-encoding']);
      const chunks = [];
      const wireCounter = boundedCounter(maxWireBytes, 'Response exceeds wire size limit.');
      const decodedCounter = boundedSink(maxBytes, 'Response exceeds decoded size limit.', chunks);
      if (decoder) await pipeline(response, wireCounter, decoder, decodedCounter);
      else await pipeline(response, wireCounter, decodedCounter);
      const body = Buffer.concat(chunks);
      return {
        originalUrl: originalUrl.href,
        url: current.href,
        redirects,
        status,
        contentType,
        contentEncoding: String(response.headers['content-encoding'] || 'identity'),
        wireLength: Number(response.headers['content-length'] || body.length),
        bytes: body.length,
        body,
        text: body.toString('utf8'),
      };
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', externalAbort);
  }
}
