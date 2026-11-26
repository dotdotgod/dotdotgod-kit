import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { createAdapterFs } from '../../src/adapters/fs-safety.mjs';
import { createMarkerStore } from '../../src/adapters/marker-store.mjs';
import { applyJsoncEdit, planJsoncEdit, readJsoncConfig } from '../../src/adapters/jsonc-edit.mjs';
import { inspectOpenCodeConfig } from '../../src/adapters/hosts/opencode.mjs';

const entry = './.dotdotgod/adapters/opencode';
const quoted = JSON.stringify(entry);

function fixture(t, name = 'opencode.jsonc') {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'opencode-jsonc-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, name);
  const fs = createAdapterFs({ root, homeDir: root });
  const plan = (operation, candidate = entry) => planJsoncEdit(readJsoncConfig(fs, path), { scope: 'project', entry: candidate, operation });
  return { root, path, plan, fs, write: (source) => writeFileSync(path, source), read: () => readFileSync(path, 'utf8'), apply: (edit) => applyJsoncEdit(fs, edit) };
}

for (const name of ['opencode.jsonc', 'opencode.json']) test(`${name}: insert and remove only one top-level plugin, idempotently`, (t) => {
  const f = fixture(t, name);
  const original = '{"other":{"plugins":["@dotdotgod/opencode"]}, "plugins":["keep",["tuple",{"x":1}]]}\n';
  f.write(original);
  const expected = JSON.parse(original);
  expected.plugins.push(entry);
  f.apply(f.plan('install'));
  assert.deepEqual(JSON.parse(f.read()), expected);
  const installed = f.read();
  f.apply(f.plan('install'));
  assert.equal(f.read(), installed);
  f.apply(f.plan('uninstall'));
  f.apply(f.plan('uninstall'));
  assert.equal(f.read(), original);
});

test('preserve BOM, CRLF, comments, escaped strings, array indentation and trailing commas', (t) => {
  const f = fixture(t);
  const escaped = JSON.stringify('quote " and two \\\\');
  const original = `\uFEFF{\r\n  // untouched\r\n  "plugins": [\r\n    ${escaped}, /* keep this */\r\n  ],\r\n  "nested": {"plugins": false,},\r\n}\r\n`;
  f.write(original);
  f.apply(f.plan('install'));
  assert.equal(f.read(), original.replace(`${escaped},`, `${escaped},\r\n    ${quoted},`));
  f.apply(f.plan('uninstall'));
  assert.equal(f.read().replace(/\r\n    (?=,)/u, ''), original);
});

test('create settings when absent, expand empty arrays, and ignore deeper plugins', (t) => {
  const f = fixture(t);
  f.apply(f.plan('uninstall'));
  assert.equal(existsSync(f.path), false);
  f.apply(f.plan('install'));
  assert.deepEqual(JSON.parse(f.read()), { plugins: [entry] });
  for (const original of ['{"plugins":[/* empty */]}', '{"nested":{"plugins":true},/* keep */}']) {
    f.write(original);
    f.apply(f.plan('install'));
    assert.match(f.read(), /\/\* (empty|keep) \*\//u);
    assert.ok(f.read().includes(quoted));
    f.apply(f.plan('uninstall'));
    assert.ok(!f.read().includes(quoted));
  }
});

test('unsafe configuration fails without writes or disclosing configuration text', (t) => {
  const f = fixture(t);
  const secret = 'SENTINEL_SECRET_DO_NOT_LEAK';
  for (const [input, code] of [
    ['{"plugins": [], "plu\\u0067ins": []}', 'CONFIG_KEY_CONFLICT'],
    ['{"plugins": {}}', 'CONFIG_KEY_CONFLICT'],
    [`{"plugins":[${quoted},${quoted}]}`, 'CONFIG_KEY_CONFLICT'],
    ['{"plugins":["@dotdotgod/opencode"]}', 'LEGACY_COEXIST_CONFLICT'],
    ['{"plugins":[["@dotdotgod/opencode",{}]]}', 'LEGACY_COEXIST_CONFLICT'],
    [`{\n "password": "${secret}", ?\n}`, 'CONFIG_PARSE_ERROR'],
    ['{"plugins": [,]}', 'CONFIG_PARSE_ERROR'],
    ['{"value": }', 'CONFIG_PARSE_ERROR'],
    ['/* unfinished', 'CONFIG_PARSE_ERROR'],
    [Buffer.from([0xff]), 'CONFIG_PARSE_ERROR'],
    [Buffer.alloc(1024 * 1024 + 1), 'IO_ERROR'],
  ]) {
    f.write(input);
    assert.throws(() => f.apply(f.plan('install')), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(`${error.stack} ${JSON.stringify(error.details)}`, new RegExp(secret));
      if (code === 'CONFIG_PARSE_ERROR') assert.match(error.details.detail, /line \d+, column \d+/u);
      return true;
    });
    assert.deepEqual(readFileSync(f.path), Buffer.from(input));
    assert.deepEqual(readdirSync(f.root), ['opencode.jsonc']);
  }
  f.write('{}');
  for (const value of ['$HOME/.dotdotgod/adapters/opencode', '/home/test/.dotdotgod/adapters/opencode']) {
    assert.throws(() => f.apply(f.plan('install', value)), { code: 'PATH_OUTSIDE_ROOT' });
  }
  assert.equal(f.read(), '{}');
  rmSync(f.path);
  writeFileSync(join(f.root, 'outside'), '{}');
  symlinkSync('outside', f.path);
  assert.throws(() => f.apply(f.plan('install')), { code: 'SYMLINK_REJECTED' });
  assert.equal(readFileSync(join(f.root, 'outside'), 'utf8'), '{}');
});

