import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readWorkflow } from '../workflows.mjs';

const assets = new URL('../../../assets/adapters/hermes/', import.meta.url);
const initializer = new URL('../../../assets/initializer/', import.meta.url);
const routing = 'Use the selected repository and the dotdotgod toolset. Prefer project_initialize, project_load, and project_impact for their respective workflows. Inspect content, structuredContent, and isError. Pending impact is advisory and never blocks tools; preserve host permissions. Hermes uses its native delegate_task for delegation and this plugin does not provide Plan Mode.';
const skills = [
  ['project-initializer', 'Project Initializer', 'init'],
  ['project-load', 'Project Load', 'load'],
  ['impact-review', 'Impact Review', 'impact'],
];

function copyInitializer(files, dir, prefix) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) copyInitializer(files, new URL(`${entry.name}/`, dir), target);
    else if (entry.isFile()) files.set(target, readFileSync(new URL(entry.name, dir)));
  }
}

export function renderHermesFiles(binding) {
  const files = new Map();
  for (const name of ['__init__.py', 'impact.py', 'policy.py', 'proxy.py', 'runtime.py', 'plugin.yaml', 'tools.json']) {
    files.set(name, readFileSync(new URL(name, assets)));
  }
  files.set('LICENSE', readFileSync(new URL('../../../LICENSE', import.meta.url)));
  files.set('runtime.json', Buffer.from(JSON.stringify(binding, null, 2) + '\n'));
  for (const [name, title, workflow] of skills) {
    const body = readWorkflow(workflow).replace('{{INIT_SCRIPT_COMMAND}}', 'sh <resolved-skill-directory>/scripts/init_project.sh <project-root>');
    files.set(`skills/${name}/SKILL.md`, Buffer.from(`---\nname: ${name}\ndescription: ${title} for dotdotgod project memory in Hermes CLI and messaging gateway.\n---\n\n# ${title}\n\n${routing}\n\n${body}`));
  }
  copyInitializer(files, initializer, 'skills/project-initializer');
  return files;
}

export function detectHermesLegacy({ installDir, installFs }) {
  try {
    if (!installFs.inspect(installDir).stat?.isDirectory()) return false;
  } catch (error) {
    // The legacy development install linked the plugin directory itself.
    if (error.code === 'SYMLINK_REJECTED' && error.details.target === installDir) return true;
    throw error;
  }
  return installFs.inspect(join(installDir, 'mcp/bridge.mjs')).stat?.isFile() ?? false;
}
