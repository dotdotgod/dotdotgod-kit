import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { adapterError, DotdotgodServiceError } from './errors.mjs';
import { createAdapterFs, requireProjectRoot } from './fs-safety.mjs';
import { UNSAFE_PATH_CHARS } from './types.mjs';

export const CODEX_PLAN_VERSION = '0.163.0';
const TIMEOUT_MS = 15000;
const nativePlan = new URL('../../assets/adapters/codex/NATIVE_PLAN.md', import.meta.url);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function patchNativePlan(source) {
  const before = 'You may explore and execute **non-mutating** actions that improve the plan. You must not perform **mutating** actions.';
  const forbidden = '* Editing or writing files\n';
  if (!source.includes(before) || !source.includes(forbidden)) throw adapterError('CONFIG_PARSE_ERROR');
  const exception = 'You may explore and execute **non-mutating** actions that improve the plan. The only permitted project mutation is writing planning documents inside `docs/plan/`; all other project mutations remain forbidden.';
  return source.replace(before, exception).replace(forbidden, '* Editing or writing files outside `docs/plan/`\n') + `

## Dotdotgod project plan storage

Automatically save a concrete implementation plan to \`docs/plan/<task-slug>/README.md\` without a separate save request. Use a kebab-case task directory and English Markdown. Reuse the same task document as decisions change. Initial clarification and explanation-only exchanges need no file.

Include scope, executable steps, verification, and unresolved decisions. Preserve unrelated plans; do not overwrite or delete another task. Keep the nearest plan README index current. Present the final decision-complete plan in the native <proposed_plan> block as usual.

Use native file tools or sandboxed commands for plan writes. Do not use MCP, hooks, subagents, or permission escalation to bypass restrictions. Existing denies and managed policy still apply. Saving a plan is not implementation approval; remain in Plan Mode until the user switches modes. If writing is denied, keep the plan in the conversation and report that it was not saved.
`;
}

function patchPlanCatalog(catalog, source) {
  if (!Array.isArray(catalog?.models) || !catalog.models.length) throw adapterError('CONFIG_PARSE_ERROR');
  const plan = patchNativePlan(source);
  for (const model of catalog.models) {
    if (!object(model) || typeof model.slug !== 'string' || !model.slug
      || (model.model_messages != null && !object(model.model_messages))
      || (model.model_messages?.collaboration_modes != null && !object(model.model_messages.collaboration_modes))) {
      throw adapterError('CONFIG_PARSE_ERROR');
    }
    const current = model.model_messages?.collaboration_modes?.plan;
    if (current != null && current !== source) throw adapterError('CODEX_CONFIG_CONFLICT');
    model.model_messages ??= {};
    model.model_messages.collaboration_modes ??= {};
    model.model_messages.collaboration_modes.plan = plan;
  }
  return catalog;
}

function planProfile(root, catalogPath) {
  return `# Generated opt-in profile for Codex ${CODEX_PLAN_VERSION}. No global defaults changed.
# Enter /plan after launch. Switching modes does not expand file permissions.
default_permissions = "dotdotgod-plan"
model_catalog_json = ${JSON.stringify(catalogPath)}

[permissions.dotdotgod-plan]
description = "Read-only workspace with writable docs/plan."
extends = ":read-only"

[permissions.dotdotgod-plan.filesystem.${JSON.stringify(root)}]
"." = "read"
"docs/plan" = "write"
`;
}

