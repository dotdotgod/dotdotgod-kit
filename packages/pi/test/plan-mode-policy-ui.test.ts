import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import * as ui from '../extensions/plan-mode/policy/ui.ts';
import type { PolicyRuntime } from '../extensions/plan-mode/policy/runtime.ts';
import type { Invocation } from '../extensions/plan-mode/policy/invocation.ts';

function fixture(data: Record<string, unknown> = { planMode: {} }) {
 let trusted = true, confirms = 0;
 const runtime = {
  root: '/project', generation: 0, projectActive: false, error: undefined as string | undefined,
  project: { revision: 'revision-a', data, policy: { commands: [], markdown: { allow: data.planMode ? ['extra.md'] : [], deny: [] } } },
  refresh(_cwd: string) {},
  activateProject() { this.projectActive = true; this.generation++; },
 };
 const ctx = {
  cwd: '/project', hasUI: true, isProjectTrusted: () => trusted,
  ui: { confirm: async (_title: string, body: string) => { confirms++; assert.match(body, /revision-a|revision-b/); assert.match(body, /Cancel.*Activate/); return true; } },
 };
 return { runtime, ctx, trust(value: boolean) { trusted = value; }, get confirms() { return confirms; },
  ensure: () => ui.ensureProjectPolicy(ctx as unknown as ExtensionContext, runtime as unknown as PolicyRuntime) };
}

test('management export removed; exact revision activation uses runtime authority', async () => {
 assert.equal('managePolicy' in ui, false);
 const f = fixture();
 await f.ensure(); await f.ensure();
 assert.equal(f.runtime.projectActive, true);
 assert.equal(f.confirms, 1);
});

for (const data of [{ documentation: { root: 'knowledge' } }, { memory: { areas: [{ role: 'active-task-intent', paths: ['tasks/**'] }] } }, { memory: { areas: [{ role: 'active-task-intent', excludePaths: ['tasks/private/**'] }] } }]) {
 test(`custom project metadata prompts: ${JSON.stringify(data)}`, async () => {
  const f = fixture(data); await f.ensure(); assert.equal(f.runtime.projectActive, true);
 });
}

for (const scenario of ['no-ui', 'untrusted', 'invalid', 'empty', 'default-docs', 'active']) {
 test(`inactive/irrelevant project does not prompt: ${scenario}`, async () => {
  const f = fixture(scenario === 'empty' ? {} : scenario === 'default-docs' ? { documentation: { root: 'docs' } } : undefined);
  if (scenario === 'no-ui') f.ctx.hasUI = false;
  if (scenario === 'untrusted') f.trust(false);
  if (scenario === 'invalid') f.runtime.error = 'invalid config';
  if (scenario === 'active') f.runtime.projectActive = true;
  await f.ensure(); assert.equal(f.confirms, 0);
 });
}

test('declined revision is not nagged; revision or generation changes allow another prompt', async () => {
 const f = fixture(); let prompts = 0;
 f.ctx.ui.confirm = async () => { prompts++; return false; };
 await f.ensure(); await f.ensure(); assert.equal(prompts, 1);
 f.runtime.project.revision = 'revision-b'; await f.ensure(); assert.equal(prompts, 2);
 f.runtime.generation++; await f.ensure(); assert.equal(prompts, 3);
 assert.equal(f.runtime.projectActive, false);
});

for (const scenario of ['trust', 'root', 'generation', 'revision', 'invalid']) {
 test(`activation rejects changed ${scenario} after confirmation`, async () => {
  const f = fixture();
  f.ctx.ui.confirm = async () => {
   if (scenario === 'trust') f.trust(false);
   if (scenario === 'root') f.ctx.cwd = '/other';
   if (scenario === 'generation') f.runtime.generation++;
   if (scenario === 'revision') f.runtime.project.revision = 'revision-b';
   if (scenario === 'invalid') f.runtime.error = 'invalid config';
   return true;
  };
  f.runtime.refresh = (cwd: string) => { f.runtime.root = cwd; };
  await f.ensure(); assert.equal(f.runtime.projectActive, false);
 });
}

test('same pending context prompts only once and generation changes permit reactivation', async () => {
 const f = fixture(); let finish!: (value: boolean) => void, prompts = 0;
 f.ctx.ui.confirm = () => { prompts++; return new Promise<boolean>(resolve => { finish = resolve; }); };
 const first = f.ensure(); await f.ensure(); assert.equal(prompts, 1);
 finish(true); await first;
 f.runtime.projectActive = false; f.runtime.generation++;
 const second = f.ensure(); assert.equal(prompts, 2); finish(true); await second;
 assert.equal(f.runtime.projectActive, true);
});

test('command and path approvals retain deny, once, session and no-UI behavior', async () => {
 const invocation = { executable: '/bin/x', args: [], cwd: '/project', shell: false, reusable: true } as unknown as Invocation;
 let selected: string | undefined;
 const ctx = { hasUI: true, ui: { select: async () => selected } } as unknown as ExtensionContext;
 for (const [selection, expected] of [[undefined, 'deny'], ['Deny', 'deny'], ['Allow once', 'once'], ['Allow same invocation this session', 'session']] as const) {
  selected = selection; assert.equal(await ui.approveCommand(ctx, invocation), expected);
 }
 for (const [selection, expected] of [[undefined, 'deny'], ['Deny', 'deny'], ['Allow once', 'once'], ['Allow target for this session', 'session']] as const) {
  selected = selection; assert.equal(await ui.approvePath(ctx, 'extra.md'), expected);
 }
 const noUI = { hasUI: false } as ExtensionContext;
 assert.equal(await ui.approveCommand(noUI, invocation), 'deny');
 assert.equal(await ui.approvePath(noUI, 'extra.md'), 'deny');
});
