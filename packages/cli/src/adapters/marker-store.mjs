import { createHash } from 'node:crypto';
import { isAbsolute, join, resolve, win32 } from 'node:path';
import { adapterError, DotdotgodServiceError } from './errors.mjs';
import { createAdapterFs, requireProjectRoot } from './fs-safety.mjs';
import { runtimeIsPresent } from './runtime-binding.mjs';
import { ADAPTER_HOSTS, ADAPTER_SCHEMA_VERSION, UNSAFE_PATH_CHARS } from './types.mjs';

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validRelPath(path) {
  return typeof path === 'string' && !UNSAFE_PATH_CHARS.test(path) && !path.includes('\\')
    && !win32.isAbsolute(path) && !/^[A-Za-z]:/u.test(path)
    && path.split('/').every((part) => part && part !== '.' && part !== '..');
}

function runtimeFromMarker(runtime) {
  if (runtime?.mode === 'path' && runtime.command === 'dotdotgod') return { mode: 'path', command: 'dotdotgod' };
  if (runtime?.mode !== 'pinned') return null;
  const { nodePath, cliEntry } = runtime;
  if (![nodePath, cliEntry].every((path) => typeof path === 'string' && isAbsolute(path)
    && resolve(path) === path && !UNSAFE_PATH_CHARS.test(path))) return null;
  return { mode: 'pinned', nodePath, cliEntry };
}

function timestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value));
}

// Derive ownership roots from the request and execution context, never from stored paths.
export function createMarkerStore(ctx, { host, scope, root }) {
  if (!ADAPTER_HOSTS.includes(host) || host === 'pi') throw adapterError('INVALID_HOST');
  if (scope !== 'user' && !(scope === 'project' && host === 'opencode')) throw adapterError('INVALID_SCOPE');
  const { homeDir, cwd, env } = ctx;
  const base = scope === 'project' ? requireProjectRoot(root, ctx) : homeDir;
  const stateDir = resolve(base, '.dotdotgod/adapters/state');
  const markerPath = join(stateDir, `${host}.json`);
  const installDir = {
    'claude-code': resolve(homeDir, '.dotdotgod/adapters/claude-code'),
    codex: resolve(cwd, env.CODEX_HOME || join(homeDir, '.codex'), 'plugins/dotdotgod-marketplace'),
    antigravity: resolve(homeDir, '.gemini/config/plugins/dotdotgod'),
    opencode: resolve(base, '.dotdotgod/adapters/opencode'),
    hermes: resolve(homeDir, '.hermes/plugins/dotdotgod'),
  }[host];
  let configPaths = [];
  if (host === 'opencode' && scope === 'project') {
    configPaths = [join(base, 'opencode.jsonc'), join(base, 'opencode.json')];
  } else if (host === 'opencode') {
    const xdg = env.XDG_CONFIG_HOME ?? '';
    if (UNSAFE_PATH_CHARS.test(xdg)) throw adapterError('UNSAFE_PATH_CHARS', { runtime: true });
    const configHome = isAbsolute(xdg) ? xdg : resolve(homeDir, '.config');
    configPaths = [resolve(configHome, 'opencode/opencode.jsonc')];
  }
  const stateFs = createAdapterFs({ root: stateDir, homeDir });
  const installFs = createAdapterFs({ root: installDir, homeDir });

  function decode(marker) {
    const invalid = () => { throw adapterError('CONFIG_PARSE_ERROR', { target: markerPath }); };
    if (!object(marker) || marker.schemaVersion !== ADAPTER_SCHEMA_VERSION || marker.host !== host || marker.scope !== scope
      || marker.installDir !== installDir || (Object.hasOwn(marker, 'targetDir') && marker.targetDir !== installDir)
      || !['staging', 'installed'].includes(marker.phase) || !object(marker.managedFiles) || !Array.isArray(marker.sharedConfigEdits)
      || typeof marker.cliVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/u.test(marker.cliVersion)
      || !timestamp(marker.installedAt) || !timestamp(marker.updatedAt)) invalid();

    const runtime = runtimeFromMarker(marker.runtime);
    if (!runtime) invalid();
    installFs.inspect(installDir);
    const managedFiles = Object.fromEntries(Object.entries(marker.managedFiles).map(([relPath, file]) => {
      if (!validRelPath(relPath) || !object(file) || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(file.sha256)
        || !Number.isSafeInteger(file.size) || file.size < 0) invalid();
      const path = join(installDir, relPath);
      installFs.inspect(path);
      return [relPath, { sha256: file.sha256, size: file.size }];
    }));
    const sharedConfigEdits = marker.sharedConfigEdits.map((edit) => {
      const entry = scope === 'project' ? './.dotdotgod/adapters/opencode' : installDir;
      if (!object(edit) || !configPaths.includes(edit.path) || edit.kind !== 'plugins' || edit.entry !== entry) invalid();
      createAdapterFs({ root: edit.path, homeDir }).inspect(edit.path);
      return { path: edit.path, kind: edit.kind, entry };
    });
    return {
      schemaVersion: ADAPTER_SCHEMA_VERSION, phase: marker.phase, host, scope, installDir, cliVersion: marker.cliVersion,
      installedAt: marker.installedAt, updatedAt: marker.updatedAt, runtime, managedFiles, sharedConfigEdits,
    };
  }

  return {
    ctx, markerPath, stateDir, installDir, installFs, configPaths: Object.freeze(configPaths),
    read() {
      const snapshot = stateFs.read(markerPath);
      if (snapshot === null) return { snapshot, marker: null };
      let value;
      try {
        value = JSON.parse(snapshot.toString('utf8'));
      } catch {
        throw adapterError('CONFIG_PARSE_ERROR', { target: markerPath });
      }
      return { snapshot, marker: decode(value) };
    },
    write(marker, expected) {
      stateFs.writeAtomic(markerPath, JSON.stringify(decode(marker), null, 2) + '\n', expected);
    },
    remove(expected) {
      stateFs.removeFile(markerPath, expected);
    },
  };
}

