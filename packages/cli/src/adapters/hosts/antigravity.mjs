import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeArgv, runtimeHookCommand } from '../runtime-binding.mjs';
import { readWorkflow } from '../workflows.mjs';

const assets = new URL('../../../assets/adapters/antigravity/', import.meta.url);
const initializer = fileURLToPath(new URL('../../../assets/initializer/', import.meta.url));
const skills = [
  ['init', 'Initialize project memory and config'],
  ['load', 'Load bounded project memory'],
  ['impact', 'Review changed-file graph impact'],
];

export function renderAntigravityFiles(binding, { coreVersion }) {
  const files = new Map();
  const json = (path, content) => files.set(path, Buffer.from(JSON.stringify(content, null, 2) + '\n'));
  for (const path of ['assets/logo.svg', 'rules/AGENTS.md', 'README.md', 'LICENSE']) {
    files.set(path, readFileSync(new URL(path, assets)));
  }
  const manifest = JSON.parse(readFileSync(new URL('plugin.json', assets), 'utf8'));
  json('plugin.json', { ...manifest, version: coreVersion });
  const [command, ...args] = runtimeArgv(binding, ['mcp']);
  json('mcp_config.json', { mcpServers: { context: { command, args } } });
  const hooks = JSON.parse(readFileSync(new URL('hooks.json', assets), 'utf8'));
  hooks.dotdotgod.PreInvocation[0].command = runtimeHookCommand(binding, ['hook', 'antigravity', 'preinvocation']);
  hooks.dotdotgod.PostToolUse[0].hooks[0].command = runtimeHookCommand(binding, ['hook', 'antigravity', 'posttooluse']);
  json('hooks.json', hooks);
  for (const [workflow, title] of skills) {
    const name = `dd-${workflow}`;
    const body = readWorkflow(workflow).replace('{{INIT_SCRIPT_COMMAND}}', 'sh <resolved-skill-directory>/scripts/init_project.sh <project-root>');
    files.set(`skills/${name}/SKILL.md`, Buffer.from(`---\nname: ${name}\ndescription: ${title}. Use for /${name} or dd:${workflow} requests.\n---\n\n# ${title}\n\nUse \`dotdotgod_context\` for MCP. Preserve native /plan approval gates and host permissions. Pending impact is advisory and never blocks tools.\n\n${body}`));
  }
  for (const entry of readdirSync(initializer, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(`skills/dd-init/${relative(initializer, path).split(sep).join('/')}`, readFileSync(path));
  }
  return files;
}

export function detectAntigravityLegacy({ installDir, installFs }) {
  try {
    if (!installFs.inspect(installDir).stat?.isDirectory()) return false;
  } catch (error) {
    if (error.code === 'SYMLINK_REJECTED') return error.details.target === installDir;
    throw error;
  }
  return [['mcp', 'server.mjs'], ['scripts', 'hook-runtime.mjs']].some(([directory, file]) => {
    const parent = join(installDir, directory);
    try {
      return installFs.inspect(parent).stat?.isDirectory() === true
        && installFs.inspect(join(parent, file)).stat?.isFile() === true;
    } catch (error) {
      if (error.code === 'SYMLINK_REJECTED') return false;
      throw error;
    }
  });
}
