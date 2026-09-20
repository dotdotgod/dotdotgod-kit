import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVectorImpactOverlay } from '../impact/vector-overlay.mjs';
import { buildImpactReport } from '../impact/report.mjs';
import { canonicalizeChangedPath } from '../impact/vector-profile.mjs';
import { readFreshIndex } from '../index/cache.mjs';
import { buildImpactGraphPayload } from './payload.mjs';

const ASSET_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'assets');
const CONTENT_TYPES = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.map': 'application/json; charset=utf-8' };
const VENDOR_FILES = {
  '/vendor/sigma.js': new URL('../../node_modules/sigma/dist/sigma.min.js', import.meta.url),
  '/vendor/graphology.js': new URL('../../node_modules/graphology/dist/graphology.umd.min.js', import.meta.url),
  '/vendor/d3.js': new URL('../../node_modules/d3/dist/d3.min.js', import.meta.url),
};

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function asset(response, file) {
  try {
    const body = readFileSync(file);
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}

export async function buildServedImpact(root, changedPaths) {
  const normalized = [...new Set(changedPaths.map((path) => canonicalizeChangedPath(root, path)).filter(Boolean))];
  const { status, index, metadata } = readFreshIndex(root);
  const overlay = await buildVectorImpactOverlay(root, index, normalized);
  const impact = buildImpactReport(index, normalized, { overlay, verboseSemantic: false, related: 40 });
  const graph = buildImpactGraphPayload(index, impact);
  const graphIds = new Set(graph.nodes.map((node) => node.id));
  const explorerImpact = {
    ...impact,
    related: impact.related.filter((item) => graphIds.has(item.id)),
  };
  return { ok: status.ok, status, metadata, impact: explorerImpact, graph };
}

export async function startImpactGraphServer({ root, changed, host = '127.0.0.1', port = 0 }) {
  let payload = await buildServedImpact(root, changed);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`);
    if (url.pathname === '/api/impact') return json(response, 200, payload);
    if (url.pathname === '/api/reroot') {
      const paths = url.searchParams.getAll('changed');
      if (paths.length === 0) return json(response, 400, { ok: false, error: { code: 'MISSING_CHANGED', message: 'At least one changed path is required.' } });
      try {
        payload = await buildServedImpact(root, paths);
        return json(response, 200, payload);
      } catch (error) {
        return json(response, 500, { ok: false, error: { code: 'GRAPH_SERVE_FAILED', message: error instanceof Error ? error.message : String(error) } });
      }
    }
    if (VENDOR_FILES[url.pathname]) return asset(response, fileURLToPath(VENDOR_FILES[url.pathname]));
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!['index.html', 'app.css', 'app.js'].includes(relative)) {
      response.writeHead(404);
      return response.end('Not found');
    }
    return asset(response, join(ASSET_ROOT, relative));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return { server, url: `http://${host}:${actualPort}`, payload };
}
