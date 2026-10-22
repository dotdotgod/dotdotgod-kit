// Offline host verification, no credentials or paid model. Requires CLAUDE_BINARY.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const binary = process.env.CLAUDE_BINARY || 'claude';
const scratch = mkdtempSync(join(tmpdir(), 'claude-native-plans-'));
const home = join(scratch, 'home');
const root = join(scratch, 'project');
mkdirSync(home); mkdirSync(root);
const requests = [];
let nativePath;
const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url.includes('/messages')) { res.writeHead(404); res.end(); return; }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  requests.push(body);
  const text = JSON.stringify(body);
  nativePath ||= [...text.matchAll(/[^\s`<>"\\]+\/docs\/plan\/[^\s`<>"\\]+\.md/g)].map(match => match[0]).find(path => path.startsWith('/'));
  const write = requests.length === 1 && nativePath;
  const block = write ? { type: 'tool_use', id: 'native-plan-write', name: 'Write', input: { file_path: nativePath, content: '# Native plan smoke\n\nVerify project-local storage.\n' } } : { type: 'text', text: 'Offline native plan fixture complete.' };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const events = [
    ['message_start', { type: 'message_start', message: { id: `fixture-${requests.length}`, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: write ? { ...block, input: {} } : { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: write ? { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } : { type: 'text_delta', text: block.text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: write ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  res.end(events.map(([event, value]) => `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`).join(''));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const cli = process.argv[2] ? join(resolve(process.argv[2]), 'mcp/cli.mjs') : fileURLToPath(new URL('../mcp/cli.mjs', import.meta.url));
  const initialized = spawnSync(process.execPath, [cli, 'init', root, '--claude-plans', '--json'], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(initialized.status, 0, initialized.stderr);
  const child = spawn(binary, ['-p', '--permission-mode', 'plan', '--permission-prompts', 'none', '--model', 'claude-sonnet-4-5', '--tools', 'Read,Write,Edit', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', 'project', '--no-session-persistence', '--output-format', 'json', 'Plan a focused change and save the native plan.'], {
    cwd: root, env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude'), ANTHROPIC_API_KEY: 'offline-fixture', ANTHROPIC_AUTH_TOKEN: '', ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, DISABLE_NONESSENTIAL_TRAFFIC: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '', err = '';
  child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
  const timer = setTimeout(() => child.kill('SIGTERM'), 30000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  clearTimeout(timer);
  assert.equal(code, 0, err + out);
  assert.ok(nativePath, `Native path not found in ${requests.length} requests`);
  assert.ok(nativePath.startsWith(join(root, 'docs/plan/')) || nativePath.startsWith(join('/private', root, 'docs/plan/')));
  assert.equal(existsSync(nativePath), true, out);
  assert.match(readFileSync(nativePath, 'utf8'), /Native plan smoke/);
  console.log(JSON.stringify({ ok: true, host: spawnSync(binary, ['--version'], { encoding: 'utf8' }).stdout.trim(), storage: 'native plan written under project docs/plan', requests: requests.length }));
} finally { server.closeAllConnections(); server.close(); rmSync(scratch, { recursive: true, force: true }); }
