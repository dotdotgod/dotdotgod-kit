import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { setupCodexPlan as setupPlan } from './codex-plan.mjs';
import { adapterError, DotdotgodServiceError } from './errors.mjs';
import { createAdapterFs, requireProjectRoot } from './fs-safety.mjs';
import { detectAntigravityLegacy, renderAntigravityFiles } from './hosts/antigravity.mjs';
import { detectClaudeCodeLegacy, renderClaudeCodeFiles } from './hosts/claude-code.mjs';
import { detectCodexLegacy, renderCodexFiles } from './hosts/codex.mjs';
import { detectHermesLegacy, renderHermesFiles } from './hosts/hermes.mjs';
import { inspectOpenCodeConfig, openCodeFiles } from './hosts/opencode.mjs';
import { assertNoManagedConflict, createMarkerStore, inspectManagedStatus } from './marker-store.mjs';
import { createOptionalSkillStore } from './optional-skills.mjs';
import { bindRuntime } from './runtime-binding.mjs';
import { ADAPTER_HOSTS, ADAPTER_SCHEMA_VERSION, UNSAFE_PATH_CHARS } from './types.mjs';

const hosts = {
  'claude-code': [renderClaudeCodeFiles, detectClaudeCodeLegacy],
  codex: [renderCodexFiles, detectCodexLegacy],
  antigravity: [renderAntigravityFiles, detectAntigravityLegacy],
  hermes: [renderHermesFiles, detectHermesLegacy],
  opencode: [openCodeFiles],
};

function result(command, fields) {
  return { schemaVersion: ADAPTER_SCHEMA_VERSION, ok: true, command, ...fields };
}

function validate(ctx, command, { host, scope, root, withSkills, codex, catalog }) {
  if (host === 'obsidian') throw adapterError('OBSIDIAN_UNSUPPORTED', {
    recovery: [{ comment: 'Install from the Dotdotgod Obsidian release: https://github.com/dotdotgod/dotdotgod-kit/releases', argv: [] }],
  });
  if (command === 'setup-plan' ? host !== 'codex' : !(ADAPTER_HOSTS.includes(host) || (command === 'status' && host === undefined))) {
    throw adapterError('INVALID_HOST');
  }
  if ([root, codex, catalog].some((path) => path !== undefined && UNSAFE_PATH_CHARS.test(path))) {
    throw adapterError('UNSAFE_PATH_CHARS');
  }
  if (host === 'pi' && command !== 'status' && !withSkills) throw adapterError('PI_REQUIRES_WITH_SKILLS', {
    recovery: [{ argv: ['pi', 'install', 'npm:@dotdotgod/pi'] }],
  });
  if (command === 'setup-plan') return { host, root };
  const inspectOpenCode = host === 'opencode' || host === undefined;
  scope ??= inspectOpenCode ? 'project' : 'user';
  if (scope !== 'user' && !(inspectOpenCode && scope === 'project')) throw adapterError('INVALID_SCOPE');
  if (scope === 'user' && root !== undefined) throw adapterError('INVALID_ROOT', {
    recovery: [{ comment: '--root is only valid for project-scoped OpenCode. Use dotdotgod init for project initialization.', argv: [] }],
  });
  return { host, scope, root: scope === 'project' ? requireProjectRoot(root ?? '.', ctx) : undefined };
}

function inspectHost(store, request) {
  if (request.host !== 'opencode') return { legacy: hosts[request.host][1](store) };
  const { marker, snapshot } = store.read();
  if (marker?.sharedConfigEdits.length > 1) throw adapterError('CONFIG_PARSE_ERROR', { target: store.markerPath });
  const config = inspectOpenCodeConfig(store, { scope: request.scope, marker });
  return { config, owned: marker?.sharedConfigEdits[0], legacy: config.legacy, configOwnerSnapshot: snapshot };
}

function assertSameOwner(store, expected, actual) {
  if (!isDeepStrictEqual(expected, actual)) throw adapterError('CONCURRENT_MODIFICATION', { target: store.markerPath });
}

function writeStaging(store, marker, expected) {
  store.write(marker, expected);
  const state = store.read();
  assertSameOwner(store, marker, state.marker);
  return state.snapshot;
}

function removeFiles(ctx, store, snapshots, keep) {
  const dirs = new Set();
  for (const [rel, bytes] of snapshots) {
    if (keep?.has(rel)) continue;
    ctx.signal?.throwIfAborted();
    const path = join(store.installDir, rel);
    store.installFs.removeFile(path, bytes);
    for (let dir = dirname(path); dir !== store.installDir; dir = dirname(dir)) dirs.add(dir);
  }
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) store.installFs.removeEmptyDir(dir);
  if (!keep) createAdapterFs({ root: dirname(store.installDir), homeDir: ctx.homeDir }).removeEmptyDir(store.installDir);
}

