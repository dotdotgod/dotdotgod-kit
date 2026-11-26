import {
  ImpactState, evaluateLoadDecision, formatDecisionError, formatDecisionInjection, isInitializedProject, validateSessionId,
} from '../mcp/runtime.mjs';
import { isLocalSession } from './location.mjs';

const warnedHostSessions = new Set();

export async function isInitializedLocalSession(ctx, root, sessionID) {
  if (!isInitializedProject(root)) return false;
  try { validateSessionId(sessionID); }
  catch { return false; }
  return isLocalSession(ctx, sessionID);
}

export async function markProjectLoaded(ctx, root, sessionID) {
  try {
    if (await isInitializedLocalSession(ctx, root, sessionID)) new ImpactState(root, sessionID).markLoaded();
  } catch {
    // Advisory state must not turn a successful load into a tool error.
    process.stderr.write(`${formatDecisionError('state_error')}\n`);
  }
}

export async function registerLoad(ctx, root) {
  await ctx.session.hook('context', async event => {
    const { sessionID } = event;
    if (!await isInitializedLocalSession(ctx, root, sessionID)) return;

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
  });
  await ctx.tool.hook('execute.after', async event => {
    if (event.status === 'completed' && event.tool === 'dotdotgod_context_project_load') {
      await markProjectLoaded(ctx, root, event.sessionID);
    }
  });
}
