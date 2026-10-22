import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isLocalSession } from './location.mjs';

const start = 'You are in Plan mode. Discuss the plan with the user directly in the conversation. Do not create or update plan files unless the user explicitly asks you to; when they do, write them only in:\n';
const end = '\nYou remain in Plan mode until the user switches agents. If the user asks you to implement changes, do not do so. Tell them they need to switch agents.';
const mutationRestriction = '\n\nDo not modify any other files or ask a subagent to do so.\n';

export function planGuidance(root) {
  return `You are in Plan mode. Discuss the plan with the user and automatically save a concrete implementation plan, without waiting for a separate file-save request, to:\n${join(root, 'docs/plan/<task-slug>/README.md')}\nUse a kebab-case task directory and English Markdown. Reuse and update the same task plan as decisions change; do not overwrite an unrelated task. Include scope, executable steps, verification and unresolved decisions. Save drafts with unresolved questions; initial clarification and explanation-only conversations need no file. Saving is not execution approval. Do not modify any other files or ask a subagent to do so. Remain in Plan mode until the user switches agents. If asked to implement, tell the user to switch agents first.`;
}

export function rewritePlanReminder(text, root) {
  const marker = text.indexOf(start);
  if (marker < 0) return { text, replaced: false };
  const finish = text.indexOf(end, marker + start.length);
  if (finish < 0) return { text, replaced: false };
  const section = text.slice(marker + start.length, finish);
  const path = section.endsWith(mutationRestriction) ? section.slice(0, -mutationRestriction.length) : section;
  if (!path.endsWith('/.opencode/plan') || path.includes('\n')) return { text, replaced: false };
  return { text: text.slice(0, marker) + planGuidance(root) + text.slice(finish + end.length), replaced: true };
}

// Replace the shipped exception in place, not at the end of the rules array.
// Later user/global/agent deny rules must continue to win.
export function redirectPlanPermissions(agent, root, home = homedir()) {
  const rules = agent.permissions;
  const index = rules.findIndex((rule, i) => rule.action === 'edit' && rule.effect === 'allow' &&
    rule.resource === join(home, '.opencode/plan/*') && rules[i - 1]?.action === 'edit' &&
    rules[i - 1]?.resource === '*' && rules[i - 1]?.effect === 'deny');
  if (index < 0) return false;
  rules.splice(index, 1, { action: 'edit', resource: `${resolve(root)}/docs/plan/*`, effect: 'allow' },
    { action: 'edit', resource: 'docs/plan/*', effect: 'allow' });
  return true;
}

export async function registerPlan(ctx, root) {
  // This is an explicit compatibility integration, not a public path setting.
  const supported = ctx.app.version.replace(/^v/, '') === '2.1.2';
  let redirected = false;
  if (supported) await ctx.agent.transform(editor => {
    redirected = false;
    editor.update('plan', agent => { redirected = redirectPlanPermissions(agent, root); });
  });
  await ctx.session.hook('context', async event => {
    if (event.agent !== 'plan' || !await isLocalSession(ctx, event.sessionID)) return;
    let replaced = false;
    if (supported && redirected) {
      for (const message of event.messages) {
        if (message.role !== 'user') continue;
        if (typeof message.content === 'string') {
          const result = rewritePlanReminder(message.content, root);
          message.content = result.text; replaced ||= result.replaced;
        } else if (Array.isArray(message.content)) {
          for (const part of message.content) if (part.type === 'text') {
            const result = rewritePlanReminder(part.text, root);
            part.text = result.text; replaced ||= result.replaced;
          }
        }
      }
    }
    if (replaced) event.system.push({ type: 'text', text: planGuidance(root) });
    else event.system.push({ type: 'text', text: '[DOTDOTGOD PLAN COMPATIBILITY] Automatic project-plan saving is unavailable for this OpenCode version/reminder or permission layout. Tell the user; retain native Plan restrictions and do not claim a plan was saved.' });
  });
}
