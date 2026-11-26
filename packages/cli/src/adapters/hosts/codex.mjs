import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdapterFs } from '../fs-safety.mjs';
import { runtimeArgv, runtimeHookCommand } from '../runtime-binding.mjs';
import { readWorkflow } from '../workflows.mjs';

const assets = new URL('../../../assets/adapters/codex/', import.meta.url);
const initializer = fileURLToPath(new URL('../../../assets/initializer/', import.meta.url));
const workflows = [
  ['load', 'project-load', 'Load project memory'],
  ['init', 'project-initializer', 'Initialize project memory and config'],
  ['plan', 'doc-first-planning', 'Plan work from maintained repository documentation'],
  ['impact', 'impact-review', 'Review changed-file graph impact'],
];
const plugin = 'plugins/dotdotgod';

export function renderCodexFiles(binding, { coreVersion }) {
  const files = new Map();
  const json = (path, content) => files.set(path, Buffer.from(JSON.stringify(content, null, 2) + '\n'));
  json('.agents/plugins/marketplace.json', {
    name: 'dotdotgod', interface: { displayName: 'Dotdotgod' }, plugins: [{
      name: 'dotdotgod', source: { source: 'local', path: './plugins/dotdotgod' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity',
    }],
  });
  const manifest = JSON.parse(readFileSync(new URL('plugin.json', assets), 'utf8'));
  json(`${plugin}/.codex-plugin/plugin.json`, { ...manifest, version: coreVersion });
  const [command, ...args] = runtimeArgv(binding, ['mcp']);
  json(`${plugin}/.mcp.json`, { mcpServers: { 'dotdotgod-context': { command, args } } });
  const hooks = JSON.parse(readFileSync(new URL('hooks.json', assets), 'utf8'));
  for (const [event, groups] of Object.entries(hooks.hooks)) {
    for (const group of groups) for (const hook of group.hooks) {
      hook.command = runtimeHookCommand(binding, ['hook', 'codex', event.toLowerCase()]);
    }
  }
  json(`${plugin}/hooks/hooks.json`, hooks);
  for (const [workflow, skill, title] of workflows) {
    const body = readWorkflow(workflow).replace('{{INIT_SCRIPT_COMMAND}}', 'sh <resolved-skill-directory>/scripts/init_project.sh <project-root>');
    files.set(`${plugin}/skills/${skill}/SKILL.md`, Buffer.from(`---\nname: ${skill}\ndescription: ${title}. Use for dd:${workflow} requests.\n---\n\n# ${title}\n\n${body}`));
  }
  for (const entry of readdirSync(initializer, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(`${plugin}/skills/project-initializer/${relative(initializer, path).split(sep).join('/')}`, readFileSync(path));
  }
  files.set(`${plugin}/LICENSE`, readFileSync(new URL('../../../LICENSE', import.meta.url)));
  return files;
}

export function detectCodexLegacy({ installDir, ctx: { homeDir } }) {
  const plugins = dirname(installDir);
  const codexHome = dirname(plugins);
  const fs = createAdapterFs({ root: codexHome, homeDir });
  const isDirectory = (path) => fs.inspect(path).stat?.isDirectory() === true;
  function isLegacy(path) {
    try {
      const mcp = join(path, 'mcp');
      return isDirectory(path) && isDirectory(mcp) && fs.inspect(join(mcp, 'server.mjs')).stat?.isFile() === true;
    } catch (error) {
      // Only an exact old plugin location (or its version directory) identifies a dev link.
      if (error.code === 'SYMLINK_REJECTED') return error.details.target === path;
      throw error;
    }
  }
  try {
    if (!isDirectory(codexHome) || !isDirectory(plugins)) return false;
    if (isLegacy(join(plugins, 'dotdotgod'))) return true;
    if (isDirectory(installDir) && isDirectory(join(installDir, 'plugins')) && isLegacy(join(installDir, plugin))) return true;
    const cache = join(plugins, 'cache');
    const market = join(cache, 'dotdotgod');
    const versions = join(market, 'dotdotgod');
    if (!isDirectory(cache) || !isDirectory(market) || !isDirectory(versions)) return false;
    return readdirSync(versions, { withFileTypes: true }).some((entry) =>
      (entry.isDirectory() || entry.isSymbolicLink()) && isLegacy(join(versions, entry.name)));
  } catch (error) {
    if (error.code === 'SYMLINK_REJECTED') return false;
    throw error;
  }
}
