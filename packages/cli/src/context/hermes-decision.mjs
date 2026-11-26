// One decision per process; Hermes owns the conversation state in memory.
import { evaluateLoadDecision, formatDecisionError, formatDecisionInjection } from './decision.mjs';

function loadStatePort(state) {
  let inflight;
  function finish(token, lastPromptHash, update) {
    if (!inflight || inflight !== token || state.loaded) return false;
    inflight = undefined;
    Object.assign(state, update, { lastPromptHash });
    return true;
  }
  return {
    getLoadState: () => state,
    beginLoadAssessment(promptHash) {
      if (inflight || state.loaded || state.notified || state.skipCount >= 5 || state.lastPromptHash === promptHash) return undefined;
      inflight = Symbol();
      return { token: inflight, skipCount: state.skipCount };
    },
    recordLoadSkip(token, promptHash) {
      const skipCount = state.skipCount + 1;
      const terminal = skipCount >= 5;
      return finish(token, promptHash, { skipCount, ...(terminal ? { assessed: true, notified: true } : {}) })
        ? { recorded: true, terminal, skipCount } : { recorded: false };
    },
    completeLoadNotified: (token, promptHash) => finish(token, promptHash, { assessed: true, notified: true }),
    completeLoadPrefetch: (token, promptHash) => finish(token, promptHash, { assessed: true, loaded: true, notified: true }),
    claimAdvisedOnce() {
      if (state.loaded || state.notified) return false;
      inflight = undefined;
      Object.assign(state, { assessed: true, notified: true });
      return true;
    },
    markLoaded() {
      inflight = undefined;
      Object.assign(state, { assessed: true, loaded: true, notified: true });
    },
  };
}

export async function runHermesDecision({ root, rawPrompt, sessionState, budgetMs }) {
  try {
    const outcome = await evaluateLoadDecision({ root, rawPrompt, state: loadStatePort(sessionState), budgetMs });
    const text = formatDecisionInjection(outcome, { maxBytes: 8192 });
    const errorLine = outcome.errorCode ? formatDecisionError(outcome.errorCode) : null;
    return { ok: true, outcome, text, errorLine, state: sessionState };
  } catch {
    return { ok: false, errorLine: formatDecisionError('state_error') };
  }
}
