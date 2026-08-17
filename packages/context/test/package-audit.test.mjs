import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

function exportedTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(exportedTargets);
}

function filesBelow(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => filesBelow(join(path, name)));
}

test('context package manifest exports resolvable declared files and license', () => {
  assert.equal(manifest.name, '@dotdotgod/context');
  assert.equal(manifest.license, 'Elastic-2.0');
  assert.deepEqual(manifest.files, ['bin', 'src', 'README.md', 'LICENSE']);
  for (const target of exportedTargets(manifest.exports)) {
    assert.equal(target.startsWith('./'), true, `export must be package-relative: ${target}`);
    assert.equal(existsSync(resolve(packageRoot, target)), true, `missing export target: ${target}`);
  }
  for (const declared of manifest.files) {
    assert.equal(existsSync(join(packageRoot, declared)), true, `missing declared package file: ${declared}`);
  }
  const license = readFileSync(join(packageRoot, 'LICENSE'), 'utf8');
  assert.match(license, /^Elastic License 2\.0/m);
  assert.match(license, /elastic\.co\/licensing\/elastic-license/);
});

test('context package declares no context-mode dependency or known copied artifact', () => {
  const dependencyNames = Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
    ...manifest.devDependencies,
  });
  assert.equal(dependencyNames.some((name) => name === 'context-mode' || name.startsWith('@context-mode/')), false);

  const packageFiles = manifest.files.flatMap((entry) => filesBelow(join(packageRoot, entry)));
  const forbiddenNames = [/context-mode/i, /session-attribution\.bundle\.mjs/i, /routing-block\.mjs/i];
  for (const path of packageFiles) {
    assert.equal(forbiddenNames.some((pattern) => pattern.test(basename(path))), false, `known upstream artifact name found: ${path}`);
  }

  const textFiles = packageFiles.filter((path) => /\.(?:[cm]?js|ts|json|md)$/i.test(path));
  const forbiddenMarkers = ['context-mode.com/insight', 'ctx_upgrade', 'session-attribution.bundle.mjs'];
  for (const path of textFiles) {
    const content = readFileSync(path, 'utf8');
    for (const marker of forbiddenMarkers) assert.equal(content.includes(marker), false, `known upstream marker found in ${path}: ${marker}`);
  }
});
