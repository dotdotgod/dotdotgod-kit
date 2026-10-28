import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportTraceability } from './traceability.mjs';
import nodeStyle from './node-style.cjs';

const ASSET_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'assets');
const CONTENT_TYPES = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8', '.map': 'application/json; charset=utf-8' };
const VENDOR_FILES = {
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

export async function startImpactGraphServer({ root, changed, host = '127.0.0.1', port = 0 }) {
  root = resolve(root);
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Graph UI is local-only; use a loopback host.');
  const build = async () => {
    const data = await exportTraceability(root);
    const paths = [...new Set(data.edges.flatMap(e => [e.source, e.target]))];
    return { ...data, projectRoot: undefined, nodes: paths.map(path => ({ id: path, ...nodeStyle.describeNode(path, data.config.documentation.root) })) };
  };
  let payload = await build();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`);
    if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { error: 'Method not allowed' });
    if (url.pathname === '/api/graph') {
      try {
        payload = await build();
        return json(response, 200, payload);
      } catch (error) {
        return json(response, 500, { ok: false, error: { code: 'GRAPH_SERVE_FAILED', message: error instanceof Error ? error.message : String(error) } });
      }
    }
    if (VENDOR_FILES[url.pathname]) return asset(response, fileURLToPath(VENDOR_FILES[url.pathname]));
    if (url.pathname === '/policy.js') return asset(response, join(ASSET_ROOT, '../policy.cjs'));
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!['index.html', 'app.css', 'app.js', 'file-list.js', 'graph-client.js', 'layout.js'].includes(relative)) {
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
  return { server, url: `http://${host.includes(':') ? `[${host}]` : host}:${actualPort}`, payload };
}
