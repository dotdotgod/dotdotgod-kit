import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertPlanConfig, patchNativePlan, patchPlanCatalog, planProfile, planProfileName } from '../src/native-plan.mjs';

const native = readFileSync(new URL('../resources/NATIVE_PLAN.md', import.meta.url), 'utf8');

test('native plan exception preserves mode, questions, finalization and unrelated catalog metadata', () => {
  const result = patchNativePlan(native);
  assert.match(result, /only permitted project mutation.*docs\/plan/);
  assert.doesNotMatch(result, /You must not perform \*\*mutating\*\* actions/);
  for (const text of ['developer message explicitly ends it', 'request_user_input', '<proposed_plan>', 'Do not confuse it with Plan mode', 'Running formatters']) assert.ok(result.includes(text));
  assert.match(result, /without a separate save request/);
  assert.match(result, /Do not use MCP, hooks, subagents, or permission escalation/);
  const catalog = { models: [{ slug: 'chosen', priority: 7, model_messages: { instructions_template: 'keep', collaboration_modes: { default: 'keep default', plan: null } } }] };
  const patched = patchPlanCatalog(catalog, native);
  assert.equal(catalog.models[0].model_messages.collaboration_modes.plan, null);
  assert.equal(patched.models[0].priority, 7);
  assert.equal(patched.models[0].model_messages.instructions_template, 'keep');
  assert.equal(patched.models[0].model_messages.collaboration_modes.default, 'keep default');
  assert.equal(patched.models[0].model_messages.collaboration_modes.plan, result);
  assert.throws(() => patchPlanCatalog({ models: [{ slug: 'custom', model_messages: { collaboration_modes: { plan: 'user plan' } } }] }, native), /refusing/);
  assert.throws(() => patchNativePlan('unknown future template'), /Unsupported/);
});

test('setup refuses existing permission choices and keeps the write exception project-specific', () => {
  for (const key of ['sandbox_mode', 'sandbox_workspace_write', 'default_permissions', 'permissions', 'profile']) assert.throws(() => assertPlanConfig({ [key]: {} }), new RegExp(key));
  assert.throws(() => assertPlanConfig({ include_collaboration_mode_instructions: false }), /disabled/);
  assert.doesNotThrow(() => assertPlanConfig({ model_provider: 'keep', model_catalog_json: '/existing/catalog.json' }));
  const profile = planProfile('/project with spaces', '/project with spaces/.dotdotgod/catalog.json');
  assert.match(profile, /extends = ":read-only"/);
  assert.match(profile, /filesystem\."\/project with spaces"/);
  assert.match(profile, /"\." = "read"\n"docs\/plan" = "write"/);
  assert.doesNotMatch(profile, /danger-full-access|approval_policy|model_provider|:workspace_roots/);
  assert.notEqual(planProfileName('/a'), planProfileName('/b'));
});
