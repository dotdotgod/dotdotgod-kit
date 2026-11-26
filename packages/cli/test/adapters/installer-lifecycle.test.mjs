import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const bin = fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fingerprint = (root) => readdirSync(root, { recursive: true, withFileTypes: true }).map((entry) => {
  const path = join(entry.parentPath, entry.name);
  return [path, entry.isFile() ? hash(readFileSync(path)) : 'directory'];
}).sort();
const entry = './.dotdotgod/adapters/opencode';

function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'adapter-life-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const [home, root, xdg, temp, codex] = ['home', 'work', 'xdg', 'temp', 'codex'].map((name) => join(base, name));
  for (const path of [home, root, xdg, temp, codex]) mkdirSync(path);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: xdg, CODEX_HOME: codex, TMPDIR: temp, TMP: temp, TEMP: temp };
  const cli = (args, nodeFlags = []) => spawnSync(process.execPath, [...nodeFlags, bin, 'adapter', ...args], { cwd: root, env, encoding: 'utf8', timeout: 20000 });
  function run(args, code = 0) {
    const result = cli([...args, '--json']);
    assert.equal(result.status, code, `${args}: ${result.error ?? result.stderr} ${result.stdout}`);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  }
  return { base, home, root, xdg, codex, env, run, cli };
}

function put(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return path;
}

const hosts = ['claude-code', 'codex', 'antigravity', 'opencode', 'hermes'];
for (const [host, flags] of [...hosts.map((host) => [host, []]), ['opencode', ['--scope', 'user']]]) {
  test(`U-7: ${host} ${flags.at(-1) ?? 'default'} dry-run, install, status, upgrade and uninstall`, (t) => {
    const { run, cli, base, home, root, xdg, codex, env } = fixture(t);
    const seeded = ['.dotdotgod/config.json', '.dotdotgod/templates/user.json', '.dotdotgod/runtime/embedding/model', '.hermes/config.yaml']
      .map((path) => join(home, path)).concat([join(codex, 'config.toml'), join(codex, 'dotdotgod-plan-seed.config.toml'),
        ...['.dotdotgod/manifest.json', 'dotdotgod.config.json', 'docs/README.md'].map((path) => join(root, path))]);
    for (const path of seeded) put(path, 'SENTINEL_SECRET_DO_NOT_LEAK');
    const keep = seeded.map((path) => hash(readFileSync(path)));
    const config = flags.length ? join(xdg, 'opencode/opencode.jsonc') : join(root, 'opencode.json');
    if (host === 'opencode') put(config, '{\r\n  // keep me\r\n  "plugins": ["other"],\r\n  "token": "SENTINEL_SECRET_DO_NOT_LEAK"\r\n}\r\n');
    const before = fingerprint(base);
    assert.equal(run(['status', host, ...flags]).hosts[0].status, 'not-installed');
    const dry = run(['install', host, ...flags, '--dry-run', '--with-skills']);
    assert.ok(dry.dryRun && dry.runtime.mode === 'pinned');
    assert.match(cli(['install', host, ...flags, '--dry-run']).stdout, /Planned changes:[\s\S]*Post-install activation/);
    assert.deepEqual(fingerprint(base), before);

    const installed = run(['install', host, ...flags, '--with-skills']);
    const markerPath = join(host === 'opencode' && !flags.length ? root : home, `.dotdotgod/adapters/state/${host}.json`);
    const marker = JSON.parse(readFileSync(markerPath));
    assert.equal(marker.phase, 'installed');
    assert.equal(marker.installDir, installed.installDir);
    assert.deepEqual(marker.runtime, installed.runtime);
    const status = run(['status', host, ...flags]);
    assert.equal(status.hosts[0].status, 'installed');
    assert.equal(status.hosts[0].skills.status, 'installed');
    const unchanged = fingerprint(base);
    run(['install', host, ...flags, '--with-skills']);
    assert.deepEqual(fingerprint(base), unchanged);
    if (host === 'opencode') {
      assert.equal(marker.sharedConfigEdits[0].path, config);
      const bytes = readFileSync(config, 'utf8');
      assert.ok(bytes.includes(flags.length ? installed.installDir : entry));
      if (!flags.length) assert.ok(!bytes.includes(home));
      assert.ok(bytes.includes('// keep me\r\n'));
    }
    if (host === 'antigravity') {
      const agy = spawnSync('agy', ['plugin', 'validate', '--strict', '--json', installed.installDir], {
        cwd: root, env, encoding: 'utf8', timeout: 15000,
      });
      if (agy.error?.code !== 'ENOENT' || process.env.DOTDOTGOD_REQUIRE_AGY === '1') {
        assert.equal(agy.status, 0, agy.error?.message ?? agy.stderr);
        assert.equal(agy.stderr, '');
        assert.deepEqual(JSON.parse(agy.stdout).findings, []);
      }
    }

    const obsolete = Buffer.from('owned by old version');
    put(join(installed.installDir, 'old/obsolete.txt'), obsolete);
    marker.cliVersion = '0.1.0';
    marker.managedFiles['old/obsolete.txt'] = { sha256: hash(obsolete), size: obsolete.length };
    put(markerPath, JSON.stringify(marker));
    assert.equal(run(['status', host, ...flags]).hosts[0].status, 'version-drift');
    run(['install', host, ...flags]);
    assert.ok(!existsSync(join(installed.installDir, 'old')));
    assert.equal(run(['status', host, ...flags]).hosts[0].status, 'installed');
    const installedTree = fingerprint(base);
    run(['uninstall', host, ...flags, '--dry-run']);
    assert.deepEqual(fingerprint(base), installedTree);
    const removal = run(['uninstall', host, ...flags]);
    assert.equal(removal.preserved.length, 2);
    assert.ok(removal.preserved.every(({ targetDir, owners }) => existsSync(targetDir) && owners.length === 0));
    assert.ok(!existsSync(markerPath) && !existsSync(installed.installDir));
    run(['uninstall', host, ...flags, '--with-skills']);
    assert.ok(removal.preserved.every(({ targetDir }) => !existsSync(targetDir)));
    assert.equal(run(['uninstall', host, ...flags]).changes.length, 0);
    assert.equal(run(['status', host, ...flags]).hosts[0].status, 'not-installed');
    assert.deepEqual(seeded.map((path) => hash(readFileSync(path))), keep);
    if (host === 'opencode') assert.equal(readFileSync(config, 'utf8'), '{\r\n  // keep me\r\n  "plugins": ["other"],\r\n  "token": "SENTINEL_SECRET_DO_NOT_LEAK"\r\n}\r\n');
  });
}

