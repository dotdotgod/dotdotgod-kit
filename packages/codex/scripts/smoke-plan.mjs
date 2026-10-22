// Offline host smoke: real Codex + loopback Responses fixture, no account or paid model.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const plugin = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
const { codexRpc } = await import(pathToFileURL(join(plugin, 'src/rpc.mjs')));
const setupPath = join(plugin, 'scripts/setup-plan.mjs');

const binary = process.env.CODEX_BINARY || 'codex';
const catalog = process.env.CODEX_CATALOG;
assert.ok(catalog, 'CODEX_CATALOG must name a complete Codex 0.163.0 catalog.');
const scratch = mkdtempSync(join(tmpdir(), 'codex-plan-smoke-'));
const home = join(scratch, 'home');
const root = join(scratch, 'project');
mkdirSync(home); mkdirSync(root);
const env = { ...process.env, HOME: home, CODEX_HOME: home, OPENAI_API_KEY: 'offline-fixture' };
const requests = [];
let toolStep = 0;
const model = createServer(async (req, res) => {
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  requests.push(body);
  const id = `offline-${requests.length}`;
  const text = '<proposed_plan>\n# Host plan\nVerify project-local plan storage.\n</proposed_plan>';
  const patchTool = body.tools?.find(tool => tool.name === 'apply_patch');
  const patches = [
    '*** Begin Patch\n*** Add File: docs/plan/native/README.md\n+# Native host plan\n*** End Patch',
    '*** Begin Patch\n*** Add File: forbidden.ts\n+blocked\n*** End Patch',
  ];
  const patch = patchTool ? patches[toolStep++] : undefined;
  const item = patch ? (patchTool.type === 'custom'
    ? { id: `call-${toolStep}`, type: 'custom_tool_call', call_id: `call-${toolStep}`, name: 'apply_patch', input: patch, status: 'completed' }
    : { id: `call-${toolStep}`, type: 'function_call', call_id: `call-${toolStep}`, name: 'apply_patch', arguments: JSON.stringify({ patch }), status: 'completed' })
    : { id: 'msg-1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
  const events = [
    { type: 'response.created', response: { id, status: 'in_progress', output: [] } },
    ...(!patch ? [
      { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
      { type: 'response.output_text.delta', item_id: 'msg-1', output_index: 0, content_index: 0, delta: text },
    ] : []),
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } } },
  ];
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
let rpc;
try {
  const source = JSON.parse(readFileSync(catalog, 'utf8'));
  // A fixture-only provider/model; production setup preserves all catalog entries.
  const chosen = source.models.find(m => m.slug === 'gpt-5.2-codex') || source.models.at(-1);
  chosen.prefer_websockets = false;
  chosen.use_responses_lite = false;
  chosen.tool_mode = 'function_tools';
  const fixtureCatalog = join(scratch, 'models.json');
  writeFileSync(fixtureCatalog, JSON.stringify({ models: [chosen] }));
  const setup = spawnSync(process.execPath, [setupPath, root,
    '--codex', binary, '--catalog', fixtureCatalog, '--confirm'], { env, encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr);
  const prepared = JSON.parse(setup.stdout);
  const profile = prepared.profile;
  function sandbox(code) {
    return spawnSync(binary, ['sandbox', '-P', 'dotdotgod-plan', '-p', profile, '-C', root, '--', process.execPath, '-e', code], { env, encoding: 'utf8' });
  }
  assert.equal(sandbox('require("fs").mkdirSync("docs/plan/task",{recursive:true});require("fs").writeFileSync("docs/plan/task/README.md","# First")').status, 0);
  assert.equal(sandbox('require("fs").appendFileSync("docs/plan/task/README.md","\\nUpdated")').status, 0);
  assert.match(readFileSync(join(root, 'docs/plan/task/README.md'), 'utf8'), /Updated/);
  for (const path of ['source.ts', 'config.json', 'docs/SPEC.md']) {
    assert.notEqual(sandbox(`require("fs").writeFileSync(${JSON.stringify(path)},"blocked")`).status, 0);
    assert.equal(existsSync(join(root, path)), false);
  }
  symlinkSync(root, join(root, 'docs/plan/escape'));
  assert.notEqual(sandbox('require("fs").writeFileSync("docs/plan/escape/source.ts","blocked")').status, 0);
  assert.equal(existsSync(join(root, 'source.ts')), false);
  let completed;
  let completion = new Promise(resolve => { completed = resolve; });
  // app-server does not accept --profile; use the same file in this isolated HOME.
  // Provider keys must be top-level, before profile tables, to survive restart.
  writeFileSync(join(home, 'config.toml'), `model_provider = "offline"\n` + readFileSync(prepared.profilePath, 'utf8') + `\n[model_providers.offline]\nname = "Offline fixture"\nbase_url = "http://127.0.0.1:${model.address().port}/v1"\nwire_api = "responses"\nenv_key = "OPENAI_API_KEY"\n`);
  rpc = codexRpc(binary, { cwd: root, env, onNotification: msg => { if (msg.method === 'turn/completed') completed(msg.params); } });
  await rpc.initialize();
  const started = await rpc.call('thread/start', { cwd: root, model: chosen.slug, approvalPolicy: 'never',
    config: { 'features.shell_snapshot': false, 'features.remote_plugin': false },
  });
  const threadId = started.thread.id;
  await rpc.call('turn/start', { threadId, input: [{ type: 'text', text: 'Plan a small change.' }],
    collaborationMode: { mode: 'plan', settings: { model: chosen.slug, reasoning_effort: 'medium', developer_instructions: null } } });
  const timer = setTimeout(() => completed({ timeout: true }), 20000);
  const result = await completion; clearTimeout(timer);
  assert.equal(result.timeout, undefined, 'native plan turn timed out');
  assert.equal(result.turn.status, 'completed', JSON.stringify(result));
  assert.ok(requests.length);
  const outgoing = JSON.stringify(requests[0]);
  assert.match(outgoing, /only permitted project mutation/);
  assert.match(outgoing, /without a separate save request/);
  assert.match(outgoing, /docs\/plan/);
  assert.match(readFileSync(join(root, 'docs/plan/native/README.md'), 'utf8'), /Native host plan/);
  assert.equal(existsSync(join(root, 'forbidden.ts')), false);
  const resumed = await rpc.call('thread/resume', { threadId, cwd: root });
  assert.equal(resumed.collaborationMode?.mode, 'plan');
  rpc.close();
  rpc = codexRpc(binary, { cwd: root, env });
  await rpc.initialize();
  const restarted = await rpc.call('thread/resume', { threadId, cwd: root });
  assert.equal(restarted.collaborationMode?.mode, 'plan');
  await rpc.call('thread/settings/update', { threadId, collaborationMode: { mode: 'default', settings: { model: chosen.slug, reasoning_effort: 'medium', developer_instructions: null } } });
  assert.equal(sandbox('require("fs").appendFileSync("docs/plan/task/README.md","\\nResumed")').status, 0);
  assert.notEqual(sandbox('require("fs").writeFileSync("source.ts","blocked")').status, 0);
  const conflict = spawnSync(process.execPath, [setupPath, root,
    '--codex', binary, '--catalog', fixtureCatalog, '--confirm'], { env, encoding: 'utf8' });
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /Existing (default_permissions|permissions)/);
  console.log(JSON.stringify({ ok: true, host: 'Codex 0.163.0', sandbox: 'native patch and sandbox plan writes; outside/symlink denial passed', nativePlan: 'custom instructions observed in actual model request', resume: 'plan retained across host restart; mode exit does not expand permissions', requests: requests.length }));
} finally {
  rpc?.close(); model.closeAllConnections(); model.close();
  rmSync(scratch, { recursive: true, force: true });
}
