import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const exports = ['.', './bin/dotdotgod.mjs', './context', './decision', './hooks',
  './hooks/antigravity', './impact', './memory/config', './server'];
const patches = ['c-sharp', 'tsx', 'typescript'].map((name) => `src/symbols/parsers/tree-sitter-${name}.wasm`);
const legacyBundle = /(?:^|\/)(?:mcp\/(?:cli|server|bridge|decision|runtime)\.mjs|mcp\/parsers\/|hooks\/runtime\.mjs|scripts\/hook-runtime\.mjs)/;
const manifest = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, timeout: 120_000, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test('TR-06: public tarballs ship one CLI runtime and install together', (t) => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'ddg-package-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const artifacts = {};
  for (const name of ['cli', 'pi']) {
    const cwd = join(workspace, 'packages', name);
    const extracted = join(dir, name);
    mkdirSync(extracted);
    run('pnpm', ['pack', '--pack-destination', extracted], cwd);
    const archives = readdirSync(extracted);
    assert.equal(archives.length, 1);
    assert.match(archives[0], /\.tgz$/);
    const archive = join(extracted, archives[0]);
    run('tar', ['-xzf', archive], extracted);
    const pkg = join(extracted, 'package');
    const files = readdirSync(pkg, { recursive: true, withFileTypes: true })
      .filter((entry) => !entry.isDirectory())
      .map((entry) => join(entry.parentPath.slice(pkg.length + 1), entry.name));
    assert.equal(manifest(pkg).name, `@dotdotgod/${name}`);
    assert.deepEqual(files.filter((file) => file.endsWith('.wasm')).sort(), name === 'cli' ? patches : []);
    for (const file of files) {
      assert.doesNotMatch(file, legacyBundle, file);
      assert.doesNotMatch(file, /(?:^|\/)__pycache__\/|\.py[cod]$/, file);
    }
    artifacts[name] = { archive, pkg };
  }
  const cli = manifest(artifacts.cli.pkg);
  const pi = manifest(artifacts.pi.pkg);
  assert.deepEqual(Object.keys(cli.exports).sort(), exports);
  assert.deepEqual(cli.bin, { dotdotgod: './bin/dotdotgod.mjs' });
  assert.deepEqual(pi.dependencies, { '@dotdotgod/cli': cli.version });
  assert.equal(cli.dependencies['@vscode/tree-sitter-wasm'], '0.3.1');
  assert.ok(existsSync(join(artifacts.cli.pkg, 'assets/adapters/hermes/runtime.py')));

  for (const [name, prefix] of [['cli', 'assets/initializer'], ['pi', 'skills/project-initializer']]) {
    for (const template of ['dotdotgod.config', 'software', 'research', 'case-and-evidence', 'publication', 'portfolio', 'policy']) {
      assert.ok(existsSync(join(artifacts[name].pkg, prefix, `templates/${template}.json`)), `${name}: ${template}`);
    }
  }

  const consumer = join(dir, 'consumer');
  const home = join(dir, 'home');
  mkdirSync(consumer);
  mkdirSync(home);
  writeFileSync(join(consumer, 'package.json'), '{"name":"tarball-smoke","private":true}\n');
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: home };
  // Pi hosts provide the peer SDK. This smoke installs only the two tarballs and runtime dependencies.
  run('npm', ['install', '--ignore-scripts', '--legacy-peer-deps', '--no-package-lock', '--no-audit', '--no-fund',
    '--cache', join(home, '.npm'), artifacts.cli.archive, artifacts.pi.archive], consumer, env);
  const bin = join(consumer, 'node_modules/.bin/dotdotgod');
  assert.equal(run(bin, ['--version'], consumer, env).trim(), cli.version);
  assert.match(run(bin, ['init', consumer, '--template', 'research', '--dry-run'], consumer, env), /dotdotgod\.config\.json/);
  const status = JSON.parse(run(bin, ['adapter', 'status', 'hermes', '--json'], consumer, env));
  assert.equal(status.hosts[0].status, 'not-installed');
  run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { existsSync } from 'node:fs';
    import { createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const pi = pathToFileURL(process.cwd() + '/node_modules/@dotdotgod/pi/package.json');
    const require = createRequire(pi);
    const entry = import.meta.resolve('@dotdotgod/cli/bin/dotdotgod.mjs');
    assert.equal(pathToFileURL(require.resolve('@dotdotgod/cli/bin/dotdotgod.mjs')).href, entry);
    const { parserIdentity } = await import(new URL('../src/symbols/runtime.mjs', entry));
    assert.match(parserIdentity(), /^[a-f0-9]{64}$/);
    for (const key of ${JSON.stringify(exports)}) {
      const url = import.meta.resolve('@dotdotgod/cli' + key.slice(1));
      assert.ok(existsSync(new URL(url)), url);
    }
  `], consumer, env);
  t.diagnostic('CLI and Pi tarballs installed; 3 CLI grammar patches, 0 legacy bundle bytes, 0 Python bytecode files');
});
