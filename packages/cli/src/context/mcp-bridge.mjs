import { realpathSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { validateSessionId } from '../primitives.mjs';

function respond(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export async function runBridge(args) {
  if (args.length === 1 && args[0] === '--list-tools') {
    const { listServerTools } = await import('./server.mjs');
    respond(await listServerTools());
    return;
  }

  if (args.length !== 2) throw new Error('Expected mcp-bridge <root> <sessionId> or --list-tools.');
  const root = realpathSync(args[0]);
  if (!statSync(root).isDirectory()) throw new Error('MCP bridge root must be a directory.');
  const sessionId = validateSessionId(args[1]);
  const client = new Client({ name: 'dotdotgod-bridge', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url)), 'mcp'],
    cwd: root,
    env: { ...process.env, DOTDOTGOD_PROJECT_ROOT: root, DOTDOTGOD_SESSION_ID: sessionId },
  });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const lines = input[Symbol.asyncIterator]();
  let active = new AbortController();
  let stopping = false;
  const stop = () => {
    stopping = true;
    active?.abort();
    input.close();
  };
  process.on('SIGTERM', stop);
  try {
    await client.connect(transport, { signal: active.signal });
    active = undefined;
    for await (const line of lines) {
      if (stopping) break;
      try {
        const request = JSON.parse(line);
        active = new AbortController();
        const options = { signal: active.signal, timeout: 660000 };
        const value = request.list ? await client.listTools(undefined, options) : await client.callTool({
          name: request.name, arguments: request.arguments ?? {},
        }, undefined, options);
        if (!stopping) respond({ ok: true, value });
      } catch (error) {
        if (!stopping) respond({ ok: false, error: String(error.message ?? error) });
      } finally {
        active = undefined;
      }
    }
  } catch (error) {
    if (!stopping) throw error;
  } finally {
    input.close();
    try { await client.close(); }
    finally { process.off('SIGTERM', stop); }
  }
}
