import assert from 'node:assert/strict';
import test from 'node:test';
import { composeEnvironment } from '../src/environment-policy.mjs';

test('inherits compatibility variables while filtering common runtime injection variables', () => {
  const result = composeEnvironment({
    inherited: {
      PATH: '/usr/bin',
      HOME: '/home/example',
      LANG: 'en_US.UTF-8',
      NODE_OPTIONS: '--require ./inject.mjs',
      PYTHONPATH: '/tmp/python-inject',
      RUBYOPT: '-r/tmp/ruby-inject',
      TOKEN: 'must-not-appear-in-policy-metadata',
    },
    platform: 'linux',
  });

  assert.deepEqual(result.env, {
    HOME: '/home/example',
    LANG: 'en_US.UTF-8',
    PATH: '/usr/bin',
    TOKEN: 'must-not-appear-in-policy-metadata',
  });
  assert.deepEqual(result.policy, {
    mode: 'inherit-filtered-v1',
    platform: 'posix',
    filteredNames: ['NODE_OPTIONS', 'PYTHONPATH', 'RUBYOPT'],
  });
  assert.doesNotMatch(JSON.stringify(result.policy), /inject|must-not-appear/);
});

test('applies platform-specific loader filtering', () => {
  const inherited = {
    DYLD_INSERT_LIBRARIES: '/tmp/darwin.dylib',
    LD_PRELOAD: '/tmp/linux.so',
    PATH: '/bin',
  };

  const linux = composeEnvironment({ inherited, platform: 'linux' });
  assert.equal(linux.env.DYLD_INSERT_LIBRARIES, '/tmp/darwin.dylib');
  assert.equal(linux.env.LD_PRELOAD, undefined);
  assert.deepEqual(linux.policy.filteredNames, ['LD_PRELOAD']);

  const darwin = composeEnvironment({ inherited, platform: 'darwin' });
  assert.equal(darwin.env.DYLD_INSERT_LIBRARIES, undefined);
  assert.equal(darwin.env.LD_PRELOAD, undefined);
  assert.deepEqual(darwin.policy.filteredNames, ['DYLD_INSERT_LIBRARIES', 'LD_PRELOAD']);

  const windows = composeEnvironment({ inherited, platform: 'win32' });
  assert.equal(windows.env.DYLD_INSERT_LIBRARIES, '/tmp/darwin.dylib');
  assert.equal(windows.env.LD_PRELOAD, '/tmp/linux.so');
  assert.deepEqual(windows.policy.filteredNames, []);
});

test('applies string overrides and explicit deletion without mutating inputs', () => {
  const inherited = { HOME: '/home/old', PATH: '/bin', KEEP: 'yes' };
  const overrides = { HOME: '/home/new', KEEP: null, EXTRA: 'added' };
  const result = composeEnvironment({ inherited, overrides, platform: 'linux' });

  assert.deepEqual(result.env, { EXTRA: 'added', HOME: '/home/new', PATH: '/bin' });
  assert.deepEqual(inherited, { HOME: '/home/old', PATH: '/bin', KEEP: 'yes' });
  assert.deepEqual(overrides, { HOME: '/home/new', KEEP: null, EXTRA: 'added' });
});

test('rejects invalid names, invalid values, and reserved overrides', () => {
  assert.throws(
    () => composeEnvironment({ inherited: { 'BAD=NAME': 'value' } }),
    /Invalid environment variable name/,
  );
  assert.throws(
    () => composeEnvironment({ inherited: { VALID: 42 } }),
    /must be a string or undefined/,
  );
  assert.throws(
    () => composeEnvironment({ overrides: { VALID: undefined } }),
    /must be a string or null/,
  );
  assert.throws(
    () => composeEnvironment({ overrides: { NODE_OPTIONS: '--inspect' } }),
    /reserved by the execution policy/,
  );
  assert.throws(() => composeEnvironment({ inherited: [] }), /inherited must be an object/);
  assert.throws(() => composeEnvironment({ overrides: null }), /overrides must be an object/);
});

test('canonicalizes Windows names for deterministic case-insensitive overrides', () => {
  const result = composeEnvironment({
    inherited: { Path: 'first', PATH: 'second', node_options: '--inspect' },
    overrides: { path: 'override', TEMP: 'C:\\Temp' },
    platform: 'win32',
  });

  assert.deepEqual(result.env, { PATH: 'override', TEMP: 'C:\\Temp' });
  assert.deepEqual(result.policy.filteredNames, ['NODE_OPTIONS']);
});

test('returns deterministic key and filtered-name order', () => {
  const first = composeEnvironment({
    inherited: { ZED: 'z', NODE_OPTIONS: 'x', ALPHA: 'a', PYTHONPATH: 'y' },
    platform: 'linux',
  });
  const second = composeEnvironment({
    inherited: { PYTHONPATH: 'y', ALPHA: 'a', NODE_OPTIONS: 'x', ZED: 'z' },
    platform: 'linux',
  });

  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first.env), ['ALPHA', 'ZED']);
  assert.deepEqual(first.policy.filteredNames, ['NODE_OPTIONS', 'PYTHONPATH']);
});
