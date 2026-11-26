import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdapterFs } from '../fs-safety.mjs';
import { runtimeArgv, runtimeHookCommand } from '../runtime-binding.mjs';
import { readWorkflow } from '../workflows.mjs';

const initializer = fileURLToPath(new URL('../../../assets/initializer/', import.meta.url));
const workflows = [
  ['load', 'project-load', 'Load project memory', '[optional focus]'],
  ['init', 'project-initializer', 'Initialize project memory and config', '[project-root] [--claude-plans] [--dry-run]'],
  ['plan', 'doc-first-planning', 'Plan work from maintained repository documentation', '<task or change request>'],
  ['impact', 'impact-review', 'Review changed-file graph impact', '[changed path or focus]'],
];

export function renderClaudeCodeFiles(binding, { coreVersion }) {
  const files = new Map();
  const json = (path, content) => files.set(path, Buffer.from(JSON.stringify(content, null, 2) + '\n'));
  const [command, ...args] = runtimeArgv(binding, ['mcp']);
  const name = 'dotdotgod';
  json('.claude-plugin/marketplace.json', {
    name, owner: { name }, plugins: [{ name, source: './plugin' }],
  });
  json('plugin/.claude-plugin/plugin.json', {
    name, version: coreVersion, description: 'Docs-first project memory and advisory impact review.',
    author: { name }, mcpServers: { 'dotdotgod-context': { command, args } },
  });
  const hook = (event) => ({ type: 'command', command: runtimeHookCommand(binding, ['hook', 'claude-code', event]) });
  json('plugin/hooks/hooks.json', { hooks: {
    SessionStart: [{ matcher: '', hooks: [hook('sessionstart')] }],
    UserPromptSubmit: [{ hooks: [{ ...hook('userpromptsubmit'), timeout: 25 }] }],
    PostToolUse: [{ matcher: 'Edit|Write|MultiEdit|mcp__.*', hooks: [hook('posttooluse')] }],
  } });
  for (const [workflow, skill, title, hint] of workflows) {
    let body = readWorkflow(workflow);
    if (workflow === 'init') {
      const fallback = 'sh "${CLAUDE_PLUGIN_ROOT}/skills/project-initializer/scripts/init_project.sh" <project-root>';
      body = body.replace('{{INIT_SCRIPT_COMMAND}}', fallback) + `
## Native Plan Storage

Only after the user opts in, add \`--claude-plans\` to the CLI initialization command. It adds project-local \`plansDirectory\` without replacing an existing value or changing permissions. Preview with \`--dry-run\`. For this option use \`${runtimeHookCommand(binding, ['init'])}\`; the shell fallback does not support it. Native file names remain Claude Code-owned; shared task plans use task directories and README.md.
`;
    }
    const tools = ['Read', 'Glob', 'Grep', 'Bash', ...(['init', 'plan'].includes(workflow) ? ['Write', 'Edit'] : [])];
    files.set(`plugin/commands/dd/${workflow}.md`, Buffer.from(`---\ndescription: ${title}\nargument-hint: ${JSON.stringify(hint)}\nallowed-tools: [${tools.join(', ')}]\n---\n\n# /dd:${workflow} — ${title}\n\nArguments: \`$ARGUMENTS\`\n\n${body}`));
    files.set(`plugin/skills/${skill}/SKILL.md`, Buffer.from(`---\nname: ${skill}\ndescription: ${title}. Use for dd:${workflow} requests.\n---\n\n# ${title}\n\n${body}`));
  }
  for (const entry of readdirSync(initializer, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(`plugin/skills/project-initializer/${relative(initializer, path).split(sep).join('/')}`, readFileSync(path));
  }
  return files;
}

export function detectClaudeCodeLegacy({ ctx: { homeDir } }) {
  const claude = join(homeDir, '.claude');
  const plugins = join(claude, 'plugins');
  const cache = join(plugins, 'cache');
  const fs = createAdapterFs({ root: claude, homeDir });
  const isDirectory = (path) => fs.inspect(path).stat?.isDirectory() === true;
  try {
    if (![claude, plugins, cache].every(isDirectory)) return false;
    for (const market of readdirSync(cache, { withFileTypes: true })) {
      if (!market.isDirectory()) continue;
      const plugin = join(cache, market.name, 'dotdotgod');
      const versions = isDirectory(join(cache, market.name)) && fs.inspect(plugin).stat;
      if (!versions?.isDirectory()) continue;
      for (const version of readdirSync(plugin, { withFileTypes: true })) {
        if (!version.isDirectory() && !version.isSymbolicLink()) continue;
        const path = join(plugin, version.name);
        const mcp = join(path, 'mcp');
        try {
          if (isDirectory(path) && isDirectory(mcp)
            && ['server.mjs', 'cli.mjs'].some((file) => fs.inspect(join(mcp, file)).stat?.isFile())) return true;
        } catch (error) {
          if (error.code !== 'SYMLINK_REJECTED') throw error;
          if (error.details.target === path) return true;
        }
      }
    }
  } catch (error) {
    if (error.code !== 'SYMLINK_REJECTED') throw error;
    const rel = relative(cache, error.details.target).split(sep);
    // A link at cache/<market>/dotdotgod is a candidate, not a link at the cache or market itself.
    return rel.length === 2 && rel[0] !== '..' && rel[1] === 'dotdotgod';
  }
  return false;
}
