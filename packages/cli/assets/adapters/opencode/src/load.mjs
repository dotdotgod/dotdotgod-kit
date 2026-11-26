import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isLocalSession } from './location.mjs';

const warnedHostSessions = new Set();

export async function isInitializedLocalSession(ctx, root, sessionID, runtime) {
  if (!runtime.isInitializedProject(root)) return false;
  // Project-scope installation itself can create the shared initialization sentinel.
  if (!lstatSync(join(root, 'dotdotgod.config.json'), { throwIfNoEntry: false })?.isFile()) {
    const entries = readdirSync(join(root, '.dotdotgod'));
    if (entries.length === 1 && entries[0] === 'adapters') return false;
  }
  try { runtime.validateSessionId(sessionID); }
  catch { return false; }
  return isLocalSession(ctx, sessionID);
}

export async function markProjectLoaded(ctx, root, sessionID, runtime) {
  try {
    if (await isInitializedLocalSession(ctx, root, sessionID, runtime)) new runtime.ImpactState(root, sessionID).markLoaded();
  } catch {
    // Advisory state must not turn a successful load into a tool error.
    process.stderr.write(`${runtime.formatDecisionError('state_error')}\n`);
  }
}

export async function registerLoad(ctx, root, runtime) {
  const { evaluateLoadDecision, formatDecisionError, formatDecisionInjection } = runtime;
  await ctx.session.hook('context', async event => {
    try {
      const { sessionID } = event;
      if (!await isInitializedLocalSession(ctx, root, sessionID, runtime)) return;

      const content = event.messages.findLast(message => message.role === 'user')?.content;
      const text = Array.isArray(content)
        ? content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n')
        : typeof content === 'string' ? content : '';
      const rawPrompt = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ').trim();
      if (!rawPrompt) return;

      const outcome = await evaluateLoadDecision({ root, rawPrompt, sessionId: sessionID, budgetMs: 15_000 });
      if (outcome.errorCode === 'provider_unsupported_on_host') {
        if (!warnedHostSessions.has(sessionID)) {
          warnedHostSessions.add(sessionID);
          process.stderr.write(`${formatDecisionError(outcome.errorCode)}\n`);
        }
      } else if (outcome.errorCode) {
        process.stderr.write(`${formatDecisionError(outcome.errorCode)}\n`);
      }
      const injection = formatDecisionInjection(outcome, { maxBytes: 8192 });
      if (injection) event.system.push({ type: 'text', text: injection });
    } catch {
      process.stderr.write(`${formatDecisionError('state_error')}\n`);
    }
  });
  await ctx.tool.hook('execute.after', async event => {
    if (event.status === 'completed' && event.tool === 'dotdotgod_context_project_load') {
      await markProjectLoaded(ctx, root, event.sessionID, runtime);
    }
  });
}