test('U-7: partial cleanup, drift refusal and preflight leave all destinations unchanged', (t) => {
  const { run, base, root, home } = fixture(t);
  const config = join(root, 'opencode.jsonc');
  put(config, '{"token": "SENTINEL_SECRET_DO_NOT_LEAK", BAD');
  const initial = fingerprint(base);
  assert.equal(run(['install', 'opencode', '--with-skills'], 1).error.code, 'CONFIG_PARSE_ERROR');
  assert.ok(!JSON.stringify(run(['install', 'opencode', '--dry-run'], 1)).includes('SENTINEL_SECRET'));
  assert.deepEqual(fingerprint(base), initial);
  put(config, '{}');
  const skill = put(join(root, '.agents/skills/ddg-planning/SKILL.md'), '# unmanaged');
  const unowned = fingerprint(base);
  assert.equal(run(['install', 'opencode', '--with-skills'], 1).error.code, 'SKILL_CONFLICT');
  assert.deepEqual(fingerprint(base), unowned);
  rmSync(dirname(skill), { recursive: true });

  const { installDir } = run(['install', 'opencode', '--with-skills']);
  const runtime = join(installDir, 'runtime.json');
  const original = readFileSync(runtime);
  const markerPath = join(root, '.dotdotgod/adapters/state/opencode.json');
  const marker = JSON.parse(readFileSync(markerPath));
  put(markerPath, JSON.stringify({ ...marker, phase: 'staging' }));
  unlinkSync(join(installDir, 'index.js'));
  put(runtime, 'locally edited');
  const changed = fingerprint(base);
  assert.equal(run(['status', 'opencode']).hosts[0].status, 'modified');
  assert.equal(run(['uninstall', 'opencode', '--with-skills'], 1).error.code, 'MODIFIED_CONFLICT');
  assert.deepEqual(fingerprint(base), changed);
  put(runtime, original);
  assert.equal(run(['status', 'opencode']).hosts[0].status, 'partial');
  run(['uninstall', 'opencode', '--with-skills']);
  assert.ok(!existsSync(installDir) && !existsSync(markerPath));
  assert.deepEqual(JSON.parse(readFileSync(config)).plugins, []);
  assert.deepEqual(readdirSync(home), []);
});

