import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportTraceability } from './obsidian-traceability-export.mjs';
import { readMemoryConfig } from '../packages/cli/src/memory/config.mjs';

const root = await mkdtemp(join(tmpdir(), 'dotdotgod-obsidian-'));
try {
  const defaults = readMemoryConfig(root);
  assert.equal(defaults.errors?.length ?? 0, 0);
  assert.ok(defaults.traceability.keys.length > 0);
  await mkdir(join(root, 'docs/spec'), { recursive: true });
  await writeFile(join(root, 'implementation.mjs'), 'export const value = 1;');
  await writeFile(join(root, 'docs/spec/FEATURE.md'), '# Feature\n\n```yaml\ntraceability:\n  implementedBy:\n    - implementation.mjs\n```\n');
  const graph = await exportTraceability(root);
  assert.equal(graph.version, 1);
  assert.equal(graph.types.length, defaults.traceability.keys.length);
  assert.ok(graph.edges.every(e => graph.types.some(t => t.relation === e.relation && t.weight === e.weight)));
  await writeFile(join(root, 'dotdotgod.config.json'), '{bad json');
  await assert.rejects(exportTraceability(root), /MEMORY_CONFIG_INVALID_JSON/);
  console.log('Default configuration, resolved weights, and invalid configuration checks passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
