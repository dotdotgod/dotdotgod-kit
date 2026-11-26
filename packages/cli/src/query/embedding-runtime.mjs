import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { DotdotgodServiceError } from '../commands/map.mjs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const EMBEDDING_RUNTIME_PACKAGE = '@huggingface/transformers';
export const EMBEDDING_RUNTIME_VERSION = '4.2.0';
export const MASKED_EMBEDDING_RUNTIME_LOCATION = '~/.dotdotgod/runtime/embedding';

export class EmbeddingRuntimeMissingError extends Error {
  constructor() { super('Optional local embedding runtime is not installed.'); this.name = 'EmbeddingRuntimeMissingError'; this.code = 'EMBEDDING_RUNTIME_MISSING'; }
}

export function embeddingRuntimeRoot(options = {}) { return join(options.home ?? homedir(), '.dotdotgod', 'runtime', 'embedding'); }

export function resolvePersistentTransformers(options = {}) {
  const root = embeddingRuntimeRoot(options);
  try {
    const require = createRequire(join(root, 'package.json'));
    return require.resolve(EMBEDDING_RUNTIME_PACKAGE);
  } catch { throw new EmbeddingRuntimeMissingError(); }
}

export function embeddingRuntimeStatus(options = {}) {
  const root = embeddingRuntimeRoot(options);
  try {
    const require = createRequire(join(root, 'package.json'));
    require.resolve(EMBEDDING_RUNTIME_PACKAGE);
    const packagePath = join(root, 'node_modules', ...EMBEDDING_RUNTIME_PACKAGE.split('/'), 'package.json');
    const version = JSON.parse(readFileSync(packagePath, 'utf8')).version;
    return { ok: true, installed: true, installAvailable: true, package: EMBEDDING_RUNTIME_PACKAGE, requiredVersion: EMBEDDING_RUNTIME_VERSION, packageVersion: version, location: root };
  } catch {
    return { ok: true, installed: false, installAvailable: true, package: EMBEDDING_RUNTIME_PACKAGE, requiredVersion: EMBEDDING_RUNTIME_VERSION, packageVersion: null, location: root };
  }
}

function acquireInstallLock(options) {
  const root = embeddingRuntimeRoot(options);
  const lock = join(root, '.installing');
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new DotdotgodServiceError('EMBEDDING_INSTALL_IN_PROGRESS', 'Embedding runtime installation is already in progress.');
    throw new DotdotgodServiceError('EMBEDDING_INSTALL_FAILED', 'Embedding runtime installation failed.');
  }
  return { root, lock };
}

function npmInstall({ npmCommand = 'npm', timeoutMs = 300_000 }, root) {
  return [npmCommand, ['install', '--prefix', root, '--save-exact', '--omit=dev', '--no-audit', '--no-fund', `${EMBEDDING_RUNTIME_PACKAGE}@${EMBEDDING_RUNTIME_VERSION}`], { timeout: timeoutMs, shell: false }];
}

function verifyInstallation(options, code, error) {
  if (error?.code === 'ENOENT') throw new DotdotgodServiceError('NPM_UNAVAILABLE', 'npm is unavailable.');
  if (error || code !== 0) throw new DotdotgodServiceError('EMBEDDING_INSTALL_FAILED', 'Embedding runtime installation failed.');
  const status = embeddingRuntimeStatus(options);
  if (!status.installed) throw new DotdotgodServiceError('EMBEDDING_INSTALL_UNVERIFIED', 'Embedding runtime installation could not be verified.');
  return { ...status, command: 'embedding install', modelDownloadPending: true };
}

function requireConfirmation(confirm) {
  if (confirm !== true) throw new DotdotgodServiceError('CONFIRMATION_REQUIRED', 'Embedding runtime installation requires explicit confirmation.');
}

export function installEmbeddingRuntime(options = {}) {
  requireConfirmation(options.confirm);
  const { root, lock } = acquireInstallLock(options);
  try {
    const [command, args, spawnOptions] = npmInstall(options, root);
    const result = (options.spawnImpl ?? spawnSync)(command, args, { ...spawnOptions, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return verifyInstallation(options, result.status, result.error);
  } finally { rmSync(lock, { force: true }); }
}

export async function installEmbeddingRuntimeAsync(options = {}) {
  const { signal, spawnImpl = spawn } = options;
  requireConfirmation(options.confirm);
  signal?.throwIfAborted();
  const { root, lock } = acquireInstallLock(options);
  try {
    const [command, args, { timeout, ...spawnOptions }] = npmInstall(options, root);
    let child;
    try { child = spawnImpl(command, args, { ...spawnOptions, stdio: 'ignore' }); }
    catch (error) { return verifyInstallation(options, null, error); }
    const abort = () => child.kill();
    // Node's spawn timeout can remain active after an ENOENT error and close.
    const timer = timeout > 0 ? setTimeout(abort, timeout) : undefined;
    const closed = new Promise((resolve) => {
      let error;
      child.on('error', (cause) => { error = cause; });
      child.once('close', (code) => resolve({ code, error }));
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let result;
    try { result = await closed; }
    finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    signal?.throwIfAborted();
    return { ...verifyInstallation(options, result.code, result.error), location: MASKED_EMBEDDING_RUNTIME_LOCATION };
  } finally {
    try { rmSync(lock, { force: true }); }
    catch { throw new DotdotgodServiceError('EMBEDDING_INSTALL_FAILED', 'Embedding runtime installation failed.'); }
  }
}

export function resolveTransformersModule(options = {}) {
  try {
    const entry = import.meta.resolve(EMBEDDING_RUNTIME_PACKAGE);
    if (existsSync(fileURLToPath(entry))) return entry;
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }
  return pathToFileURL(resolvePersistentTransformers(options)).href;
}

export async function importTransformers(options = {}) {
  try { return await import(EMBEDDING_RUNTIME_PACKAGE); }
  catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    const path = resolvePersistentTransformers(options);
    return import(pathToFileURL(path).href);
  }
}
