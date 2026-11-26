import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as decision from '@dotdotgod/context/decision';
import { ImpactState } from '../src/impact-state.mjs';
import { projectLoad } from '../src/project.mjs';

const { buildDecisionPromptExcerpt, DECISION_ERROR_CODES, evaluateLoadDecision, formatDecisionError, formatDecisionInjection, parseDecisionResponse } = decision;
const run = promisify(execFile);
const host = { mode: 'model', provider: 'host' };
const answer = JSON.stringify({ load: { action: 'focused', focus: 'Authentication' }, refs: ['docs/spec/AUTH.md'], reason: 'DO NOT INJECT THIS' });

function fixture(t, profile) {
  const root = mkdtempSync(join(tmpdir(), 'ddg-decision-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = (value) => writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ decision: value }));
  mkdirSync(join(root, 'docs/spec'), { recursive: true });
  writeFileSync(join(root, 'docs/spec/AUTH.md'), '# Authentication\nShared auth contract.');
  mkdirSync(join(root, 'docs/plan'));
  writeFileSync(join(root, 'docs/plan/PRIVATE.md'), '# Authentication secret body');
  if (profile) config(profile);
  const state = new ImpactState(root, 'test-session');
  const evaluate = (options = {}) => evaluateLoadDecision({ root, home: root, sessionId: 'test-session', rawPrompt: 'AUTH 스펙 확인해줘', ...options });
  return { root, state, config, evaluate };
}

async function listen(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('decision short-circuits uninitialized/global, inline opt-out, explicit load/refs, loaded and manual with no provider calls', async (t) => {
  const { root, state, config, evaluate } = fixture(t);
  mkdirSync(join(root, '.dotdotgod'));
  writeFileSync(join(root, '.dotdotgod/config.json'), JSON.stringify({ decision: host }));
  const uninitialized = join(root, 'docs');
  let calls = 0;
  const hostComplete = () => { calls++; return answer; };
  assert.deepEqual(await evaluate({ root: uninitialized, hostComplete }), { kind: 'none' });
  assert.equal(existsSync(new ImpactState(uninitialized, 'test-session').path), false);
  config({ mode: 'advisory' });
  assert.deepEqual(await evaluate({ hostComplete }), { kind: 'advisory' });
  assert.equal(existsSync(state.path), false);
  config(host);
  for (const rawPrompt of ['Hello /dd:no-load please', 'dd:no-load hello', 'hello /no-load', 'see [[AUTH]]', '/dd:no-load [[AUTH]]']) {
    assert.deepEqual(await evaluate({ rawPrompt, hostComplete }), { kind: 'none' });
  }
  assert.equal(existsSync(state.path), false);
  for (const [i, rawPrompt] of ['/load', '/dd:load auth', '/dd-load'].entries()) {
    const sessionId = `explicit-${i}`;
    assert.deepEqual(await evaluate({ rawPrompt, sessionId, hostComplete }), { kind: 'none' });
    assert.equal(new ImpactState(root, sessionId).getLoadState().loaded, true);
  }
  assert.equal((await evaluate({ hostComplete, sessionId: 'explicit-0' })).kind, 'none');
  config({ mode: 'manual' });
  assert.equal((await evaluate({ hostComplete })).kind, 'none');
  assert.equal(calls, 0);
});

test('C-06: fixed error codes, invalid/symlink/oversized config fail open without global fallback', async (t) => {
  const codes = ['config_invalid', 'provider_unsupported_on_host', 'host_auth_unavailable', 'request_timeout', 'request_failed', 'response_invalid', 'prefetch_failed', 'state_error'];
  assert.deepEqual(DECISION_ERROR_CODES, codes);
  for (const code of codes) assert.equal(formatDecisionError(code), `dotdotgod decision: ${code}`);
  assert.equal(formatDecisionError('SECRET\nraw URL'), 'dotdotgod decision: state_error');
  const { root, evaluate, config, state } = fixture(t, host);
  mkdirSync(join(root, '.dotdotgod'));
  writeFileSync(join(root, '.dotdotgod/config.json'), JSON.stringify({ decision: host }));
  const projectConfig = join(root, 'dotdotgod.config.json');
  const hostComplete = () => assert.fail('must not fall through');
  for (const invalid of ['{"decision":{"apiKey":"sk-test-sentinel"', ' '.repeat(256 * 1024 + 1)]) {
    writeFileSync(projectConfig, invalid);
    assert.deepEqual(await evaluate({ hostComplete }), { kind: 'advisory', errorCode: 'config_invalid' });
  }
  rmSync(projectConfig);
  symlinkSync(join(root, '.dotdotgod/config.json'), projectConfig);
  assert.deepEqual(await evaluate({ hostComplete }), { kind: 'advisory', errorCode: 'config_invalid' });
  rmSync(projectConfig);
  config({ ...host, fallback: 'always' });
  assert.equal((await evaluate()).errorCode, 'provider_unsupported_on_host');
  assert.deepEqual(await evaluate(), { kind: 'none' });
  assert.equal(state.getLoadState().notified, true);
  const auth = await evaluate({ sessionId: 'auth', hostComplete: () => { throw Object.assign(new Error('raw token'), { errorCode: 'host_auth_unavailable' }); } });
  assert.deepEqual(auth, { kind: 'advice', action: 'full', refs: [], errorCode: 'host_auth_unavailable' });
  const broken = await evaluate({ state: { getLoadState: () => { throw Error('raw sqlite error'); } } });
  assert.deepEqual(broken, { kind: 'advice', action: 'full', refs: [], errorCode: 'state_error' });
});

test('S-08: excerpt redacts before 2000-character cut including secrets straddling the boundary', () => {
  const excerpt = buildDecisionPromptExcerpt(`${'x'.repeat(1981)} token="sk-test-sentinel-value" ${'z'.repeat(2200)} UNREACHABLE`, { home: '/tmp/agent-home' });
  assert.equal(excerpt.length, 2000);
  assert.doesNotMatch(excerpt, /sk-test|UNREACHABLE/);
  const masked = buildDecisionPromptExcerpt('/tmp/agent-home/work Bearer abc.def-ghi password=secret\nJWT eyJhbGciOi.eyJzdWIiOi.sig', { home: '/tmp/agent-home' });
  assert.match(masked, /~\/work/);
  assert.doesNotMatch(masked, /abc\.def|=secret|eyJhbGciOi|agent-home/);
  assert.equal(buildDecisionPromptExcerpt(`${'x'.repeat(4096)} token=ignored`).length, 2000);
  assert.equal(buildDecisionPromptExcerpt(`token=${'x'.repeat(4090)}AFTER-4096`), 'token=[redacted]');
  assert.equal(buildDecisionPromptExcerpt(String.raw`clientSecret="quoted\"secret"`), 'clientSecret=[redacted]');
});

test('strict nested decisions; advice uses sanitized focus and exact, deduplicated refs; reason never injected', () => {
  const refs = ['docs/A.md', 'docs/B.md', 'docs/C.md', 'docs/D.md'];
  const raw = { load: { action: 'focused', focus: 'auth\nflow\x00\u202e' }, refs: ['../A.md', 7, refs[0], 'Docs/B.md', refs[0], ...refs.slice(1)], reason: 'credential-sentinel' };
  const parsed = parseDecisionResponse(`\`\`\`json\n${JSON.stringify(raw)}\n\`\`\``, refs);
  assert.deepEqual(parsed, { load: { action: 'focused', focus: 'auth flow' }, refs: refs.slice(0, 3), reason: 'credential-sentinel' });
  const options = { toolName: 'project_memory_load' };
  const advice = formatDecisionInjection({ kind: 'advice', ...parsed.load, refs: parsed.refs, reason: parsed.reason }, options);
  assert.match(advice, /project_memory_load focus: "auth flow"/);
  assert.match(advice, /docs\/C\.md/);
  assert.doesNotMatch(advice, /credential-sentinel|\.\.\/|docs\/D\.md/);
  assert.match(formatDecisionInjection({ kind: 'advice', action: 'full', focus: 'ignore this', refs: [] }, options), /project_memory_load.*baseline/i);
  assert.match(formatDecisionInjection({ kind: 'advisory' }, options), /project_memory_load/);
  const clipped = formatDecisionInjection({ kind: 'advice', action: 'focused', focus: '"😀'.repeat(4000), refs: [refs[0]] }, { maxBytes: 6144 });
  assert.ok(Buffer.byteLength(clipped) <= 6144);
  assert.match(clipped, /docs\/A\.md$/);
  assert.doesNotThrow(() => JSON.parse(clipped.split('\n')[1].split('focus: ')[1]));
  for (const invalid of [JSON.stringify({ action: 'skip' }), JSON.stringify({ ...raw, extra: true }), JSON.stringify({ ...raw, load: { action: 'focused', focus: '\u202e\n' } }), '```\n```json\n{}\n```\n```', JSON.stringify({ ...raw, refs: null }), 'null']) {
    assert.throws(() => parseDecisionResponse(invalid, refs), /response_invalid/);
  }
});

test('prefetch is fenced untrusted, bounded by UTF-8 bytes with a closing dynamic fence', () => {
  const payload = '\n```\n\n`````\n' + '한😀'.repeat(5000) + '\n' + '`'.repeat(16000);
  for (const maxBytes of [8192, 6144]) {
    const text = formatDecisionInjection({ kind: 'prefetch', text: payload, reason: 'hidden reason' }, { maxBytes });
    assert.ok(Buffer.byteLength(text) <= maxBytes);
    assert.match(text, /instructionAuthority: "none"/);
    const [, fence, data] = /\n(`{3,})text\n([\s\S]*)\n\1$/u.exec(text);
    assert.equal(fence.length, 6);
    assert.match(data, /\[truncated\]$/);
    assert.doesNotMatch(data, /hidden reason|\uFFFD|[\uD800-\uDFFF]/u);
  }
  const hugeFence = formatDecisionInjection({ kind: 'prefetch', text: '`'.repeat(20000) });
  assert.ok(Buffer.byteLength(hugeFence) <= 8192);
  assert.match(hugeFence, /\n(`{3,})text\n[\s\S]*\n\1$/);
});

test('Ollama and OpenAI-compatible request shapes, map privacy, and single model call per lease', async (t) => {
  const requests = [];
  const baseUrl = await listen(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ body: JSON.parse(Buffer.concat(chunks)), method: req.method, url: req.url });
    res.end(JSON.stringify(req.url.endsWith('/api/chat') ? { message: { content: answer } } : { choices: [{ message: { content: answer } }] }));
  });
  const { config, evaluate, state } = fixture(t);
  for (const provider of ['ollama', 'openai-compatible']) {
    config({ mode: 'model', provider, baseUrl: `${baseUrl}/proxy///`, model: 'test-model' });
    const options = { sessionId: provider, rawPrompt: 'auth request apiKey=sk-fixture-secret' };
    const outcomes = await Promise.all([evaluate(options), evaluate(options)]);
    assert.deepEqual(outcomes.map((outcome) => outcome.kind).sort(), ['advice', 'none']);
    assert.equal((await evaluate(options)).kind, 'none');
  }
  assert.equal(requests.length, 2);
  const [ollama, openai] = requests;
  assert.equal(ollama.url, '/proxy/api/chat');
  assert.deepEqual(ollama.body.options, { temperature: 0, num_predict: 200 });
  assert.equal(ollama.body.stream, false);
  assert.deepEqual(ollama.body.format.properties.load.properties.action.enum, ['skip', 'focused', 'full']);
  assert.equal(openai.url, '/proxy/chat/completions');
  assert.deepEqual(openai.body.response_format, { type: 'json_object' });
  assert.equal(openai.body.temperature, 0);
  assert.equal(openai.body.max_tokens, 200);
  for (const { method, body } of requests) {
    assert.equal(method, 'POST');
    assert.equal(body.model, 'test-model');
    assert.match(JSON.stringify(body.messages), /JSON.*docs\/spec\/AUTH.md/);
    assert.doesNotMatch(JSON.stringify(body.messages), /PRIVATE|auth contract|sk-fixture-secret/);
  }
  assert.equal(state.getLoadState().loaded, false);
});

test('S-03: no redirects/retries and chunked >64 KiB stream is cancelled', async (t) => {
  let calls = 0;
  let mode = 'redirect';
  let closed;
  const baseUrl = await listen(t, (req, res) => {
    calls++;
    if (mode === 'redirect') {
      res.writeHead(307, { location: '/other' });
      res.end();
    } else if (mode === 'status') {
      res.writeHead(503);
      res.end('raw response SECRET');
    } else if (mode === 'oversize') {
      res.once('close', closed);
      res.writeHead(200);
      res.write('x'.repeat(48 * 1024));
      res.write('y'.repeat(24 * 1024));
      // Never send EOF. The reader must cancel rather than wait for request timeout.
    }
  });
  const { evaluate } = fixture(t, { mode: 'model', provider: 'ollama', model: 'stub', baseUrl, timeoutMs: 500 });
  for (const name of ['redirect', 'status', 'oversize', 'timeout']) {
    mode = name;
    const disconnect = new Promise((resolve) => { closed = resolve; });
    const outcome = await evaluate({ sessionId: name });
    assert.deepEqual(outcome, { kind: 'advisory', errorCode: { oversize: 'response_invalid', timeout: 'request_timeout' }[name] ?? 'request_failed' });
    if (name === 'oversize') {
      const controller = new AbortController();
      try {
        await Promise.race([disconnect, delay(1500, undefined, { signal: controller.signal }).then(() => assert.fail('uncancelled response'))]);
      } finally { controller.abort(); }
    }
  }
  assert.equal(calls, 4);
});

test('C-01: duplicate prompt suppression, fifth skip delivers fallback once, with no DB lock held during host callback', async (t) => {
  const { evaluate, state, root } = fixture(t, host);
  const hostComplete = () => {
    assert.equal(new ImpactState(root, 'other').claimAdvisedOnce(), state.getLoadState().skipCount === 0);
    return JSON.stringify({ load: { action: 'skip', focus: '' }, refs: [], reason: 'greeting' });
  };
  for (let i = 1; i <= 5; i++) {
    const input = { hostComplete, rawPrompt: `prompt ${i}` };
    assert.equal((await evaluate(input)).kind, i === 5 ? 'advisory' : 'none');
    assert.equal(state.getLoadState().skipCount, i);
    assert.equal((await evaluate(input)).kind, 'none');
  }
  assert.equal((await evaluate({ rawPrompt: 'next', hostComplete: () => assert.fail('terminal') })).kind, 'none');
});

test('read-only prefetch makes no cache writes, uses keyword/shared and --, and failures never mark loaded', async (t) => {
  const { root, config, state, evaluate } = fixture(t, { ...host, delivery: 'prefetch' });
  const load = await projectLoad({ root, focus: '--help', readOnly: true, refs: ['docs/spec/AUTH.md'] });
  assert.equal(load.ok, true);
  assert.equal(load.query.query, '--help');
  assert.equal(load.query.search, 'keyword');
  assert.equal(load.query.scope, 'shared');
  assert.deepEqual(load.references, []);
  assert.doesNotMatch(load.documentationTree.join('\n'), /PRIVATE/);
  assert.equal(existsSync(join(root, '.dotdotgod')), false);
  const outcome = await evaluate({ hostComplete: () => answer });
  assert.equal(outcome.kind, 'prefetch');
  assert.match(outcome.text, /AUTH.md/);
  assert.doesNotMatch(outcome.text, /PRIVATE|DO NOT INJECT/);
  assert.equal(state.getLoadState().loaded, true);
  assert.equal(existsSync(join(root, '.dotdotgod/index')), false);
  config({ ...host, delivery: 'prefetch' });
  rmSync(join(root, 'docs'), { recursive: true });
  assert.deepEqual(await evaluate({ sessionId: 'missing-map', hostComplete: () => answer }), { kind: 'advisory', errorCode: 'prefetch_failed' });
  assert.equal(new ImpactState(root, 'missing-map').getLoadState().loaded, false);
  mkdirSync(join(root, 'docs'));
  const timed = await evaluate({ sessionId: 'timed', budgetMs: 150, hostComplete: async () => { await delay(300); return answer; } });
  assert.equal(timed.errorCode, 'request_timeout');
  assert.equal(new ImpactState(root, 'timed').getLoadState().loaded, false);
});

test('cliJson AbortSignal kills the already-running read-only query child and never reports a load', async (t) => {
  const { root } = fixture(t, host);
  const project = new URL('../src/project.mjs', import.meta.url).href;
  const preload = `import { writeFileSync } from 'node:fs'; if (process.argv[1]?.endsWith('dotdotgod.mjs') && process.argv.includes('query')) { writeFileSync(${JSON.stringify(join(root, 'child.pid'))}, String(process.pid)); await new Promise(r => setTimeout(r, 10000)); }`;
  const decisionModule = new URL('../src/decision.mjs', import.meta.url).href;
  const impactModule = new URL('../src/impact-state.mjs', import.meta.url).href;
  const main = `
    import assert from 'node:assert/strict';
    import { readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
    import { setTimeout as delay } from 'node:timers/promises';
    import { projectLoad } from ${JSON.stringify(project)};
    import { evaluateLoadDecision } from ${JSON.stringify(decisionModule)};
    import { ImpactState } from ${JSON.stringify(impactModule)};
    const root = ${JSON.stringify(root)};
    const path = ${JSON.stringify(join(root, 'child.pid'))};
    async function childPid() {
      for (let i = 0; i < 300 && !existsSync(path); i++) await delay(10);
      return Number(readFileSync(path, 'utf8'));
    }
    async function assertKilled(pid) {
      for (let i = 0; i < 100; i++) {
        try { process.kill(pid, 0); }
        catch (error) { assert.equal(error.code, 'ESRCH'); return; }
        await delay(10);
      }
      assert.fail('query child survived abort');
    }
    const c = new AbortController();
    const pending = projectLoad({ root, readOnly: true, focus: 'auth', signal: c.signal });
    const pid = await childPid();
    c.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    await assertKilled(pid);
    rmSync(path);
    writeFileSync(root + '/dotdotgod.config.json', ${JSON.stringify(JSON.stringify({ decision: { ...host, delivery: 'prefetch' } }))});
    const state = new ImpactState(root, 'aborted');
    const evaluate = evaluateLoadDecision({ root, state, rawPrompt: 'auth', hostComplete: () => ${JSON.stringify(answer)}, budgetMs: 500 });
    const timedPid = await childPid();
    assert.deepEqual(await evaluate, { kind: 'advisory', errorCode: 'prefetch_failed' });
    assert.equal(state.getLoadState().loaded, false);
    await assertKilled(timedPid);
  `;
  await run(process.execPath, ['--input-type=module', '-e', main], { timeout: 6000, env: { ...process.env, NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(preload)}` } });
});

test('MCP marks only bound, successful loads of initialized projects; reserved default never creates a DB', async (t) => {
  const { root, state, config } = fixture(t);
  const broken = join(root, 'broken');
  mkdirSync(join(broken, '.dotdotgod'), { recursive: true });
  const preload = `if (process.argv[1]?.endsWith('dotdotgod.mjs') && process.argv[2] === 'map' && process.argv[3] === ${JSON.stringify(broken)}) process.exit(2);`;
  const env = { ...process.env, DOTDOTGOD_PROJECT_ROOT: root, NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(preload)}` };
  delete env.DOTDOTGOD_SESSION_ID;
  const client = new Client({ name: 'load-state-test', version: '1.0.0' });
  t.after(() => client.close());
  const transport = new StdioClientTransport({ command: process.execPath, args: [new URL('../bin/server.mjs', import.meta.url).pathname], env, stderr: 'pipe' });
  await client.connect(transport);
  const load = (args) => client.callTool({ name: 'project_load', arguments: args });
  assert.equal((await load({ contextSessionId: 'test-session' })).structuredContent.ok, true);
  assert.equal(existsSync(state.path), false);
  config({ mode: 'manual' });
  assert.equal((await load({})).structuredContent.ok, true);
  assert.equal(existsSync(state.path), false);
  assert.equal((await load({ contextSessionId: 'DeFaUlT' })).isError, true);
  assert.equal(existsSync(state.path), false);
  const failed = await load({ contextSessionId: 'test-session', root: 'broken' });
  assert.equal(failed.structuredContent.mapUnavailable.code, 'MAP_UNAVAILABLE');
  assert.equal(existsSync(new ImpactState(broken, 'test-session').path), false);
  assert.equal((await load({ contextSessionId: 'test-session' })).structuredContent.ok, true);
  assert.equal(state.getLoadState().loaded, true);
});

test('runHookSafely masks async and sync failures into one stderr line and empty JSON stdout', async () => {
  const mod = new URL('../src/hook-state.mjs', import.meta.url).href;
  const script = `import { homedir } from 'node:os'; import { runHookSafely } from ${JSON.stringify(mod)}; const fail = () => { throw new Error(homedir() + '/private\\nbad'); }; await runHookSafely(fail); await runHookSafely(async () => fail()); await runHookSafely(async () => ({ ok: true }));`;
  const { stdout, stderr } = await run(process.execPath, ['--input-type=module', '-e', script]);
  assert.equal(stdout, '{}\n{}\n{"ok":true}\n');
  assert.equal(stderr, 'dotdotgod hook error: ~/private bad\ndotdotgod hook error: ~/private bad\n');
});