async function readConfig(binary, { cwd, env, signal, coreVersion }) {
  signal?.throwIfAborted();
  let child;
  try {
    child = spawn(binary, ['app-server', '--stdio'], { cwd, env, stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    throw adapterError('IO_ERROR');
  }
  const closed = new Promise((done) => child.once('close', done));
  const lines = createInterface({ input: child.stdout });
  let rejectRequest;
  let timer;
  const fail = () => rejectRequest(adapterError('IO_ERROR'));
  const abort = () => rejectRequest(signal.reason);
  try {
    return await new Promise((done, reject) => {
      rejectRequest = reject;
      const send = (value) => child.stdin.write(JSON.stringify(value) + '\n');
      let pending = 1;
      child.on('error', fail);
      child.stdin.on('error', fail);
      child.once('close', fail);
      timer = setTimeout(fail, TIMEOUT_MS);
      signal?.addEventListener('abort', abort, { once: true });
      lines.on('line', (line) => {
        try {
          const message = JSON.parse(line);
          if (message.id !== pending || pending === 0) return;
          if (message.error || !object(message.result)) return fail();
          if (pending === 1) {
            pending = 2;
            send({ method: 'initialized' });
            send({ id: 2, method: 'config/read', params: { cwd, includeLayers: true } });
          } else {
            pending = 0;
            if (!object(message.result.config)) return fail();
            done(message.result.config);
          }
        } catch {
          fail();
        }
      });
      if (signal?.aborted) return abort();
      send({ id: 1, method: 'initialize', params: {
        clientInfo: { name: 'dotdotgod-plan-setup', version: coreVersion }, capabilities: { experimentalApi: true },
      } });
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    lines.close();
    let kill;
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      // A child ignoring SIGTERM must not hold the CLI open past the cleanup window.
      kill = setTimeout(() => child.kill('SIGKILL'), 1000);
    }
    child.stdin.destroy();
    child.stdout.destroy();
    // Node emits close after a failed spawn too; wait for pipe cleanup on either path.
    await closed;
    clearTimeout(kill);
    child.off('error', fail);
    child.stdin.off('error', fail);
  }
}

function inspectDir(fs, path) {
  const { stat } = fs.inspect(path);
  if (stat && !stat.isDirectory()) throw adapterError('IO_ERROR', { target: path });
}

export async function setupCodexPlan(ctx, { root = '.', codex, catalog, confirm = false } = {}) {
  const { cwd, homeDir, signal } = ctx;
  if ([codex, catalog].some((path) => path !== undefined && UNSAFE_PATH_CHARS.test(path))) {
    throw adapterError('UNSAFE_PATH_CHARS');
  }
  root = requireProjectRoot(root, ctx);
  const home = resolve(cwd, ctx.env.CODEX_HOME || join(homeDir, '.codex'));
  const homeFs = createAdapterFs({ root: home, homeDir });
  inspectDir(homeFs, home);
  const env = { ...ctx.env, CODEX_HOME: home };
  const binary = codex?.includes('/') ? resolve(cwd, codex) : codex ?? 'codex';
  if ([binary, root].some((path) => UNSAFE_PATH_CHARS.test(path))) throw adapterError('UNSAFE_PATH_CHARS');
  const profile = `dotdotgod-plan-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`;
  const profilePath = join(home, `${profile}.config.toml`);
  const catalogPath = join(root, '.dotdotgod/codex-plan/models.json');
  const planDir = join(root, 'docs/plan');
  const projectFs = createAdapterFs({ root, homeDir });
  inspectDir(projectFs, planDir);
  if (homeFs.inspect(profilePath).stat || projectFs.inspect(catalogPath).stat) throw adapterError('CODEX_PLAN_EXISTS');

  signal?.throwIfAborted();
  let version;
  try {
    ({ stdout: version } = await promisify(execFile)(binary, ['--version'], { cwd: root, env, signal, timeout: TIMEOUT_MS, killSignal: 'SIGKILL' }));
  } catch {
    signal?.throwIfAborted();
    throw adapterError('CODEX_VERSION_MISMATCH');
  }
  if (version.trim() !== `codex-cli ${CODEX_PLAN_VERSION}`) throw adapterError('CODEX_VERSION_MISMATCH');
  const config = await readConfig(binary, { ...ctx, cwd: root, env });
  if (['sandbox_mode', 'sandbox_workspace_write', 'default_permissions', 'permissions', 'profile'].some((key) => config[key] != null)
    || config.include_collaboration_mode_instructions === false) throw adapterError('CODEX_CONFIG_CONFLICT');
  if (config.model_catalog_json != null && typeof config.model_catalog_json !== 'string') throw adapterError('CONFIG_PARSE_ERROR');
  const input = catalog !== undefined ? resolve(cwd, catalog) : resolve(root, config.model_catalog_json || join(home, 'models_cache.json'));
  let bytes;
  try {
    bytes = createAdapterFs({ root: input, homeDir }).read(input);
  } catch (error) {
    // An RPC-supplied catalog path is configuration data; expose only the file-safety code.
    if (catalog === undefined && config.model_catalog_json && error instanceof DotdotgodServiceError) {
      throw adapterError(error.code, { runtime: true });
    }
    throw error;
  }
  if (bytes === null) throw adapterError('IO_ERROR');
  let models;
  try {
    models = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw adapterError('CONFIG_PARSE_ERROR');
  }
  const patched = patchPlanCatalog(models, readFileSync(nativePlan, 'utf8'));

  if (confirm) {
    signal?.throwIfAborted();
    projectFs.mkdir(planDir);
    projectFs.mkdir(join(root, '.dotdotgod/codex-plan'));
    homeFs.mkdir(home);
    try {
      for (const [fs, path, contents] of [
        [projectFs, catalogPath, JSON.stringify(patched, null, 2) + '\n'],
        [homeFs, profilePath, planProfile(root, catalogPath)],
      ]) {
        fs.inspect(path);
        writeFileSync(path, contents, { flag: 'wx', mode: 0o600 });
      }
    } catch (error) {
      if (error.code === 'EEXIST') throw adapterError('CODEX_PLAN_EXISTS');
      if (error.code === 'SYMLINK_REJECTED') throw error;
      throw adapterError('IO_ERROR');
    }
  }
  return {
    dryRun: !confirm, root, codexVersion: CODEX_PLAN_VERSION, profile, profilePath, catalogPath, planDir, modelCount: patched.models.length,
    launch: [binary, '--no-daemon', '--profile', profile, '--cd', root],
    apply: ['dotdotgod', 'adapter', 'setup-plan', 'codex', root, ...(codex === undefined ? [] : ['--codex', binary]),
      ...(catalog === undefined ? [] : ['--catalog', input]), '--confirm'],
    next: 'Enter /plan in Codex. Permissions remain restricted after leaving Plan Mode.',
    boundary: '[EXECUTION BOUNDARY] Local native file/command policy only; MCP and hooks have separate execution boundaries.',
  };
}
