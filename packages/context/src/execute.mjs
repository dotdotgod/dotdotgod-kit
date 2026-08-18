import { createWriteStream, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import { resolveWithinRoot } from './paths.mjs';
import { composeEnvironment } from './environment-policy.mjs';

const DIRECT_LIMIT = 12_000;
const MAX_DIRECT_RETURN = 1024 * 1024;
const HARD_LIMIT = 10 * 1024 * 1024;

function readBounded(path, limit = DIRECT_LIMIT) {
  const value = readFileSync(path);
  if (value.length <= limit) return { text: value.toString('utf8'), truncated: false, bytes: value.length };
  const head = value.subarray(0, Math.floor(limit * 0.7));
  const tail = value.subarray(value.length - Math.floor(limit * 0.3));
  return { text: `${head.toString('utf8')}\n… ${value.length - head.length - tail.length} byte(s) omitted …\n${tail.toString('utf8')}`, truncated: true, bytes: value.length };
}

function commandSpec(input) {
  if (input.executable) return { command: input.executable, args: input.args ?? [], shell: false };
  if (!input.command) throw new Error('command or executable is required');
  return { command: input.command, args: [], shell: input.shell ?? true };
}

function killProcess(child) {
  if (!child.pid) return;
  try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch {}
  setTimeout(() => {
    try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {}
  }, 500).unref();
}

export async function executeCommand(input, options = {}) {
  if (options.signal?.aborted) throw options.signal.reason ?? new Error('Execution aborted.');
  const spec = commandSpec(input);
  const cwd = resolveWithinRoot(options.root || process.cwd(), input.cwd || '.');
  const timeoutMs = Math.min(Math.max(1, input.timeoutMs ?? 120_000), 30 * 60_000);
  const dir = mkdtempSync(join(tmpdir(), 'dotdotgod-context-'));
  const stdoutPath = join(dir, 'stdout.log');
  const stderrPath = join(dir, 'stderr.log');
  const stdout = createWriteStream(stdoutPath);
  const stderr = createWriteStream(stderrPath);
  const startedAt = Date.now();
  let timedOut = false;
  let aborted = false;
  let captureLimitExceeded = false;
  const captureLimitBytes = Math.min(HARD_LIMIT, Math.max(1024, options.captureLimitBytes ?? HARD_LIMIT));
  const environment = composeEnvironment({
    inherited: options.env ?? process.env,
    overrides: input.env ?? {},
    mode: input.environmentMode ?? 'inherit-filtered-v1',
    allow: input.allowedEnv ?? [],
  });

  try {
    const result = await new Promise((resolvePromise, reject) => {
      const child = spawn(spec.command, spec.args, {
        cwd,
        shell: spec.shell,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: environment.env,
      });
      let capturedBytes = 0;
      const boundedCapture = () => new Transform({
        transform(chunk, _encoding, callback) {
          const remaining = Math.max(0, captureLimitBytes - capturedBytes);
          const kept = chunk.subarray(0, remaining);
          capturedBytes += kept.length;
          if (kept.length) this.push(kept);
          if (kept.length < chunk.length && !captureLimitExceeded) {
            captureLimitExceeded = true;
            killProcess(child);
          }
          callback();
        },
      });
      child.stdout.pipe(boundedCapture()).pipe(stdout);
      child.stderr.pipe(boundedCapture()).pipe(stderr);
      const timer = setTimeout(() => { timedOut = true; killProcess(child); }, timeoutMs);
      const onAbort = () => { aborted = true; killProcess(child); };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      let spawnError = false;
      child.once('error', (error) => {
        spawnError = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        stdout.end(() => stderr.end(() => reject(error)));
      });
      child.once('close', (code, signal) => {
        if (spawnError) return;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        stdout.end(() => stderr.end(() => resolvePromise({ code, signal })));
      });
    });

    await Promise.all([finished(stdout), finished(stderr)]);
    const outputLimit = Math.min(MAX_DIRECT_RETURN, Math.max(1, input.outputLimit ?? DIRECT_LIMIT));
    const directLimit = Math.min(HARD_LIMIT, Math.max(1, input.directLimit ?? DIRECT_LIMIT));
    const stdoutResult = readBounded(stdoutPath, outputLimit);
    const stderrResult = readBounded(stderrPath, outputLimit);
    const totalBytes = stdoutResult.bytes + stderrResult.bytes;
    const metadata = {
      command: input.command ?? [input.executable, ...(input.args ?? [])].join(' '),
      cwd,
      code: result.code,
      signal: result.signal,
      timedOut,
      aborted,
      captureLimitExceeded,
      captureLimitBytes,
      durationMs: Date.now() - startedAt,
      stdoutBytes: stdoutResult.bytes,
      stderrBytes: stderrResult.bytes,
      environmentPolicy: environment.policy,
    };
    const mode = input.outputMode ?? 'auto';
    const shouldIndex = mode === 'indexed' || (mode === 'auto' && totalBytes > directLimit);
    let indexed;
    if (shouldIndex && options.store) {
      const stdoutText = statSync(stdoutPath).size <= HARD_LIMIT ? readFileSync(stdoutPath, 'utf8') : stdoutResult.text;
      const stderrText = statSync(stderrPath).size <= HARD_LIMIT ? readFileSync(stderrPath, 'utf8') : stderrResult.text;
      indexed = options.store.index({
        scope: input.scope ?? 'session',
        sessionId: options.sessionId,
        label: input.label ?? metadata.command,
        kind: 'command',
        text: `# stdout\n${stdoutText}\n\n# stderr\n${stderrText}`,
        metadata,
        ttlMs: input.ttlMs ?? 24 * 60 * 60 * 1000,
      });
    }
    return {
      ok: result.code === 0 && !timedOut && !aborted && !captureLimitExceeded,
      ...metadata,
      ...(mode === 'discard' ? {} : shouldIndex ? { indexed } : { stdout: stdoutResult.text, stderr: stderrResult.text, truncated: stdoutResult.truncated || stderrResult.truncated }),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
  }
}

export async function executeFile(input, options = {}) {
  const path = resolveWithinRoot(options.root || process.cwd(), input.path);
  const selectorEnvironment = composeEnvironment({ inherited: options.env ?? process.env, overrides: input.env ?? {}, mode: input.environmentMode ?? 'inherit-filtered-v1', allow: input.allowedEnv ?? [] }).env;
  const dir = mkdtempSync(join(tmpdir(), 'dotdotgod-context-file-'));
  try {
    let executable;
    let args;
    if (input.language === 'python') {
      const wrapper = join(dir, 'run.py');
      writeFileSync(wrapper, `from pathlib import Path\nFILE_CONTENT = Path(${JSON.stringify(path)}).read_text(encoding='utf-8', errors='replace')\n${input.code}\n`);
      executable = selectorEnvironment.PYTHON || 'python3';
      args = [wrapper];
    } else if (input.language === 'shell') {
      const wrapper = join(dir, 'run.sh');
      writeFileSync(wrapper, `FILE_PATH=${JSON.stringify(path)}\nexport FILE_PATH\n${input.code}\n`);
      executable = selectorEnvironment.SHELL || '/bin/sh';
      args = [wrapper];
    } else {
      const wrapper = join(dir, 'run.mjs');
      writeFileSync(wrapper, `import { readFileSync } from 'node:fs';\nconst FILE_CONTENT = readFileSync(${JSON.stringify(path)}, 'utf8');\n${input.code}\n`);
      executable = process.execPath;
      args = [wrapper];
    }
    return await executeCommand({ ...input, executable, args, command: undefined, shell: false, cwd: input.cwd ?? options.root }, options);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
  }
}

export async function executeBatch(input, options = {}) {
  const commands = input.commands ?? [];
  if (commands.length === 0) throw new Error('commands must contain at least one command');
  if (commands.length > 100) throw new Error('commands is limited to 100 entries');
  const concurrency = Math.min(8, Math.max(1, input.concurrency ?? 1));
  const results = new Array(commands.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= commands.length) return;
      try {
        results[index] = await executeCommand({ ...commands[index], cwd: commands[index].cwd ?? input.cwd, timeoutMs: commands[index].timeoutMs ?? input.timeoutMs }, options);
      } catch (error) {
        results[index] = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, commands.length) }, () => worker()));
  return { ok: results.every((result) => result.ok), concurrency, results };
}
