import { spawnSync } from 'node:child_process';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, relative, resolve, sep } from 'node:path';
import { shellQuote } from '../primitives.mjs';
import { adapterError, DotdotgodServiceError } from './errors.mjs';
import { createAdapterFs } from './fs-safety.mjs';
import { UNSAFE_PATH_CHARS } from './types.mjs';

const RECOVERY = [{ argv: ['npm', 'install', '-g', '@dotdotgod/cli'] }];
const USE_PATH_RISK = Object.freeze({
  code: 'USE_PATH_RISK',
  detail: 'GUI hosts may have a minimal PATH, and writable PATH directories increase PATH hijacking risk.',
});

function runtimeError(code) {
  return adapterError(code, { recovery: RECOVERY, runtime: true });
}

function checkControls(path) {
  if (UNSAFE_PATH_CHARS.test(path)) throw runtimeError('UNSAFE_PATH_CHARS');
}

function checkPersistent(path) {
  const parts = path.split(sep);
  const tempPath = resolve(tmpdir());
  let canonicalTemp = tempPath;
  try {
    canonicalTemp = realpathSync(tempPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw runtimeError('IO_ERROR');
  }
  const temporary = [tempPath, canonicalTemp].some((root) => {
    const rel = relative(root, path);
    return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
  });
  if (temporary
    || parts.some((part, i) => part === '_npx' || /^bunx(?:-|$)/u.test(part)
      || (part === 'dlx' && (['pnpm', 'yarn', '.yarn'].includes(parts[i - 1])
        || (parts[i - 1] === 'berry' && ['yarn', '.yarn'].includes(parts[i - 2])))))) {
    throw runtimeError('EPHEMERAL_RUNTIME_PATH');
  }
}

function checkRuntimePath(path) {
  checkControls(path);
  checkPersistent(path);
}

function regularFile(path, executable = false) {
  try {
    accessSync(path, executable ? constants.X_OK : constants.R_OK);
    if (statSync(path).isFile()) return realpathSync(path);
  } catch {
    // A missing or inaccessible runtime component is not usable.
  }
  return null;
}

function findPathCli({ cwd, env }) {
  if (env.PATH === undefined) return null;
  for (const segment of env.PATH.split(delimiter)) {
    if (segment === '') continue;
    const candidate = resolve(cwd, segment, 'dotdotgod');
    const path = regularFile(candidate, true);
    if (path !== null) {
      checkRuntimePath(candidate);
      if (path !== candidate) checkRuntimePath(path);
      return { candidate, path };
    }
  }
  return null;
}

function resolvePersistent(path, executable, errorCode) {
  checkControls(path);
  const canonical = regularFile(path, executable);
  if (!canonical) throw runtimeError(errorCode);
  checkRuntimePath(canonical);
  return canonical;
}

function compatibleNode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.exec(version);
  if (!match) return false;
  const [, major, minor, patch, prerelease] = match;
  return +major > 22 || (+major === 22 && (+minor > 5 || (+minor === 5 && (+patch > 0 || !prerelease))));
}

// Do not infer a wrapper's Node from PATH: verify the process that actually executes the CLI.
const PROBE = `let sqlite = false;
try { sqlite = Boolean(process.getBuiltinModule('node:sqlite')); } catch {}
console.log(JSON.stringify({ nodeVersion: process.versions.node, sqlite }));`;
const PRELOAD = 'data:text/javascript,' + encodeURIComponent(PROBE);

function probeRuntime({ executable, usePath, cwd, env }) {
  const probeEnv = usePath ? { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --import=${PRELOAD}`.trim() } : env;
  const result = spawnSync(executable, usePath ? ['--version'] : ['--input-type=commonjs', '--eval', PROBE], {
    shell: false, cwd, env: probeEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000,
  });
  if (result.status !== 0) return null;
  try {
    const [report, cliVersion, ...extra] = result.stdout.trim().split(/\r?\n/u);
    if (extra.length || (usePath && !/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/u.test(cliVersion))) return null;
    return { ...JSON.parse(report), cliVersion };
  } catch {
    return null;
  }
}

export function bindRuntime(ctx, { usePath = false, probe = probeRuntime } = {}) {
  ctx.signal?.throwIfAborted();
  const { cwd, env } = ctx;
  if (usePath) {
    const cli = findPathCli(ctx);
    if (!cli) throw runtimeError('PATH_CLI_NOT_FOUND');
    // Keep the original wrapper location for shims that resolve siblings from argv[0].
    const result = probe({ executable: cli.candidate, cwd, env, usePath });
    if (!result?.cliVersion || !compatibleNode(result.nodeVersion) || result.sqlite !== true) {
      throw runtimeError('PATH_CLI_INCOMPATIBLE');
    }
    return {
      binding: Object.freeze({ mode: 'path', command: 'dotdotgod' }),
      resolvedCli: cli.path, nodeVersion: result.nodeVersion, warnings: [USE_PATH_RISK],
    };
  }
  const nodePath = resolvePersistent(ctx.nodeExecPath, true, 'NODE_VERSION_UNSUPPORTED');
  const cliEntry = resolvePersistent(ctx.cliEntryPath, false, 'PATH_CLI_NOT_FOUND');
  const result = probe({ executable: nodePath, cwd, env, usePath });
  if (!compatibleNode(result?.nodeVersion)) throw runtimeError('NODE_VERSION_UNSUPPORTED');
  if (result.sqlite !== true) throw runtimeError('SQLITE_UNAVAILABLE');
  return { binding: Object.freeze({ mode: 'pinned', nodePath, cliEntry }), nodeVersion: result.nodeVersion, warnings: [] };
}

export function runtimeArgv(binding, args = []) {
  return binding.mode === 'path' ? [binding.command, ...args] : [binding.nodePath, binding.cliEntry, ...args];
}

export function runtimeHookCommand(binding, args) {
  const argv = runtimeArgv(binding, args);
  argv.forEach(checkControls);
  return argv.map(shellQuote).join(' ');
}

// Status must not execute a program named by a local marker or PATH.
export function runtimeIsPresent(binding, ctx) {
  try {
    if (binding.mode === 'path') return findPathCli(ctx) !== null;
    return [binding.nodePath, binding.cliEntry].every((path, i) => {
      checkRuntimePath(path);
      const fs = createAdapterFs({ root: path, homeDir: ctx.homeDir });
      if (!fs.inspect(path).stat?.isFile()) return false;
      accessSync(path, i === 0 ? constants.X_OK : constants.R_OK);
      return true;
    });
  } catch (error) {
    if (error instanceof DotdotgodServiceError || ['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) return false;
    throw error;
  }
}
