import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import plugin from '../src/index.mjs';
import { planGuidance, redirectPlanPermissions, registerPlan, rewritePlanReminder } from '../src/plan.mjs';
import { editedPaths } from '../src/impact.mjs';
import { registerMcp } from '../src/mcp.mjs';
import { ImpactState } from '../mcp/impact-state.mjs';

const reminder = `You are in Plan mode. Discuss the plan with the user directly in the conversation. Do not create or update plan files unless the user explicitly asks you to; when they do, write them only in:\n${homedir()}/.opencode/plan\nYou remain in Plan mode until the user switches agents. If the user asks you to implement changes, do not do so. Tell them they need to switch agents.`;
const nativeRules = () => [{ action: 'edit', resource: '*', effect: 'deny' }, { action: 'edit', resource: join(homedir(), '.opencode/plan/*'), effect: 'allow' }];

test('plan redirect replaces shipped exception in place and preserves later user deny', () => {
  const user = { action: 'edit', resource: '*', effect: 'deny' };
  const agent = { permissions: [...nativeRules(), user] };
  assert.equal(redirectPlanPermissions(agent, '/repo'), true);
  assert.equal(agent.permissions.at(-1), user);
  assert.equal(agent.permissions.some(rule => rule.resource.includes('.opencode/plan')), false);
  const rewritten = rewritePlanReminder(`<system-reminder>\n${reminder}\n</system-reminder>`, '/repo');
  assert.equal(rewritten.replaced, true);
  assert.match(rewritten.text, /automatically save/);
  assert.match(rewritten.text, /docs\/plan\/<task-slug>\/README.md/);
  assert.doesNotMatch(rewritten.text, /unless the user explicitly asks/);
  assert.equal(rewritePlanReminder('You are in Plan mode. changed upstream', '/repo').replaced, false);
  assert.equal(rewritePlanReminder(reminder.replace('\nYou remain', '\n\nDo not modify any other files or ask a subagent to do so.\n\nYou remain'), '/repo').replaced, true);
  assert.match(planGuidance('/repo'), /not execution approval/);
});

