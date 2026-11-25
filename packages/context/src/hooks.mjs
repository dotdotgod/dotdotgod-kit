import { resolve } from 'node:path';
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
const SESSION_START_ADVICE = 'For relevant project memory, consider calling project_load from the dotdotgod-context MCP server with a concise task-specific focus.';

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

export function runHook(event, input = parseHookInput()) {
  const kind = String(event ?? '').trim().toLowerCase();
  if (kind === 'pretooluse') return {};

  const root = resolveProjectRoot(input);
  if (!root) return {};

  if (kind === 'sessionstart') {
    return advisory('SessionStart', SESSION_START_ADVICE);
  }

  const sessionId = extractHookSessionId(input);
  if (!sessionId) return {};

  if (kind === 'userpromptsubmit') {
    const status = new ImpactState(root, sessionId).status();
    return status.count > 0 ? advisory('UserPromptSubmit', impactReminder(status)) : {};
  }

  if (kind === 'posttooluse') {
    if (hasFailedToolResult(input)) return {};
    const name = String(input.tool_name ?? input.toolName ?? '');
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
  runHookSafely(() => runHook(event));
}
