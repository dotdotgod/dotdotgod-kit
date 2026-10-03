// Explicit, opt-in model evaluation. Not part of deterministic package tests.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, createCodemodeExtension, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import contextTools from '../extensions/context-tools/index.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const activePlan = join(repo, 'docs/plan/context-tool-workflow');
const plan = existsSync(activePlan) ? activePlan : join(repo, 'docs/archive/plan/context-tool-workflow');
const outDir = join(repo, '.dotdotgod/context/evaluation');
mkdirSync(outDir, { recursive: true });
const condition = process.argv[2];
const mode = process.argv[3];
const repetition = Number(process.argv[4] ?? 1);
if (!['baseline', 'revised'].includes(condition) || !['native', 'codemode'].includes(mode) || ![1, 2].includes(repetition)) throw new Error('Usage: node packages/pi/scripts/evaluate-context-tools.mjs baseline|revised native|codemode 1|2');
const original = readFileSync(join(plan, 'BASELINE.md'), 'utf8');
const descriptions = new Map([...original.matchAll(/^\| `([^`]+)` \| (.+) \|$/gm)].map((m) => [m[1], m[2]]));
if (!descriptions.has('dotdotgod_execute')) throw new Error('Missing baseline descriptions');
const guidance = readFileSync(condition === 'baseline' ? join(plan, 'baseline/AGENTS.txt') : join(repo, 'AGENTS.md'), 'utf8');
const userSettings = JSON.parse(readFileSync(join(homedir(), '.pi/agent/settings.json'), 'utf8'));
const modelRuntime = await ModelRuntime.create({ authPath: join(homedir(), '.pi/agent/auth.json'), modelsPath: join(homedir(), '.pi/agent/models.json'), modelsStorePath: join(outDir, 'models-cache.json'), refreshOnCreate: false });
const model = modelRuntime.getModel(userSettings.defaultProvider, userSettings.defaultModel);
if (!model || !(await modelRuntime.getAvailable()).some((m) => m.provider === model.provider && m.id === model.id)) throw new Error('Configured evaluation model unavailable; no fallback model selected');
const allowed = ['read', 'bash', 'grep', 'find', 'ls', 'dotdotgod_execute', 'dotdotgod_execute_file', 'dotdotgod_context_index', 'dotdotgod_context_search', ...(mode === 'codemode' ? ['codemode'] : [])];
const tasks = [
  { id: 'verbose', prompt: 'Run `node verbose.mjs` and report which test failed and its reason.', expected: ['orbit-case', 'expected 7', 'received 9'] },
  { id: 'log', prompt: 'Find the failure in fixture.log and report its identifier and reason.', expected: ['aurora-42', 'cache checksum mismatch'] },
  { id: 'nonzero', prompt: 'Run `node failure.mjs` once and report its exit code and failure reason. Do not retry the command.', expected: ['7', 'quota exceeded'] },
  { id: 'short', prompt: 'Read short.mjs and state the exported constant value.', expected: ['41'] },
];
const summaries = [];
for (const task of tasks) {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-model-eval-'));
  const agentDir = join(root, 'agent'); mkdirSync(agentDir);
  const padding = 'fixture-padding '.repeat(10000);
  writeFileSync(join(root, 'verbose.mjs'), `console.log(${JSON.stringify(padding)});console.log('FAIL orbit-case: expected 7 received 9');console.log(${JSON.stringify(padding)});`);
  writeFileSync(join(root, 'failure.mjs'), `console.error(${JSON.stringify(padding)});console.error('FAIL quota exceeded');console.error(${JSON.stringify(padding)});process.exitCode=7;`);
  writeFileSync(join(root, 'fixture.log'), padding + '\nFAIL aurora-42: cache checksum mismatch\n' + padding);
  writeFileSync(join(root, 'short.mjs'), 'export const fixtureAnswer = 41;\n');
  const records = [];
  let cleanup;
  const toolsFactory = (pi) => {
    const proxy = new Proxy(pi, { get(target, key) {
      if (key !== 'registerTool') return Reflect.get(target, key);
      return (tool) => {
        if (tool.name === 'dotdotgod_context_heal') cleanup = () => tool.execute('fixture-cleanup', { confirm: true }, undefined, () => {}, { cwd: root });
        if (condition === 'baseline' && descriptions.has(tool.name)) {
          const { promptGuidelines, ...rest } = tool;
          target.registerTool({ ...rest, description: descriptions.get(tool.name) });
        } else target.registerTool(tool);
      };
    } });
    contextTools(proxy);
    pi.on('tool_call', (event) => {
      records.push({ phase: 'call', tool: event.toolName, parent: event.parentToolCallId, input: event.input });
      if (['edit', 'write', 'dotdotgod_fetch_and_index', 'dotdotgod_project_initialize'].includes(event.toolName)) return { block: true, reason: 'Evaluation fixtures are read-only and network fetches are forbidden.' };
    });
    pi.on('tool_result', (event) => {
      const text = (event.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      const data = event.structuredContent ?? event.details;
      records.push({ phase: 'result', tool: event.toolName, parent: event.parentToolCallId, isError: event.isError, text, details: data ? { ok: data.ok, code: data.code, indexed: data.indexed, stdoutBytes: data.stdoutBytes, stderrBytes: data.stderrBytes, truncated: data.truncated } : undefined });
    });
  };
  const settingsManager = SettingsManager.inMemory({ defaultTools: allowed, compaction: { enabled: false }, retry: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({ cwd: root, agentDir, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    appendSystemPrompt: [guidance, 'Evaluation: inspect only this disposable fixture directory. Do not modify files, access unrelated paths, fetch remote resources, install anything, or spawn agents. Be concise.'],
    extensionFactories: [toolsFactory, ...(mode === 'codemode' ? [createCodemodeExtension({ models: false })] : [])],
  });
  let session;
  const start = Date.now();
  let timedOut = false;
  let turns = 0;
  const assistant = [];
  let error;
  let timer;
  try {
    await resourceLoader.reload();
    if (resourceLoader.getExtensions().errors.length) throw new Error('Evaluation extension loading failed');
    ({ session } = await createAgentSession({ cwd: root, agentDir, modelRuntime, model, thinkingLevel: 'off', settingsManager, resourceLoader, sessionManager: SessionManager.inMemory(root) }));
    await session.bindExtensions({});
    session.subscribe((event) => {
      if (event.type === 'message_end' && event.message.role === 'assistant') assistant.push(event.message);
      if (event.type === 'tool_execution_start' && ++turns > 16) { timedOut = true; void session.abort(); }
    });
    writeFileSync(join(outDir, `${condition}-${mode}-${repetition}-${task.id}-prompt.json`), JSON.stringify({ model: { provider: model.provider, id: model.id }, thinking: 'off', systemPrompt: session.systemPrompt, tools: session.agent.state.tools.map((t) => ({ name: t.name, description: t.description })) }, null, 2));
    timer = setTimeout(() => { timedOut = true; void session.abort(); }, 90000);
    await session.prompt((mode === 'codemode' ? 'Use codemode for this task. ' : '') + task.prompt);
    error = assistant.find((m) => m.stopReason === 'error')?.errorMessage;
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  finally { clearTimeout(timer); }
  const answer = session?.getLastAssistantText() ?? '';
  const calls = records.filter((r) => r.phase === 'call');
  const results = records.filter((r) => r.phase === 'result');
  const modelResults = results.filter((r) => !r.parent);
  const generatedBytes = results.reduce((n, r) => n + (r.details?.stdoutBytes ?? 0) + (r.details?.stderrBytes ?? 0), 0);
  const usage = assistant.reduce((a, m) => ({ input: a.input + (m.usage?.input ?? 0), output: a.output + (m.usage?.output ?? 0), cost: a.cost + (m.usage?.cost?.total ?? 0) }), { input: 0, output: 0, cost: 0 });
  const summary = { condition, mode, repetition, task: task.id, model: { provider: model.provider, id: model.id }, thinking: 'off', durationMs: Date.now() - start, timedOut, error,
    correct: !error && !timedOut && task.expected.every((term) => answer.replace(/[`*_]/g, '').toLowerCase().includes(term.toLowerCase())), answer,
    calls: calls.map((c) => ({ tool: c.tool, parent: !!c.parent })), executeCalls: calls.filter((c) => c.tool === 'dotdotgod_execute').length, bashCalls: calls.filter((c) => c.tool === 'bash').length,
    searchCalls: calls.filter((c) => c.tool === 'dotdotgod_context_search').length, indexCalls: calls.filter((c) => c.tool === 'dotdotgod_context_index').length,
    indexedResults: results.filter((r) => r.details?.indexed?.id).length, modelVisibleResultBytes: modelResults.reduce((n, r) => n + Buffer.byteLength(r.text), 0), contextGeneratedBytes: generatedBytes, usage,
  };
  summaries.push(summary);
  writeFileSync(join(outDir, `${condition}-${mode}-${repetition}-${task.id}.json`), JSON.stringify({ summary, records }, null, 2));
  console.log(JSON.stringify(summary));
  try { session?.dispose(); if (results.some((r) => r.tool.startsWith('dotdotgod_'))) await cleanup?.(); }
  finally { rmSync(root, { recursive: true, force: true }); }
  if (error || timedOut) { console.log(JSON.stringify({ stopped: true, reason: 'Infrastructure failure or trial budget exceeded; no remaining trials started.' })); break; }
}
writeFileSync(join(outDir, `${condition}-${mode}-${repetition}-summary.json`), JSON.stringify(summaries, null, 2));
if (summaries.length !== tasks.length || summaries.some((s) => s.error || s.timedOut)) process.exitCode = 1;
