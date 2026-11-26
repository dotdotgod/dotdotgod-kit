import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterError } from '../errors.mjs';
import { createAdapterFs } from '../fs-safety.mjs';
import { applyJsoncEdit, planJsoncEdit, PROJECT_PLUGIN_ENTRY, readJsoncConfig } from '../jsonc-edit.mjs';

const assets = fileURLToPath(new URL('../../../assets/adapters/opencode/', import.meta.url));

export function openCodeFiles(binding) {
  const files = new Map();
  for (const path of readdirSync(assets, { recursive: true, withFileTypes: true })) {
    if (!path.isFile()) continue;
    // The installer owns relative paths, not the packaged source paths.
    const source = join(path.parentPath, path.name);
    files.set(relative(assets, source).split(sep).join('/'), readFileSync(source));
  }
  files.set('runtime.json', Buffer.from(JSON.stringify(binding, null, 2) + '\n'));
  return files;
}

export function inspectOpenCodeConfig(store, { scope, marker }) {
  const configs = store.configPaths.map((path) => {
    const fs = createAdapterFs({ root: dirname(path), homeDir: store.ctx.homeDir });
    return { fs, config: readJsoncConfig(fs, path) };
  });
  const owned = marker?.sharedConfigEdits[0];
  const selected = (owned && configs.find(({ config }) => config.path === owned.path))
    || configs.find(({ config }) => config.snapshot !== null) || configs[0];
  const { fs, config } = selected;
  const entry = scope === 'project' ? PROJECT_PLUGIN_ENTRY : store.installDir;
  const edit = { path: config.path, kind: 'plugins', entry };
  const legacy = configs.find(({ config }) => config.legacy)?.config.path;
  return {
    legacy: Boolean(legacy),
    present: config.plugins.includes(entry),
    edit,
    plan(operation) {
      if (legacy) throw adapterError('LEGACY_COEXIST_CONFLICT', { target: legacy });
      const other = operation === 'install' && configs.find((candidate) => candidate !== selected
        && candidate.config.plugins.some((item) => (Array.isArray(item) ? item[0] : item) === entry));
      if (other) throw adapterError('UNMANAGED_CONFLICT', { target: other.config.path });
      return planJsoncEdit(config, { scope, entry, operation });
    },
    apply: (plan) => applyJsoncEdit(fs, plan),
  };
}