function untouchedConfig(ctx, host) {
  if (host === 'codex') return [resolve(ctx.cwd, ctx.env.CODEX_HOME || join(ctx.homeDir, '.codex'), 'config.toml')];
  if (host === 'hermes') return [join(ctx.homeDir, '.hermes/config.yaml')];
  return [];
}

export async function installAdapter(ctx, options = {}) {
  const request = validate(ctx, 'install', options);
  const { host } = request;
  const { dryRun = false, usePath, withSkills } = options;
  ctx.signal?.throwIfAborted();
  if (host === 'pi') return changePiSkills(ctx, request, dryRun, 'install');

  const runtime = bindRuntime(ctx, { usePath });
  const files = hosts[host][0](runtime.binding, ctx);
  const store = createMarkerStore(ctx, request);
  const { config, owned, legacy, configOwnerSnapshot } = inspectHost(store, request);
  const { marker, snapshot, snapshots } = assertNoManagedConflict(store, { legacy, plannedFiles: [...files.keys()] });
  if (config) assertSameOwner(store, configOwnerSnapshot, snapshot);
  const edit = config?.plan('install');
  if (edit?.present && !owned) throw adapterError('UNMANAGED_CONFLICT', { target: edit.path });
  const skills = withSkills ? createOptionalSkillStore(ctx, request).planInstall() : null;
  const changed = [...files].filter(([rel, bytes]) => !snapshots.get(rel)?.equals(bytes));
  const obsolete = [...snapshots].filter(([rel, bytes]) => !files.has(rel) && bytes !== null);
  const update = marker?.phase !== 'installed' || marker.cliVersion !== ctx.coreVersion
    || JSON.stringify(marker.runtime) !== JSON.stringify(runtime.binding)
    || changed.length > 0 || [...snapshots.keys()].some((rel) => !files.has(rel)) || Boolean(edit?.bytes);
  const changes = [
    { action: changed.length ? (marker ? 'update' : 'create') : 'skip', path: store.installDir, fileCount: changed.length },
    ...obsolete.map(([rel]) => ({ action: 'remove', path: join(store.installDir, rel) })),
    ...(edit?.bytes ? [{ action: edit.snapshot ? 'update' : 'create', path: edit.path, detail: 'add plugins entry' }] : []),
    ...(skills?.changes ?? []),
    { action: marker ? (update ? 'update' : 'skip') : 'create', path: store.markerPath },
  ];

  if (!dryRun) {
    // Synchronous probes and reads can leave an OS signal queued until the event loop runs.
    await setImmediate();
    ctx.signal?.throwIfAborted();
    if (update) {
      const now = new Date().toISOString();
      const managedFiles = Object.fromEntries([...files].map(([rel, bytes]) => [rel, {
        sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length,
      }]));
      const next = { schemaVersion: ADAPTER_SCHEMA_VERSION, phase: 'staging', host, scope: request.scope, installDir: store.installDir,
        cliVersion: ctx.coreVersion, installedAt: marker?.installedAt ?? now, updatedAt: now,
        runtime: runtime.binding, managedFiles: { ...marker?.managedFiles, ...managedFiles }, sharedConfigEdits: owned ? [owned] : [] };
      let staged = writeStaging(store, next, snapshot);
      for (const [rel, bytes] of changed) {
        ctx.signal?.throwIfAborted();
        store.installFs.writeAtomic(join(store.installDir, rel), bytes, snapshots.get(rel) ?? null);
      }
      removeFiles(ctx, store, snapshots, files);
      if (edit) {
        config.apply(edit);
        // Do not claim a new link before the snapshot-checked edit succeeds.
        if (!owned) {
          next.sharedConfigEdits = [config.edit];
          staged = writeStaging(store, next, staged);
        }
      }
      ctx.signal?.throwIfAborted();
      skills?.apply();
      store.write({ ...next, phase: 'installed', managedFiles }, staged);
    } else {
      skills?.apply();
    }
  }
  return result('install', { ...request, dryRun, installDir: store.installDir, runtime: runtime.binding,
    nodeVersion: runtime.nodeVersion, resolvedCli: runtime.resolvedCli, changes, warnings: runtime.warnings,
    untouchedConfig: untouchedConfig(ctx, host) });
}

