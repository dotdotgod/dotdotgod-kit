// Adapter-owned stdio MCP client. One process/connection per repository + host session.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const root = realpathSync(process.argv[2]);
const sessionId = process.argv[3];
const client = new Client({ name: 'dotdotgod-hermes', version: '0.6.0' });
const transport = new StdioClientTransport({
  command: process.execPath, args: [fileURLToPath(new URL('./server.mjs', import.meta.url))], cwd: root,
  env: { ...process.env, DOTDOTGOD_PROJECT_ROOT: root, DOTDOTGOD_SESSION_ID: sessionId }, stderr: 'inherit',
});
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const lines = input[Symbol.asyncIterator](); // Subscribe before MCP startup; early requests must not be dropped.
let active;
let stopping = false;
process.on('SIGTERM', () => { stopping = true; active?.abort(); input.close(); });
try {
  await client.connect(transport);
  for await (const line of lines) {
    try {
      const request = JSON.parse(line);
      active = new AbortController();
      // Session resumes are validated by the existing shared contract. Do not replay failed writes.
      const value = request.list ? await client.listTools() : await client.callTool({
        name: request.name, arguments: request.arguments ?? {},
      }, undefined, { timeout: 660000, signal: active.signal });
      process.stdout.write(`${JSON.stringify({ ok: true, value })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: String(error.message ?? error) })}\n`);
    }
    active = undefined;
    if (stopping) break;
  }
} finally {
  // Let the server consume SDK cancellation and reap detached command groups before transport teardown.
  if (stopping) await new Promise(resolve => setTimeout(resolve, 1000));
  await client.close();
}