test('U-7: never adopt or delete unowned OpenCode entries; block legacy layouts', (t) => {
  const { run, root, home, base } = fixture(t);
  const cfg = join(root, 'opencode.jsonc');
  for (const [path, bytes] of [[cfg, JSON.stringify({ plugins: [entry] })],
    [join(root, 'opencode.json'), JSON.stringify({ plugins: [entry] })]]) {
    put(cfg, '{}');
    put(path, bytes);
    const before = fingerprint(base);
    assert.equal(run(['install', 'opencode'], 1).error.code, 'UNMANAGED_CONFLICT');
    assert.equal(run(['uninstall', 'opencode']).changes.length, 0);
    assert.deepEqual(fingerprint(base), before);
  }
  // Even a valid staging marker cannot claim a link it never wrote.
  unlinkSync(join(root, 'opencode.json'));
  put(cfg, '{}');
  run(['install', 'opencode']);
  const markerPath = join(root, '.dotdotgod/adapters/state/opencode.json');
  put(markerPath, JSON.stringify({ ...JSON.parse(readFileSync(markerPath)), phase: 'staging', sharedConfigEdits: [] }));
  const configBytes = readFileSync(cfg);
  assert.equal(run(['install', 'opencode'], 1).error.code, 'UNMANAGED_CONFLICT');
  run(['uninstall', 'opencode']);
  assert.deepEqual(readFileSync(cfg), configBytes);
  put(cfg, '{"plugins":["@dotdotgod/opencode"]}');
  put(join(home, '.hermes/plugins/dotdotgod/mcp/bridge.mjs'), 'legacy');
  const before = fingerprint(base);
  for (const host of ['opencode', 'hermes']) {
    assert.equal(run(['status', host]).hosts[0].status, 'legacy-coexist');
    for (const verb of ['install', 'uninstall']) assert.equal(run([verb, host], 1).error.code, 'LEGACY_COEXIST_CONFLICT');
  }
  assert.deepEqual(fingerprint(base), before);
});

test('U-7: a concurrent config edit after staging is not adopted on recovery', (t) => {
  const { cli, root, run } = fixture(t);
  const config = join(root, 'opencode.jsonc');
  const marker = join(root, '.dotdotgod/adapters/state/opencode.json');
  const competing = JSON.stringify({ plugins: [entry], other: true });
  const preload = `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      rename(from, to);
      if (to === ${JSON.stringify(marker)}) fs.writeFileSync(${JSON.stringify(config)}, ${JSON.stringify(competing)});
    }; syncBuiltinESMExports();`;
  const failed = cli(['install', 'opencode', '--with-skills', '--json'], [`--import=data:text/javascript,${encodeURIComponent(preload)}`]);
  assert.equal(failed.status, 1, failed.stderr);
  assert.equal(JSON.parse(failed.stdout).error.code, 'CONCURRENT_MODIFICATION');
  const staged = JSON.parse(readFileSync(marker));
  assert.equal(staged.phase, 'staging');
  assert.deepEqual(staged.sharedConfigEdits, []);
  assert.ok(!existsSync(join(root, '.agents')));
  assert.equal(run(['install', 'opencode'], 1).error.code, 'UNMANAGED_CONFLICT');
  run(['uninstall', 'opencode']);
  assert.equal(readFileSync(config, 'utf8'), competing);
  assert.ok(!existsSync(marker));
});

test('U-7: Pi shares optional skills through the ledger only', (t) => {
  const { run, home } = fixture(t);
  run(['install', 'codex', '--with-skills']);
  run(['install', 'pi', '--with-skills']);
  const state = join(home, '.dotdotgod/adapters/state');
  assert.deepEqual(readdirSync(state).sort(), ['codex.json', 'skills.json']);
  assert.equal(run(['status', 'pi']).hosts[0].status, 'installed');
  const detached = run(['uninstall', 'codex', '--with-skills']);
  assert.ok(detached.warnings.every(({ code }) => code === 'SKILL_SHARED_BY_OTHER_HOSTS'));
  assert.equal(detached.warnings.length, 2);
  run(['uninstall', 'pi', '--with-skills']);
  assert.deepEqual(JSON.parse(readFileSync(join(state, 'skills.json'))).skills, []);
  assert.equal(run(['status', 'pi']).hosts[0].status, 'not-installed');
});
