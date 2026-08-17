import assert from 'node:assert/strict';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { isBlockedAddress, safeFetch, validateUrl } from '../src/safe-fetch.mjs';

async function fixture(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    url: `http://fixture.test:${port}`,
    resolve: async () => [{ address: '127.0.0.1', family: 4 }],
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

const localPolicy = (f, extra = {}) => ({ allowPrivateNetwork: true, resolve: f.resolve, ...extra });

test('address and URL policy rejects private, mapped, reserved, credentials, and protocols', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '192.168.1.1', '224.0.0.1', '::', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1']) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  assert.equal(isBlockedAddress('8.8.8.8'), false);
  assert.equal(isBlockedAddress('2606:4700:4700::1111'), false);
  assert.throws(() => validateUrl('file:///tmp/data'), /Only http and https/);
  assert.throws(() => validateUrl('https://user:secret@example.com'), /credentials/);
});

test('private destinations are denied unless an explicit policy override is provided', async () => {
  const f = await fixture((_request, response) => response.end('ok'));
  try {
    await assert.rejects(() => safeFetch(f.url, { resolve: f.resolve }), /disallowed network/);
    const result = await safeFetch(f.url, localPolicy(f));
    assert.equal(result.text, 'ok');
    assert.equal(result.status, 200);
    assert.equal(result.redirects, 0);
  } finally { await f.close(); }
});

test('all DNS answers are validated before a connection is attempted', async () => {
  await assert.rejects(() => safeFetch('http://mixed.test', {
    resolve: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }],
    timeoutMs: 100,
  }), /disallowed network/);
});

test('redirects are resolved and revalidated per hop', async () => {
  const f = await fixture((request, response) => {
    if (request.url === '/start') { response.writeHead(302, { location: '/final' }); response.end(); return; }
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end('{"ok":true}');
  });
  try {
    const result = await safeFetch(`${f.url}/start`, localPolicy(f));
    assert.equal(result.redirects, 1);
    assert.equal(result.url, `${f.url}/final`);
    assert.equal(result.text, '{"ok":true}');
  } finally { await f.close(); }
});

test('redirect limits fail closed', async () => {
  const f = await fixture((_request, response) => { response.writeHead(302, { location: '/again' }); response.end(); });
  try {
    await assert.rejects(() => safeFetch(f.url, localPolicy(f, { maxRedirects: 1 })), /Too many redirects/);
  } finally { await f.close(); }
});

test('wire and decompressed byte limits are independently enforced', async () => {
  const compressed = gzipSync('x'.repeat(10_000));
  const f = await fixture((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip', 'content-length': compressed.length });
    response.end(compressed);
  });
  try {
    await assert.rejects(() => safeFetch(f.url, localPolicy(f, { maxWireBytes: 10, maxBytes: 20_000 })), /wire size limit/);
    await assert.rejects(() => safeFetch(f.url, localPolicy(f, { maxWireBytes: compressed.length + 10, maxBytes: 100 })), /decoded size limit/);
    const result = await safeFetch(f.url, localPolicy(f, { maxWireBytes: compressed.length + 10, maxBytes: 20_000 }));
    assert.equal(result.bytes, 10_000);
    assert.equal(result.text.length, 10_000);
  } finally { await f.close(); }
});

test('unsupported MIME types and encodings are rejected', async (t) => {
  await t.test('MIME', async () => {
    const f = await fixture((_request, response) => { response.setHeader('content-type', 'application/octet-stream'); response.end('binary'); });
    try { await assert.rejects(() => safeFetch(f.url, localPolicy(f)), /Unsupported content type/); }
    finally { await f.close(); }
  });
  await t.test('encoding', async () => {
    const f = await fixture((_request, response) => { response.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'compress' }); response.end('data'); });
    try { await assert.rejects(() => safeFetch(f.url, localPolicy(f)), /Unsupported content encoding/); }
    finally { await f.close(); }
  });
});

test('timeout and caller abort terminate acquisition', async (t) => {
  await t.test('timeout', async () => {
    const f = await fixture(() => {});
    try { await assert.rejects(() => safeFetch(f.url, localPolicy(f, { timeoutMs: 20 })), /timed out/); }
    finally { await f.close(); }
  });
  await t.test('abort', async () => {
    const f = await fixture(() => {});
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('caller stopped')), 10);
    try { await assert.rejects(() => safeFetch(f.url, localPolicy(f, { signal: controller.signal })), /caller stopped/); }
    finally { await f.close(); }
  });
});