test('semantic round-trip catches a corrupted candidate before any write', (t) => {
  const f = fixture(t);
  f.write('{"secret":"PRESERVE", "plugins":[]}');
  const stringify = JSON.stringify;
  t.mock.method(JSON, 'stringify', (value, ...args) => stringify(value === entry ? './wrong' : value, ...args));
  assert.throws(() => f.apply(f.plan('install')), { code: 'CONFIG_PARSE_ERROR' });
  assert.equal(f.read(), '{"secret":"PRESERVE", "plugins":[]}');
  assert.deepEqual(readdirSync(f.root), ['opencode.jsonc']);
});

test('stale config snapshot fails without replacing new bytes', (t) => {
  const f = fixture(t);
  f.write('{}');
  const plan = f.plan('install');
  f.write('{"concurrent":true}');
  assert.throws(() => f.apply(plan), { code: 'CONCURRENT_MODIFICATION' });
  assert.equal(f.read(), '{"concurrent":true}');
  assert.deepEqual(readdirSync(f.root), ['opencode.jsonc']);
});

test('host uses T3 scope paths, prefers JSONC, and detects legacy in the other project config', (t) => {
  const { root } = fixture(t);
  const env = { XDG_CONFIG_HOME: join(root, 'xdg') };
  const ctx = { cwd: root, homeDir: join(root, 'home'), env };
  const project = createMarkerStore(ctx, { host: 'opencode', scope: 'project', root });
  const json = join(root, 'opencode.json');
  const jsonc = join(root, 'opencode.jsonc');
  writeFileSync(json, '{}');
  const original = inspectOpenCodeConfig(project, { scope: 'project' });
  assert.deepEqual(original.edit, { path: json, kind: 'plugins', entry });
  writeFileSync(jsonc, '{}');
  assert.equal(inspectOpenCodeConfig(project, { scope: 'project' }).edit.path, jsonc);
  assert.equal(inspectOpenCodeConfig(project, { scope: 'project', marker: { sharedConfigEdits: [original.edit] } }).edit.path, json);
  writeFileSync(json, '{"plugins":["@dotdotgod/opencode"]}');
  const legacy = inspectOpenCodeConfig(project, { scope: 'project' });
  assert.equal(legacy.legacy, true);
  assert.throws(() => legacy.plan('install'), { code: 'LEGACY_COEXIST_CONFLICT' });
  assert.equal(readFileSync(jsonc, 'utf8'), '{}');

  const user = createMarkerStore(ctx, { host: 'opencode', scope: 'user' });
  const inspected = inspectOpenCodeConfig(user, { scope: 'user' });
  assert.deepEqual(inspected.edit, { path: join(env.XDG_CONFIG_HOME, 'opencode/opencode.jsonc'), kind: 'plugins', entry: user.installDir });
  assert.equal(existsSync(dirname(inspected.edit.path)), false);
  inspected.apply(inspected.plan('install'));
  assert.deepEqual(JSON.parse(readFileSync(inspected.edit.path, 'utf8')), { plugins: [user.installDir] });
  assert.equal(readFileSync(jsonc, 'utf8'), '{}');
});
