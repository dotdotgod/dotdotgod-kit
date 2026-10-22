import { createHash } from 'node:crypto';

export const CODEX_PLAN_VERSION = '0.163.0';

export function planProfileName(root) {
  return `dotdotgod-plan-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`;
}

export function patchNativePlan(source) {
  const before = 'You may explore and execute **non-mutating** actions that improve the plan. You must not perform **mutating** actions.';
  const forbidden = '* Editing or writing files\n';
  if (!source.includes(before) || !source.includes(forbidden)) throw new Error('Unsupported native Plan Mode template.');
  const exception = 'You may explore and execute **non-mutating** actions that improve the plan. The only permitted project mutation is writing planning documents inside `docs/plan/`; all other project mutations remain forbidden.';
  return source.replace(before, exception).replace(forbidden, '* Editing or writing files outside `docs/plan/`\n') + `

## Dotdotgod project plan storage

Automatically save a concrete implementation plan to \`docs/plan/<task-slug>/README.md\` without a separate save request. Use a kebab-case task directory and English Markdown. Reuse the same task document as decisions change. Initial clarification and explanation-only exchanges need no file.

Include scope, executable steps, verification, and unresolved decisions. Preserve unrelated plans; do not overwrite or delete another task. Keep the nearest plan README index current. Present the final decision-complete plan in the native <proposed_plan> block as usual.

Use native file tools or sandboxed commands for plan writes. Do not use MCP, hooks, subagents, or permission escalation to bypass restrictions. Existing denies and managed policy still apply. Saving a plan is not implementation approval; remain in Plan Mode until the user switches modes. If writing is denied, keep the plan in the conversation and report that it was not saved.
`;
}

export function patchPlanCatalog(catalog, nativePlan) {
  if (!catalog || !Array.isArray(catalog.models) || catalog.models.length === 0) throw new Error('Expected a full Codex catalog with a non-empty models array.');
  const patched = structuredClone(catalog);
  for (const model of patched.models) {
    if (typeof model.slug !== 'string') throw new Error('Catalog model is missing its slug.');
    const current = model.model_messages?.collaboration_modes?.plan;
    if (current != null && current !== nativePlan) throw new Error(`Custom Plan Mode instructions already exist for ${model.slug}; refusing to replace them.`);
    model.model_messages ??= {};
    model.model_messages.collaboration_modes ??= {};
    model.model_messages.collaboration_modes.plan = patchNativePlan(nativePlan);
  }
  return patched;
}

export function assertPlanConfig(config) {
  for (const key of ['sandbox_mode', 'sandbox_workspace_write', 'default_permissions', 'permissions', 'profile']) {
    if (config[key] != null) throw new Error(`Existing ${key} needs manual integration; no settings were replaced.`);
  }
  if (config.include_collaboration_mode_instructions === false) throw new Error('Native collaboration instructions are disabled.');
}

export function planProfile(root, catalogPath) {
  const quote = JSON.stringify;
  return `# Generated opt-in profile for Codex ${CODEX_PLAN_VERSION}. No global defaults changed.
# Enter /plan after launch. Switching modes does not expand file permissions.
default_permissions = "dotdotgod-plan"
model_catalog_json = ${quote(catalogPath)}

[permissions.dotdotgod-plan]
description = "Read-only workspace with writable docs/plan."
extends = ":read-only"

[permissions.dotdotgod-plan.filesystem.${quote(root)}]
"." = "read"
"docs/plan" = "write"
`;
}