function inspectManagedFiles(store) {
  const state = store.read();
  const missing = [];
  const modified = [];
  const snapshots = new Map();
  for (const [relPath, file] of Object.entries(state.marker?.managedFiles ?? {})) {
    const bytes = store.installFs.read(join(store.installDir, relPath));
    if (bytes === null) missing.push(relPath);
    else if (bytes.length !== file.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) modified.push(relPath);
    snapshots.set(relPath, bytes);
  }
  return { ...state, missing, modified, snapshots };
}

export function inspectManagedStatus(store, { legacy = false, coreVersion = store.ctx.coreVersion } = {}) {
  if (legacy) return { status: 'legacy-coexist' };
  try {
    const { marker, missing, modified } = inspectManagedFiles(store);
    if (!marker) {
      store.installFs.inspect(store.installDir);
      return { status: 'not-installed' };
    }
    const status = modified.length ? 'modified'
      : marker.phase === 'staging' || missing.length ? 'partial'
      : !runtimeIsPresent(marker.runtime, store.ctx) ? 'broken-runtime'
      : marker.cliVersion !== coreVersion ? 'version-drift' : 'installed';
    return { status, missing, modified, cliVersion: marker.cliVersion };
  } catch (error) {
    if (!(error instanceof DotdotgodServiceError)) throw error;
    return { status: 'modified', issue: error.code };
  }
}

export function assertNoManagedConflict(store, { legacy = false, plannedFiles = [] } = {}) {
  const target = store.installDir;
  if (legacy) throw adapterError('LEGACY_COEXIST_CONFLICT', { target });
  const { stat } = store.installFs.inspect(target);
  const state = inspectManagedFiles(store);
  if (stat && (!state.marker || !stat.isDirectory())) throw adapterError('UNMANAGED_CONFLICT', { target });
  if (state.modified.length) {
    throw adapterError('MODIFIED_CONFLICT', { target, affectedPaths: state.modified.map((path) => join(target, path)) });
  }
  for (const relPath of plannedFiles) {
    if (!validRelPath(relPath)) throw adapterError('PATH_OUTSIDE_ROOT');
    const path = join(target, relPath);
    if (!state.snapshots.has(relPath) && store.installFs.inspect(path).stat) {
      throw adapterError('UNMANAGED_CONFLICT', { target: path });
    }
  }
  return state;
}
