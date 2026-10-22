// Offline registry smoke against an installed OpenCode binary. No paid model calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { createServer as httpServer } from 'node:http';

const root = mkdtempSync(join(tmpdir(), 'dotdotgod-opencode-smoke-'));
const env = { ...process.env, HOME: join(root, 'home'), XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state') };
mkdirSync(env.HOME);
const requests = [];
let operations = [{ name: 'write', arguments: { path: 'docs/plan/offline-smoke/README.md', content: '# Offline Plan\n\n## Plan\n1. Verify integration.\n' } }];
const model = httpServer(async (request, response) => {
  let text = '';
  for await (const data of request) text += data;
  const body = JSON.parse(text);
  requests.push(body);
  const operation = body.tools?.length ? operations.shift() : undefined;
  const delta = operation ? { tool_calls: [{ index: 0, id: `fixture-${requests.length}`, type: 'function', function: { name: operation.name, arguments: JSON.stringify(operation.arguments) } }] } : { content: 'Offline fixture complete.' };
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: operation ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
writeFileSync(join(root, 'opencode.json'), JSON.stringify({
  plugins: [process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url))], model: 'fixture/fixture', snapshots: false,
  permissions: [{ action: 'edit', resource: 'docs/plan/denied/*', effect: 'deny' }],
  providers: { fixture: { package: '@opencode/ai/providers/openai-compatible', settings: { baseURL: `http://127.0.0.1:${model.address().port}/v1`, apiKey: 'offline-fixture' }, models: { fixture: { capabilities: { tools: true }, limit: { context: 100000, output: 1000 } } } } },
}));
async function cli(args) {
  const child = spawn('opencode', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const timer = setTimeout(() => child.kill('SIGTERM'), 30000);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  clearTimeout(timer);
  assert.equal(code, 0, stderr);
  return stdout;
}
async function api(path, body) {
  return JSON.parse(await cli(['api', body ? 'post' : 'get', `/api/${path}?${new URLSearchParams({ 'location[directory]': root })}`, ...(body ? ['--data', JSON.stringify(body)] : [])]));
}
try {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  await cli(['service', 'set', 'port', String(port)]);
  const session = await api('session', { location: { directory: root }, agent: 'plan', title: 'Offline smoke' });
  await cli(['run', '--session', session.data.id, '--agent', 'plan', '--model', 'fixture/fixture', '--format', 'json', 'Plan a focused integration change.']);
  const commands = await api('command');
  assert.ok(JSON.stringify(commands).includes('dd:load'));
  const skills = await api('skill');
  assert.ok(JSON.stringify(skills).includes('doc-first-planning'));
  const agents = await api('agent');
  const plan = (agents.data ?? agents).find(agent => agent.id === 'plan');
  assert.ok(plan.permissions.some(rule => rule.resource === 'docs/plan/*'));
  assert.ok(requests.length >= 2, 'offline model must receive tool continuation');
  const outgoing = JSON.stringify(requests.find(request => request.tools?.length)?.messages);
  assert.match(outgoing, /automatically save/);
  assert.doesNotMatch(outgoing, /unless the user explicitly asks/);
  assert.match(readFileSync(join(root, 'docs/plan/offline-smoke/README.md'), 'utf8'), /Offline Plan/);
  operations = [
    { name: 'write', arguments: { path: 'docs/plan/denied/README.md', content: '# Must stay denied' } },
    { name: 'write', arguments: { path: 'source.ts', content: 'must not write source in plan mode' } },
  ];
  await cli(['run', '--session', session.data.id, '--agent', 'plan', '--model', 'fixture/fixture', '--format', 'json', 'Exercise existing plan safety.']);
  assert.equal(existsSync(join(root, 'docs/plan/denied/README.md')), false, 'explicit user deny must win');
  assert.equal(existsSync(join(root, 'source.ts')), false, 'source edits must remain denied');
  const build = await api('session', { location: { directory: root }, agent: 'build', title: 'MCP smoke' });
  const buildStart = requests.length;
  operations = [
    { name: 'write', arguments: { path: 'source.ts', content: 'export const value = 1;\n' } },
    { name: 'execute', arguments: { code: `const value = await tools.dotdotgod_context.stats({}); if (value.isError || value.structuredContent.sessionId !== ${JSON.stringify(build.data.id)}) throw Error("host identity mismatch"); const pending = await tools.dotdotgod_context.impact_status({}); if (pending.isError || pending.structuredContent.count !== 1) throw Error("pending impact missing"); const review = await tools.dotdotgod_context.project_impact({ paths: ["source.ts"] }); if (review.isError || !review.structuredContent.ok) throw Error("impact review failed"); const cleared = await tools.dotdotgod_context.impact_status({}); if (cleared.isError || cleared.structuredContent.count !== 0) throw Error("pending impact not cleared"); return { marker: "mcp-host-identity-verified", sessionId: value.structuredContent.sessionId, impactReviewed: true };` } },
  ];
  const output = await cli(['run', '--session', build.data.id, '--agent', 'build', '--model', 'fixture/fixture', '--format', 'json', 'Exercise MCP and advisory impact.']);
  assert.match(output, /mcp-host-identity-verified/, 'MCP Code Mode must verify actual host identity');
  assert.match(output, /impactReviewed/, 'unprefixed MCP review/status calls must work');
  assert.ok(requests.slice(buildStart).some(request => /DOTDOTGOD IMPACT PENDING/.test(JSON.stringify(request.messages))));
  console.log(JSON.stringify({ commands, skillCount: (skills.data ?? skills).length, planPermissions: plan.permissions, mcp: await api('mcp') }));
} catch (error) {
  try { console.error(readFileSync(join(root, 'data/opencode/log/opencode.log'), 'utf8').slice(-16000)); } catch {}
  throw error;
} finally {
  model.close();
  try { await cli(['service', 'stop']); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
