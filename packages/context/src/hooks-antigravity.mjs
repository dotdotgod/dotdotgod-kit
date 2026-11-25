import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  extractHookSessionId, findInitializedRoot, hasFailedToolResult, isDotdotgodMcpTool,
  isInitializedProject, parseHookInput, readArtifactBounded, runHookSafely, selectWorkspaceForPath,
} from './hook-state.mjs';
import { ImpactState, impactReminder, resolveDocumentationRoot } from './impact-state.mjs';

const EDIT_TOOLS = new Set(['write_file', 'edit_file', 'write_to_file', 'replace_file_content', 'multi_replace_file_content']);
const MCP_SERVERS = new Set(['dotdotgod_context', 'dotdotgod-context']);
const MCP_PREFIXES = ['mcp__dotdotgod_context__', 'dotdotgod_context__', 'mcp__dotdotgod-context__'];

function planSyncReminder(docRoot) {
  return `[DOTDOTGOD PLAN SYNC — ADVISORY]\nObserved an updated Antigravity native plan artifact (implementation_plan.md).\nWhen workspace write permissions allow, save this concrete plan to\n${docRoot}/plan/<task-slug>/README.md and update ${docRoot}/plan/README.md using native file\nwrite tools (never via MCP execution or hooks). If writes are restricted or denied, keep\nthe native artifact and save after switching to a write-permitted mode.`;
}

function initializedWorkspaces(input) {
  if (Array.isArray(input?.workspacePaths) && input.workspacePaths.length > 0) {
    const out = new Set();
    for (const entry of input.workspacePaths) {
      if (typeof entry === 'string' && entry.trim() && isInitializedProject(entry)) out.add(resolve(entry));
    }
    return [...out];
  }
  const root = findInitializedRoot(input?.cwd);
  return root ? [root] : [];
}

function resolveTarget(raw, input) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  if (isAbsolute(raw)) return resolve(raw);
  if (typeof input?.cwd === 'string' && input.cwd.trim()) return resolve(input.cwd, raw);
  if (Array.isArray(input?.workspacePaths) && input.workspacePaths.length === 1 && typeof input.workspacePaths[0] === 'string' && input.workspacePaths[0].trim()) {
    return resolve(input.workspacePaths[0], raw);
  }
  return null;
}

function relativeInsideWorkspace(ws, target) {
  const rel = relative(resolve(ws), resolve(target)).replaceAll('\\', '/');
  if (rel && rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel)) return rel;
  try {
    const realRel = relative(realpathSync(ws), join(realpathSync(dirname(target)), basename(target))).replaceAll('\\', '/');
    if (realRel && realRel !== '..' && !realRel.startsWith('../') && !isAbsolute(realRel)) return realRel;
  } catch { /* outside or missing parent */ }
  return null;
}

function isPlanArtifactTarget(artifactDir, resolvedTarget) {
  if (typeof artifactDir !== 'string' || !artifactDir.trim()) return false;
  try {
    const expected = join(realpathSync(artifactDir), 'implementation_plan.md');
    return resolvedTarget === expected || join(realpathSync(dirname(resolvedTarget)), basename(resolvedTarget)) === expected;
  } catch { return false; }
}

function extractImpactCall(name, args) {
  if (name === 'call_mcp_tool') {
    if (!MCP_SERVERS.has(args.ServerName) || args.ToolName !== 'project_impact') return null;
    const mcpArgs = args.Arguments && typeof args.Arguments === 'object' ? args.Arguments : {};
    return { paths: mcpArgs.paths, root: mcpArgs.root };
  }
  return isDotdotgodMcpTool(name, 'project_impact', MCP_PREFIXES) ? { paths: args.paths, root: args.root } : null;
}

function handlePostToolUse(input, sessionId) {
  if (hasFailedToolResult(input)) return {};
  const call = input?.toolCall && typeof input.toolCall === 'object' ? input.toolCall : {};
  const name = typeof call.name === 'string' ? call.name : '';
  const args = call.args && typeof call.args === 'object' ? call.args : {};

  const impactCall = extractImpactCall(name, args);
  if (impactCall) {
    const paths = Array.isArray(impactCall.paths) ? impactCall.paths.filter((p) => typeof p === 'string' && p.trim()) : [];
    const workspaces = paths.length ? initializedWorkspaces(input) : [];
    const matched = typeof impactCall.root === 'string' && impactCall.root.trim() ? selectWorkspaceForPath(workspaces, impactCall.root) : null;
    if (matched) {
      new ImpactState(matched, sessionId).clearPaths(paths.map((p) => (isAbsolute(p) ? p : resolve(impactCall.root, p))));
    } else {
      for (const ws of workspaces) new ImpactState(ws, sessionId).clearPaths(paths);
    }
    return {};
  }

  if (!EDIT_TOOLS.has(name)) return {};
  const resolvedTarget = resolveTarget(args.TargetFile ?? args.Path ?? args.path, input);
  if (!resolvedTarget) return {};

  if (isPlanArtifactTarget(input.artifactDirectoryPath, resolvedTarget)) {
    const content = readArtifactBounded(input.artifactDirectoryPath, 'implementation_plan.md');
    if (content) {
      const hash = createHash('sha256').update(content).digest('hex');
      for (const ws of initializedWorkspaces(input)) new ImpactState(ws, sessionId).recordPlanNotice(hash);
    }
    return {};
  }

  const hasList = Array.isArray(input.workspacePaths) && input.workspacePaths.length > 0;
  const ws = hasList ? selectWorkspaceForPath(input.workspacePaths, resolvedTarget) : findInitializedRoot(input.cwd);
  if (!ws || !isInitializedProject(ws)) return {};
  const rel = relativeInsideWorkspace(ws, resolvedTarget);
  if (!rel) return {};
  const state = new ImpactState(ws, sessionId);
  if (rel.startsWith(`${resolveDocumentationRoot(ws)}/plan/`) && /\.md$/i.test(rel)) state.clearPlanNotice();
  else state.mark([rel]);
  return {};
}

function handlePreInvocation(input, sessionId) {
  const injectSteps = [];
  for (const ws of initializedWorkspaces(input)) {
    const state = new ImpactState(ws, sessionId);
    const claimed = state.claimUnnotified();
    if (claimed.count > 0) injectSteps.push({ systemMessage: { systemMessage: impactReminder(claimed) } });
    if (state.claimPlanNotice()) injectSteps.push({ systemMessage: { systemMessage: planSyncReminder(resolveDocumentationRoot(ws)) } });
  }
  return injectSteps.length ? { injectSteps } : {};
}

export function runAntigravityHook(event, rawInput) {
  const input = rawInput === undefined ? parseHookInput() : (typeof rawInput === 'string' ? parseHookInput(rawInput) : rawInput);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Hook stdin must be a JSON object.');
  const sessionId = extractHookSessionId(input);
  if (!sessionId) return {};
  if (event === 'posttooluse') return handlePostToolUse(input, sessionId);
  if (event === 'preinvocation') return handlePreInvocation(input, sessionId);
  return {};
}

export function hookMain(event) {
  runHookSafely(() => runAntigravityHook(event));
}
