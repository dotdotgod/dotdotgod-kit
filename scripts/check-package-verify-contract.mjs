#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packagesDir = join(root, 'packages');
const checkFamilies = new Set(['syntax', 'typecheck', 'test', 'lint', 'check']);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function shellReferencesScript(command, scriptName) {
  const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s;&|()])(?:pnpm|npm|yarn|bun)?\\s*(?:run\\s+)?${escaped}($|[\\s;&|()])`).test(command);
}

const failures = [];
const checkedPackages = [];

for (const entry of readdirSync(packagesDir).sort()) {
  const packageDir = join(packagesDir, entry);
  if (!statSync(packageDir).isDirectory()) continue;

  const packageJsonPath = join(packageDir, 'package.json');
  const packageJson = readJson(packageJsonPath);
  const scripts = packageJson.scripts || {};
  const checkScripts = Object.keys(scripts).filter((scriptName) => checkFamilies.has(scriptName.split(':')[0]));

  if (checkScripts.length === 0) continue;

  checkedPackages.push(packageJson.name || entry);
  const verify = scripts.verify;
  if (!verify) {
    failures.push(`${packageJson.name || entry}: missing verify script for ${checkScripts.join(', ')}`);
    continue;
  }

  const missing = checkScripts.filter((scriptName) => !shellReferencesScript(verify, scriptName));
  if (missing.length > 0) {
    failures.push(`${packageJson.name || entry}: verify script does not reference ${missing.join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error('package verify contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`package verify contract passed (${checkedPackages.length} packages checked)`);
