import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

function inputText() { return readFileSync(0, 'utf8'); }
function parseInput() { const text = inputText().trim(); return text ? JSON.parse(text) : {}; }
function projectRoot(input) { return resolve(input.cwd || input.project_dir || process.env.CLAUDE_PROJECT_DIR || process.cwd()); }
function sessionId(input) { return String(input.session_id || input.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_'); }
function statePath(input) { return join(projectRoot(input), '.dotdotgod', 'context', 'runtime', `${sessionId(input)}.json`); }
function readState(input) { try { return JSON.parse(readFileSync(statePath(input), 'utf8')); } catch { return { loadRequired: false, pending: {} }; } }
function writeState(input, state) {
  const path = statePath(input); mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`; writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`); renameSync(temp, path);
}
function fileHash(path) { try { return createHash('sha256').update(readFileSync(path)).digest('hex'); } catch { return 'missing'; } }
function toolName(input) { return String(input.tool_name || input.toolName || ''); }
function toolInput(input) { return input.tool_input || input.toolInput || {}; }
function mcpTool(name, suffix) { return name === suffix || name.endsWith(`__${suffix}`) || name.endsWith(`_${suffix}`); }
function deny(reason) { return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }; }
function commandFrom(input) { const value = toolInput(input); return String(value.command || value.cmd || ''); }
function isSubstantive(name) { return /^(Bash|Shell|local_shell|shell|shell_command|exec_command|Edit|Write|apply_patch)$/i.test(name); }
function isImpactGate(name, input) {
  if (!/^(Bash|Shell|local_shell|shell|shell_command|exec_command)$/i.test(name)) return false;
  return /(^|\s)(test|build|lint|verify|commit|push|publish|deploy)(\s|:|$)|\b(git\s+(commit|push)|npm\s+(test|publish)|pnpm\s+[^\n]*(test|build|lint|verify|publish))\b/i.test(commandFrom(input));
}
function changedPath(input) {
  const value = toolInput(input);
  const path = value.file_path || value.path;
  return typeof path === 'string' ? resolve(projectRoot(input), path) : null;
}

export function runHook(event) {
  const input = parseInput();
  const name = toolName(input);
  const state = readState(input);
  state.pending ||= {};

  if (event === 'sessionstart') {
    state.loadRequired = true;
    writeState(input, state);
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'Dotdotgod project memory has not been loaded for this session. Before substantive shell or write work, call dotdotgod_project_load once with a concise task-specific focus.' } };
  }

  if (event === 'pretooluse') {
    if (mcpTool(name, 'dotdotgod_project_load') || mcpTool(name, 'dotdotgod_project_impact')) return {};
    if (state.loadRequired && isSubstantive(name)) return deny('Project memory is required first. Call dotdotgod_project_load with the current project root and a concise task-specific focus, then retry this tool.');
    const pendingPaths = Object.keys(state.pending);
    if (pendingPaths.length && isImpactGate(name, input)) return deny(`Graph impact is pending. Call dotdotgod_project_impact with paths=${JSON.stringify(pendingPaths)} and then retry this tool.`);
    return {};
  }

  if (event === 'posttooluse') {
    if (mcpTool(name, 'dotdotgod_project_load')) state.loadRequired = false;
    else if (mcpTool(name, 'dotdotgod_project_impact')) {
      const checked = toolInput(input).paths;
      if (Array.isArray(checked)) for (const path of checked) {
        const absolute = resolve(projectRoot(input), path);
        if (state.pending[absolute] === fileHash(absolute)) delete state.pending[absolute];
      }
    } else if (/^(Edit|Write|apply_patch)$/i.test(name)) {
      const path = changedPath(input);
      if (path) state.pending[path] = fileHash(path);
    }
    writeState(input, state);
    return {};
  }

  return {};
}

export function hookMain(event) {
  try { process.stdout.write(`${JSON.stringify(runHook(event))}\n`); }
  catch (error) { process.stderr.write(`dotdotgod hook error: ${error instanceof Error ? error.message : String(error)}\n`); process.stdout.write('{}\n'); }
}
