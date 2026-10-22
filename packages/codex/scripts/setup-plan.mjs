#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CODEX_PLAN_VERSION, assertPlanConfig, patchPlanCatalog, planProfile, planProfileName } from '../src/native-plan.mjs';
import { codexRpc } from '../src/rpc.mjs';

async function main() {
  const args = process.argv.slice(2);
  const root = realpathSync(resolve(args.shift() || '.'));
  let catalogPath;
  let binary = 'codex';
  let confirm = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--confirm') confirm = true;
    else if (['--catalog', '--codex'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (args[i] === '--catalog') catalogPath = resolve(args[++i]);
      else binary = args[++i];
    } else throw new Error(`Unknown or incomplete option: ${args[i]}`);
  }
  const version = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0 || version.stdout.trim() !== `codex-cli ${CODEX_PLAN_VERSION}`) throw new Error(`Native plan setup requires Codex ${CODEX_PLAN_VERSION}.`);
  const rpc = codexRpc(binary, { cwd: root });
  let config;
  try {
    await rpc.initialize();
    ({ config } = await rpc.call('config/read', { cwd: root, includeLayers: true }));
  } finally { rpc.close(); }
  assertPlanConfig(config);
  const home = resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
  const profile = planProfileName(root);
  const profilePath = join(home, `${profile}.config.toml`);
  catalogPath ||= config.model_catalog_json || join(home, 'models_cache.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const nativePlan = readFileSync(new URL('../resources/NATIVE_PLAN.md', import.meta.url), 'utf8');
  const patched = patchPlanCatalog(catalog, nativePlan);
  const directory = join(root, '.dotdotgod', 'codex-plan');
  for (const path of [join(root, '.dotdotgod'), directory, join(root, 'docs'), join(root, 'docs/plan')]) {
    try { if (lstatSync(path).isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const output = join(directory, 'models.json');
  if (existsSync(profilePath) || existsSync(output)) throw new Error('Plan setup already exists; inspect it instead of overwriting it.');
  if (confirm) {
    mkdirSync(directory, { recursive: true });
    mkdirSync(join(root, 'docs/plan'), { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(output, `${JSON.stringify(patched, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    writeFileSync(profilePath, planProfile(root, output), { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ ok: true, dryRun: !confirm, root, profile, profilePath, catalogPath: output,
    modelCount: patched.models.length, launch: [binary, '--no-daemon', '--profile', profile, '--cd', root],
    next: 'Enter /plan. Permissions remain restricted after leaving Plan Mode; choose implementation permissions yourself.',
    boundary: 'Local native file/command policy only; MCP and hooks have separate execution boundaries.' }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