export async function uninstallAdapter(ctx, options = {}) {
  const request = validate(ctx, 'uninstall', options);
  const { host } = request;
  const { dryRun = false, withSkills = false } = options;
  ctx.signal?.throwIfAborted();
  if (host === 'pi') return changePiSkills(ctx, request, dryRun, 'uninstall');

  const store = createMarkerStore(ctx, request);
  const { config, owned, legacy, configOwnerSnapshot } = inspectHost(store, request);
  const { marker, snapshot, snapshots } = assertNoManagedConflict(store, { legacy });
  if (config) assertSameOwner(store, configOwnerSnapshot, snapshot);
  const edit = owned && config.plan('uninstall');
  const skills = createOptionalSkillStore(ctx, request).planUninstall({ withSkills });
  const changes = [
    ...(edit?.bytes ? [{ action: 'update', path: edit.path, detail: 'remove plugins entry' }] : []),
    ...(marker ? [{ action: 'remove', path: store.installDir, fileCount: [...snapshots.values()].filter(Boolean).length }] : []),
    ...skills.changes,
    ...(marker ? [{ action: 'remove', path: store.markerPath }] : []),
  ];
  if (!dryRun) {
    await setImmediate();
    ctx.signal?.throwIfAborted();
    if (marker) assertSameOwner(store, snapshot, store.read().snapshot);
    if (edit) config.apply(edit);
    if (marker) removeFiles(ctx, store, snapshots);
    ctx.signal?.throwIfAborted();
    skills.apply();
    if (marker) store.remove(snapshot);
  }
  return result('uninstall', { ...request, dryRun, withSkills, changes, preserved: skills.preserved, warnings: skills.warnings });
}

async function changePiSkills(ctx, request, dryRun, command) {
  const store = createOptionalSkillStore(ctx, request);
  const plan = command === 'install' ? store.planInstall() : store.planUninstall({ withSkills: true });
  if (!dryRun) {
    await setImmediate();
    ctx.signal?.throwIfAborted();
    plan.apply();
  }
  return result(command, { ...request, dryRun, withSkills: true, changes: plan.changes,
    preserved: plan.preserved, warnings: plan.warnings, untouchedConfig: [] });
}

function hostStatus(ctx, request) {
  const { host, scope, root } = request;
  const argv = ['dotdotgod', 'adapter', 'install', host, ...(root ? ['--root', root] :
    host === 'opencode' ? ['--scope', 'user'] : []), ...(host === 'pi' ? ['--with-skills'] : [])];
  let info, skills, store, runtime, total;
  try {
    skills = createOptionalSkillStore(ctx, request).status();
    if (host === 'pi') info = { status: skills.status, issue: skills.issue };
    else {
      store = createMarkerStore(ctx, request);
      const { legacy, config, owned } = inspectHost(store, request);
      info = inspectManagedStatus(store, { legacy });
      if (!legacy && !info.issue) {
        const { marker } = store.read();
        runtime = marker?.runtime;
        total = marker && Object.keys(marker.managedFiles).length;
        if (marker && config && !config.present && info.status !== 'modified') info = { ...info, status: 'partial', issue: 'Missing plugins entry' };
        if (config?.present && !owned) info = { ...info, status: 'modified', issue: 'UNMANAGED_CONFLICT' };
      }
    }
  } catch (error) {
    if (!(error instanceof DotdotgodServiceError)) throw error;
    info = { status: 'modified', issue: error.code };
  }
  const detail = info.issue ?? ({
    installed: host === 'pi' ? 'optional skills only (adapter via pi)' : `${runtime?.mode} v${info.cliVersion}; skills: ${skills?.status}`,
    'not-installed': '-', 'broken-runtime': 'Runtime unavailable; reinstall to rebind.',
    'version-drift': `${runtime?.mode} v${info.cliVersion} (core v${ctx.coreVersion})`,
    partial: host === 'pi' ? 'Missing optional skill files' : info.missing?.length ? `missing ${info.missing.length}/${total} managed files` : 'Installation was interrupted',
    modified: host === 'pi' ? 'Optional skill files changed locally' : `${info.modified?.length} managed files changed locally`,
    'legacy-coexist': 'Legacy adapter detected',
  })[info.status];
  const comment = ({ 'legacy-coexist': 'Remove the legacy adapter first, then reinstall:',
    modified: 'Inspect and resolve conflicts first, then reinstall:' })[info.status];
  const recovery = ['installed', 'not-installed'].includes(info.status) ? [] : [{ ...(comment && { comment }), argv }];
  return { host, scope, ...info, detail, recovery, runtime, skills, installDir: store?.installDir };
}

export function getAdapterStatus(ctx, options = {}) {
  const { host, scope, root } = validate(ctx, 'status', options);
  const selected = host ? [host] : ADAPTER_HOSTS;
  const inspected = selected.map((id) => {
    ctx.signal?.throwIfAborted();
    return hostStatus(ctx, id === 'opencode' ? { host: id, scope, root } : { host: id, scope: 'user' });
  });
  return result('status', { coreVersion: ctx.coreVersion, nodeVersion: process.versions.node,
    opencodeInspected: selected.includes('opencode') ? { scope, root: root ?? ctx.homeDir } : null, hosts: inspected, warnings: [] });
}

export async function setupCodexPlan(ctx, options = {}) {
  const { host, root } = validate(ctx, 'setup-plan', options);
  return result('setup-plan', { host, ...await setupPlan(ctx, { ...options, root }) });
}
