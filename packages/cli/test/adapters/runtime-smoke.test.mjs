import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const bin = fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url));
const expected = ['execute', 'execute_file', 'index', 'search', 'fetch_and_index', 'session_resume', 'ingestion_job_start',
  'ingestion_job_status', 'ingestion_job_cancel', 'context_heal', 'stats', 'doctor', 'purge', 'project_load', 'embedding_status',
  'embedding_install', 'project_impact', 'project_initialize', 'impact_status'].sort();

function fixture(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'adapter-smoke-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const [home, cwd, tmp, path, xdg] = ['home', 'work', 'temp', 'bin', 'xdg'].map((name) => join(dir, name));
  for (const p of [home, cwd, tmp, path, xdg]) mkdirSync(p);
  symlinkSync(bin, join(path, 'dotdotgod'));
  symlinkSync(process.execPath, join(path, 'node'));
  const env = { ...process.env, HOME: home, CODEX_HOME: join(home, '.codex'), XDG_CONFIG_HOME: xdg,
    PYTHONDONTWRITEBYTECODE: '1', TMPDIR: tmp, TMP: tmp, TEMP: tmp, PATH: [path, process.env.PATH].join(delimiter) };
  function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 15000, ...options });
    assert.equal(result.status, 0, `${args}: ${result.error ?? result.stderr} ${result.stdout}`);
    return result;
  }
  const install = (host, flags) => JSON.parse(run(process.execPath, [bin, 'adapter', 'install', host, ...flags, '--json']).stdout);
  return { cwd, env, run, install };
}

async function listTools(argv, { cwd, env }) {
  const [command, ...args] = argv;
  const transport = new StdioClientTransport({ command, args, cwd, env: { ...env, DOTDOTGOD_PROJECT_ROOT: cwd }, stderr: 'pipe' });
  const client = new Client({ name: 'installed-adapter-smoke', version: '1.0.0' });
  try {
    await client.connect(transport, { timeout: 10000 });
    const { tools } = await client.listTools(undefined, { timeout: 10000 });
    assert.deepEqual(tools.map(({ name }) => name).sort(), expected);
    assert.equal(client.getServerVersion().name, 'dotdotgod-context');
  } finally {
    await client.close();
  }
}

test('U-9: installed host entrypoints share one MCP runtime in pinned and PATH modes', async (t) => {
  const f = fixture(t);
  for (const mode of ['pinned', 'path']) {
    const flags = mode === 'path' ? ['--use-path'] : [];
    const node = realpathSync(process.execPath);
    const entry = realpathSync(bin);
    const baseArgv = mode === 'path' ? ['dotdotgod'] : [node, entry];
    const argv = [...baseArgv, 'mcp'];
    for (const [host, manifest] of [['claude-code', 'plugin/.claude-plugin/plugin.json'],
      ['codex', 'plugins/dotdotgod/.mcp.json'], ['antigravity', 'mcp_config.json']]) {
      const installed = f.install(host, flags);
      assert.equal(installed.runtime.mode, mode);
      if (mode === 'path') assert.equal(installed.warnings[0].code, 'USE_PATH_RISK');
      const servers = Object.values(JSON.parse(readFileSync(join(installed.installDir, manifest))).mcpServers);
      assert.equal(servers.length, 1);
      const [{ command, args }] = servers;
      assert.deepEqual([command, ...args], argv);
      if (host === 'antigravity') {
        await listTools([command, ...args], f);
        const hook = JSON.parse(readFileSync(join(installed.installDir, 'hooks.json'))).dotdotgod.PreInvocation[0];
        const failed = f.run('/bin/sh', ['-c', hook.command], { input: '{' });
        assert.equal(failed.stdout, '{}\n');
        assert.match(failed.stderr, /^dotdotgod hook error: /);
        assert.ok(failed.stderr.trimEnd().length <= 240);
      }
    }

    const opencode = f.install('opencode', flags);
    const loader = pathToFileURL(join(opencode.installDir, 'src/runtime.mjs')).href;
    const loaded = f.run(process.execPath, ['--input-type=module', '--eval', `
      import { loadRuntime } from ${JSON.stringify(loader)};
      const { argv, advisory } = await loadRuntime();
      console.log(JSON.stringify({ argv, symbols: Object.keys(advisory) }));
    `]);
    const { argv: glueArgv, symbols } = JSON.parse(loaded.stdout);
    assert.deepEqual(glueArgv, mode === 'path' ? [entry] : baseArgv);
    assert.deepEqual(symbols.sort(), ['ImpactState', 'evaluateLoadDecision', 'formatDecisionError', 'formatDecisionInjection',
      'impactReminder', 'isInitializedProject', 'validateSessionId']);

    const hermes = f.install('hermes', flags);
    const python = f.run('python3', ['-c', 'import sys, json; sys.path.insert(0, sys.argv[1]); from proxy import resolve_cli_cmd; print(json.dumps(resolve_cli_cmd()))', hermes.installDir]);
    const hermesArgv = JSON.parse(python.stdout);
    assert.deepEqual(hermesArgv, baseArgv);
    const listed = f.run(hermesArgv[0], [...hermesArgv.slice(1), 'mcp-bridge', '--list-tools']);
    assert.deepEqual(JSON.parse(listed.stdout), JSON.parse(readFileSync(join(hermes.installDir, 'tools.json'))));
    assert.deepEqual(readdirSync(join(f.cwd, '.dotdotgod')).sort(), ['adapters']);
  }
});
