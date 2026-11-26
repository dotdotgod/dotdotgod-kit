import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { adapterError, DotdotgodServiceError, formatAdapterError } from '../adapters/errors.mjs';
import { getAdapterStatus, installAdapter, setupCodexPlan, uninstallAdapter } from '../adapters/index.mjs';
import { ADAPTER_HOSTS } from '../adapters/types.mjs';
import { commandUsage } from '../cli/usage.mjs';
import { formatError, formatInstall, formatSetupPlan, formatStatus, formatUninstall } from './adapter-format.mjs';

const flags = {
  json: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, 'use-path': { type: 'boolean' },
  'with-skills': { type: 'boolean' }, scope: { type: 'string' }, root: { type: 'string' },
  codex: { type: 'string' }, catalog: { type: 'string' }, confirm: { type: 'boolean' },
};
const commands = {
  install: { run: installAdapter, format: formatInstall, flags: ['dry-run', 'use-path', 'with-skills', 'scope', 'root'] },
  uninstall: { run: uninstallAdapter, format: formatUninstall, flags: ['dry-run', 'with-skills', 'scope', 'root'] },
  status: { run: getAdapterStatus, format: formatStatus, flags: ['scope', 'root'] },
  'setup-plan': { run: setupCodexPlan, format: formatSetupPlan, flags: ['codex', 'catalog', 'confirm'] },
};

function parse(command, args) {
  const spec = commands[command];
  let parsed;
  try {
    parsed = parseArgs({ args, options: Object.fromEntries(['json', ...spec.flags].map((flag) => [flag, flags[flag]])), allowPositionals: true });
  } catch {
    throw adapterError('INVALID_ARGUMENT');
  }
  const { positionals, values } = parsed;
  if ((command !== 'status' && !positionals.length) || positionals.length > (command === 'setup-plan' ? 2 : 1)) {
    throw adapterError('INVALID_ARGUMENT');
  }
  return { host: positionals[0], scope: values.scope, root: command === 'setup-plan' ? positionals[1] : values.root,
    dryRun: values['dry-run'], usePath: values['use-path'], withSkills: values['with-skills'],
    confirm: values.confirm, codex: values.codex, catalog: values.catalog, json: values.json };
}

function addRecovery(dto, usage, exitCode) {
  const { error, host } = dto;
  if (error.recovery.length) return;
  if (exitCode === 2) error.recovery.push({ argv: ['dotdotgod', 'help', ...usage.split(' ')] });
  else if (error.code === 'CODEX_VERSION_MISMATCH') error.recovery.push({ comment: 'Use Codex CLI 0.163.0, then preview again.', argv: [] });
  else if (dto.command === 'setup-plan') error.recovery.push({ comment: 'Inspect the Codex settings and output paths, then preview again without --confirm.', argv: [] });
  else if (error.code === 'SKILL_CONFLICT' && dto.command === 'install' && host !== 'pi') {
    error.recovery.push({ comment: 'Retry without --with-skills, or inspect the existing skill before retrying.', argv: [] });
  } else error.recovery.push({ comment: 'Inspect the target and resolve conflicts before retrying.', argv: ['dotdotgod', 'adapter', 'status', ...(host ? [host] : [])] });
}

export async function runAdapter(argv) {
  const [name, ...args] = argv;
  const command = Object.hasOwn(commands, name) ? name : 'adapter';
  const usage = command === 'adapter' ? command : `adapter ${command}`;
  const controller = new AbortController();
  const interrupt = () => controller.abort(130);
  const terminate = () => controller.abort(143);
  const home = homedir();
  let json = argv.includes('--json');
  let host;
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    if (command === 'adapter') throw adapterError('INVALID_ARGUMENT');
    const options = parse(command, args);
    json = options.json === true;
    if (ADAPTER_HOSTS.includes(options.host) || options.host === 'obsidian') host = options.host;
    const ctx = { cwd: process.cwd(), homeDir: home, env: process.env, nodeExecPath: process.execPath,
      cliEntryPath: fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url)),
      coreVersion: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version, signal: controller.signal };
    const dto = await commands[command].run(ctx, options);
    await setImmediate();
    if (!controller.signal.aborted) console.log(json ? JSON.stringify(dto, null, 2) : commands[command].format(dto, home, Boolean(host)));
  } catch (error) {
    await setImmediate();
    if (!controller.signal.aborted) {
      const exitCode = error instanceof DotdotgodServiceError ? error.exitCode : 1;
      const dto = formatAdapterError(command, host, error);
      addRecovery(dto, usage, exitCode);
      if (json) console.log(JSON.stringify(dto, null, 2));
      else console.error(formatError(dto.error, home, host ?? usage) + (exitCode === 2 ? `\n\n${commandUsage(usage)}` : ''));
      process.exitCode = exitCode;
    }
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
    if (controller.signal.aborted) process.exitCode = controller.signal.reason;
  }
}