test('plan integration ignores other locations and preserves unsupported versions and permission layouts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'opencode-location-'));
  const other = mkdtempSync(join(tmpdir(), 'opencode-other-'));
  try {
    for (const [version, permissions, compatible] of [
      ['2.1.2', nativeRules(), true],
      ['2.2.0', nativeRules(), false],
      ['2.1.2', [{ action: 'edit', resource: '*', effect: 'deny' }], false],
    ]) {
      const hooks = [];
      const agent = { permissions: structuredClone(permissions) };
      const ctx = {
        app: { version }, location: { directory: root },
        agent: { transform: async fn => fn({ update: (_id, fn) => fn(agent) }) },
        session: { get: async ({ sessionID }) => ({ location: { directory: sessionID === 'other' ? other : root } }), hook: async (_name, fn) => hooks.push(fn) },
      };
      await registerPlan(ctx, root);
      const foreign = { agent: 'plan', sessionID: 'other', messages: [{ role: 'user', content: reminder }], system: [] };
      await hooks[0](foreign);
      assert.equal(foreign.messages[0].content, reminder);
      assert.deepEqual(foreign.system, []);
      const local = { ...foreign, sessionID: 'local', messages: [{ role: 'user', content: reminder }], system: [] };
      await hooks[0](local);
      if (compatible) assert.match(local.messages[0].content, /automatically save/);
      else {
        assert.equal(local.messages[0].content, reminder);
        assert.deepEqual(agent.permissions, permissions);
        assert.match(local.system[0].text, /COMPATIBILITY/);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(other, { recursive: true, force: true }); }
});

test('MCP wrapper blocks write-capable plan calls and propagates host shell permission denials', async () => {
  const received = [];
  const checks = [];
  const definitions = ['execute', 'execute_file', 'project_initialize', 'stats'].map(name => ({
    id: `dotdotgod_context_${name}`, execute: async input => { received.push(input); return { content: 'ok' }; },
  }));
  await registerMcp({
    mcp: { transform: async fn => fn({ get: () => ({ disabled: true }), set: () => assert.fail('must preserve configured server') }) },
    tool: { transform: async fn => fn({ list: () => definitions, update: (id, fn) => fn(definitions.find(tool => tool.id === id)) }) },
    permission: { assert: async input => { checks.push(input); if (input.resources[0] === 'git push') throw Error('user denied shell'); } },
  }, '/repo');
  const context = { agent: 'plan', sessionID: 'host', id: 'call', messageID: 'message' };
  for (const tool of definitions.slice(0, 3)) await assert.rejects(tool.execute({}, context), /Plan mode/);
  assert.equal(received.length, 0);
  await definitions[3].execute({ contextSessionId: 'spoof' }, context);
  assert.equal(received[0].contextSessionId, 'host');
  await assert.rejects(definitions[0].execute({ commands: [{ command: 'pwd' }, { executable: 'git', args: ['push'] }] }, { ...context, agent: 'build' }), /user denied/);
  assert.equal(received.length, 1, 'no command executes before all permissions succeed');
  assert.deepEqual(checks.map(check => check.resources[0]), ['pwd', 'git push']);
});

test('plugin registers three commands, five skills, Code Mode MCP, advisory tracking and safe plan fallback', async () => {
  const root = mkdtempSync(join(tmpdir(), 'opencode-adapter-'));
  try {
    const hooks = {}, commands = [], skills = [], servers = new Map();
    const agent = { permissions: nativeRules() };
    const prompts = [];
    let captured, checked = [];
    const mcp = { id: 'dotdotgod_context_execute', execute: async (input) => { captured = input; return { content: 'ok' }; } };
    const ctx = {
      app: { version: '2.1.2' }, location: { directory: root, project: { directory: root } },
      agent: { transform: async fn => fn({ update: (_id, fn) => fn(agent) }) },
      skill: { transform: async fn => fn({ get: () => undefined, add: value => skills.push(value) }) },
      command: { transform: async fn => fn({ add: value => commands.push(value) }) },
      mcp: { transform: async fn => fn({ get: name => servers.get(name), set: (name, value) => servers.set(name, value) }) },
      session: { get: async () => ({ location: { directory: root } }), prompt: async value => prompts.push(value), hook: async (name, fn) => (hooks[name] ??= []).push(fn) },
      tool: { transform: async fn => fn({ list: () => [mcp], update: (_id, fn) => fn(mcp) }), hook: async (name, fn) => (hooks[name] ??= []).push(fn) },
      permission: { assert: async value => checked.push(value) },
    };
    await plugin.setup(ctx);
    assert.deepEqual(commands.map(command => command.name), ['dd:load', 'dd:init', 'dd:impact']);
    assert.equal(skills.length, 5);
    assert.ok(skills.every(skill => skill.path.endsWith('SKILL.md')));
    const planning = skills.find(skill => skill.id === 'doc-first-planning').content;
    assert.match(planning, /automatically create or revise/);
    assert.doesNotMatch(planning, /in-chat checklist unless|dotdotgod query/);
    const loading = skills.find(skill => skill.id === 'project-load').content;
    assert.match(loading, /call project_load/);
    assert.doesNotMatch(loading, /`dotdotgod (?:query|map)/);
    assert.doesNotMatch(skills.find(skill => skill.id === 'impact-review').content, /dotdotgod graph impact <root>/);
    assert.match(skills.find(skill => skill.id === 'project-initializer').content, /Keep dryRun true initially/);
    assert.equal(servers.get('dotdotgod_context').codemode, true);
    await commands[0].execute({ sessionID: 'one', prompt: { text: '$& focus', files: [{ uri: 'file:///file' }], skills: ['one'] }, delivery: 'queue' });
    assert.match(prompts[0].text, /\$& focus/);
    assert.deepEqual(prompts[0].files, [{ uri: 'file:///file' }]);
    const event = { agent: 'plan', sessionID: 'one', messages: [{ role: 'user', content: [{ type: 'text', text: reminder }] }], system: [] };
    for (const hook of hooks.context) await hook(event);
    assert.match(event.messages[0].content[0].text, /automatically save/);
    writeFileSync(join(root, 'a.ts'), 'value');
    for (const hook of hooks['execute.after']) await hook({ tool: 'write', input: { path: 'a.ts' }, status: 'completed', sessionID: 'one' });
    assert.equal(new ImpactState(root, 'one').status().count, 1);
    for (const hook of hooks['execute.after']) await hook({ tool: 'write', input: { path: 'failed.ts' }, status: 'error', sessionID: 'one' });
    assert.equal(new ImpactState(root, 'one').status().count, 1);
    await mcp.execute({ commands: [{ command: 'git commit --dry-run' }], contextSessionId: 'spoof' }, { sessionID: 'one', agent: 'build', messageID: 'message', id: 'call' });
    assert.equal(captured.contextSessionId, 'one');
    assert.equal(checked.length, 1, 'host permission asserted, no pending-impact denial');
    assert.deepEqual(editedPaths('patch', { patchText: '*** Update File: a.ts\n*** Move to: b.ts' }), ['a.ts', 'b.ts']);
    const unsupported = { ...event, messages: [], system: [] };
    for (const hook of hooks.context) await hook(unsupported);
    assert.match(unsupported.system[0].text, /COMPATIBILITY/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
