import { resolve } from 'node:path';
import { resolveDecisionProfile } from '../decision/config.mjs';
import { evaluateLoadDecision, formatDecisionError, formatDecisionInjection } from './decision.mjs';
import {
  extractHookSessionId,
  findInitializedRoot,
  hasFailedToolResult,
  isDotdotgodMcpTool,
  isInitializedProject,
  parseApplyPatchPaths,
  parseHookInput,
  runHookSafely,
} from './hook-state.mjs';
import { ImpactState, impactReminder } from './impact-state.mjs';

const MCP_PREFIXES = [
  'mcp__dotdotgod_context__',
  'mcp__dotdotgod-context__',
  'mcp__plugin_dotdotgod_dotdotgod-context__',
  'mcp__plugin_dotdotgod_dotdotgod_context__',
];
const EDIT_TOOL_RE = /^(?:Edit|Write|MultiEdit|apply_patch)$/i;

function resolveProjectRoot(input) {
  const declared = input.project_dir || process.env.CLAUDE_PROJECT_DIR;
  if (typeof declared === 'string' && declared.trim() && isInitializedProject(declared)) {
    return resolve(declared);
  }
  return findInitializedRoot(input.cwd);
}

function extractEditPaths(name, rawInput) {
  if (/^apply_patch$/i.test(name)) {
    if (typeof rawInput === 'string') return parseApplyPatchPaths(rawInput);
    if (rawInput && typeof rawInput === 'object') {
      const patchText = rawInput.patch ?? rawInput.input ?? rawInput.diff;
      if (typeof patchText === 'string') {
        const parsed = parseApplyPatchPaths(patchText);
        if (parsed.length) return parsed;
      }
      const single = rawInput.file_path ?? rawInput.path;
      return typeof single === 'string' && single.trim() ? [single] : [];
    }
    return [];
  }
  if (!rawInput || typeof rawInput !== 'object') return [];
  const single = rawInput.file_path ?? rawInput.path;
  return typeof single === 'string' && single.trim() ? [single] : [];
}

function advisory(hookEventName, additionalContext) {
  return additionalContext ? { hookSpecificOutput: { hookEventName, additionalContext } } : {};
}

function decisionContext(outcome) {
  if (outcome.errorCode) process.stderr.write(`${formatDecisionError(outcome.errorCode)}\n`);
  return formatDecisionInjection(outcome, { maxBytes: 8192 });
}

export async function runHook(event, input = parseHookInput()) {
  const kind = String(event ?? '').trim().toLowerCase();
  if (kind === 'pretooluse') return {};

  const root = resolveProjectRoot(input);
  if (!root) return {};

  if (kind === 'sessionstart') {
    const { profile } = resolveDecisionProfile(root);
    if (!profile) return advisory('SessionStart', decisionContext({ kind: 'advisory', errorCode: 'config_invalid' }));
    if (profile.mode === 'advisory') return advisory('SessionStart', decisionContext({ kind: 'advisory' }));
    if (profile.mode === 'always') {
      return advisory('SessionStart', decisionContext({ kind: 'advice', action: 'full', refs: [] }).replaceAll('\n', ' '));
    }
    return {};
  }

  const sessionId = extractHookSessionId(input);
  if (!sessionId) return {};

  if (kind === 'userpromptsubmit') {
    const { profile } = resolveDecisionProfile(root);
    const rawPrompt = input.prompt ?? input.user_prompt ?? input.message ?? '';
    const mode = profile?.mode;
    let context;
    // Let the evaluator handle explicit load commands even in advisory and manual modes.
    if (!mode || mode === 'model' || mode === 'always' || (typeof rawPrompt === 'string' && rawPrompt.trimStart().startsWith('/'))) {
      const outcome = await evaluateLoadDecision({ root, rawPrompt, sessionId, budgetMs: 22_000 });
      // Regular advisory guidance belongs to SessionStart; model fallback may still be advisory.
      if (mode !== 'advisory' || outcome.errorCode) context = decisionContext(outcome);
    }
    const reminder = impactReminder(new ImpactState(root, sessionId).status());
    return advisory('UserPromptSubmit', [context, reminder].filter(Boolean).join('\n\n'));
  }

  if (kind === 'posttooluse') {
    if (hasFailedToolResult(input)) return {};
    const name = String(input.tool_name ?? input.toolName ?? '');
    if (isDotdotgodMcpTool(name, 'project_load', MCP_PREFIXES)) {
      new ImpactState(root, sessionId).markLoaded();
      return {};
    }
    const rawToolInput = input.tool_input ?? input.toolInput;
    if (isDotdotgodMcpTool(name, 'project_impact', MCP_PREFIXES)) {
      const paths = Array.isArray(rawToolInput?.paths) ? rawToolInput.paths : [];
      if (paths.length) new ImpactState(root, sessionId).clearPaths(paths);
      return {};
    }
    if (!EDIT_TOOL_RE.test(name)) return {};
    const paths = extractEditPaths(name, rawToolInput);
    if (!paths.length) return {};
    const state = new ImpactState(root, sessionId);
    const { becameNonEmpty } = state.mark(paths);
    return becameNonEmpty ? advisory('PostToolUse', impactReminder(state.status())) : {};
  }

  return {};
}

export function hookMain(event) {
  return runHookSafely(() => runHook(event));
}
