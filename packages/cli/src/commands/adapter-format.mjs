import { isAbsolute, relative, sep } from 'node:path';
import { maskHomePath, sanitizeTerminalText, shellQuote } from '../primitives.mjs';

export function formatShellPath(path, home) {
  const rel = relative(home, path);
  if (!rel) return '"$HOME"';
  if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)) return '"$HOME"' + shellQuote(sanitizeTerminalText(`/${rel}`));
  return shellQuote(sanitizeTerminalText(path));
}

function prose(value, home) {
  return maskHomePath(sanitizeTerminalText(value), home);
}

function shellCommand(argv, home) {
  return argv.map((arg) => isAbsolute(arg) ? formatShellPath(arg, home)
    : /^[a-zA-Z0-9_:@./-]+$/u.test(arg) ? arg : shellQuote(sanitizeTerminalText(arg))).join(' ');
}

function commands(items, home, indent = '  ') {
  return items.flatMap(({ comment, argv }) => [
    ...(comment ? [`${indent}# ${prose(comment, home)}`] : []),
    ...(argv.length ? [`${indent}${shellCommand(argv, home)}`] : []),
  ]);
}

export function formatStatus(dto, home, single) {
  const { coreVersion, nodeVersion, opencodeInspected, hosts } = dto;
  const lines = [`dotdotgod adapter status (core v${prose(coreVersion, home)}, node v${prose(nodeVersion, home)})`];
  if (opencodeInspected) {
    const { scope, root } = opencodeInspected;
    lines.push(`opencode inspected: ${scope} (${prose(root, home)})`);
  }
  lines.push('');
  if (single) {
    const [{ host, status, scope, detail, installDir, runtime, modified, missing, skills }] = hosts;
    lines.push(`${host === 'pi' ? 'pi (skills)' : host}: ${status} (${scope})`, `  Detail: ${prose(detail, home)}`);
    if (installDir) lines.push(`  Target: ${prose(installDir, home)}`);
    if (runtime?.mode === 'pinned') lines.push(`  Node: ${prose(runtime.nodePath, home)}`, `  CLI: ${prose(runtime.cliEntry, home)}`);
    if (runtime?.mode === 'path') lines.push('  Runtime: dotdotgod on PATH');
    for (const path of missing ?? []) lines.push(`  Missing: ${prose(path, home)}`);
    for (const path of modified ?? []) lines.push(`  Modified: ${prose(path, home)}`);
    for (const { targetDir, owners } of skills?.skills ?? []) lines.push(`  Skill: ${prose(targetDir, home)} (owners: ${owners.join(', ')})`);
  } else {
    const row = (host, status, scope, detail) => `${host.padEnd(11)}  ${status.padEnd(14)}  ${scope.padEnd(7)}  ${detail}`;
    lines.push(row('HOST', 'STATUS', 'SCOPE', 'DETAIL'), row('-'.repeat(11), '-'.repeat(14), '-'.repeat(7), '-'.repeat(39)));
    for (const { host, status, scope, detail } of hosts) {
      const safe = prose(detail, home);
      lines.push(row(host === 'pi' ? 'pi (skills)' : prose(host, home), status, scope, safe.length > 39 ? `${safe.slice(0, 36)}...` : safe));
    }
  }
  const recovery = hosts.filter((host) => host.recovery.length > 0);
  if (recovery.length) {
    lines.push('', 'Recovery commands:');
    for (const { host, recovery: items } of recovery) lines.push(`  [${prose(host, home)}]`, ...commands(items, home, '    '));
  }
  return lines.join('\n');
}

function warnings(items, home) {
  return items.map(({ code, detail }) => `[WARNING] ${code === 'USE_PATH_RISK' ? '--use-path selected (USE_PATH_RISK)' : code}:\n  ${prose(detail, home)}${code === 'USE_PATH_RISK' ? '\n  Host MCP/hooks resolve dotdotgod on PATH. Omit --use-path to pin verified paths.' : ''}`);
}

function changes(items, dryRun, home) {
  const applied = { create: 'created', update: 'updated', remove: 'removed', skip: 'skipped' };
  return items.map(({ action, path, fileCount, detail }) => `  ${dryRun && action !== 'skip' ? `would_${action}` : applied[action]}  ${prose(path, home)}${fileCount === undefined ? '' : ` (${fileCount} files)`}${detail ? ` (${detail})` : ''}`);
}

function activation(host, installDir) {
  const entry = 'dotdotgod@dotdotgod';
  switch (host) {
    case 'claude-code': return [{ argv: ['claude', 'plugin', 'marketplace', 'add', installDir] },
      { argv: ['claude', 'plugin', 'install', entry] }, { comment: 'Refresh the marketplace on upgrade and restart Claude Code.', argv: [] }];
    case 'codex': return [{ argv: ['codex', 'plugin', 'marketplace', 'add', installDir] },
      { argv: ['codex', 'plugin', 'add', entry] }, { comment: 'Trust/enable the plugin, refresh it on upgrade, and restart Codex.', argv: [] }];
    case 'antigravity': return [{ comment: 'Restart Antigravity. If needed, enable the plugin:', argv: ['agy', 'plugin', 'enable', 'dotdotgod'] }];
    case 'opencode': return [{ comment: 'Reload OpenCode to load the configured plugin. Keep generated .dotdotgod/ files out of Git.', argv: [] }];
    case 'hermes': return [{ argv: ['hermes', 'plugins', 'enable', 'dotdotgod'] },
      { comment: 'Restart Hermes. Optionally configure plugin roots in Hermes (the installer does not edit config.yaml).', argv: [] }];
    case 'pi': return [{ comment: 'Install the Pi adapter separately:', argv: ['pi', 'install', 'npm:@dotdotgod/pi'] }];
  }
}

const cleanup = {
  'claude-code': [{ argv: ['claude', 'plugin', 'uninstall', 'dotdotgod@dotdotgod'] }, { argv: ['claude', 'plugin', 'marketplace', 'remove', 'dotdotgod'] }, { comment: 'Restart Claude Code.', argv: [] }],
  codex: [{ argv: ['codex', 'plugin', 'remove', 'dotdotgod@dotdotgod'] }, { comment: 'Restart Codex.', argv: [] }],
  antigravity: [{ comment: 'Restart Antigravity.', argv: [] }],
  opencode: [{ comment: 'Reload OpenCode.', argv: [] }],
  hermes: [{ argv: ['hermes', 'plugins', 'disable', 'dotdotgod'] }, { comment: 'Restart Hermes.', argv: [] }],
  pi: [{ comment: 'The Pi adapter is managed separately:', argv: ['pi', 'install', 'npm:@dotdotgod/pi'] }],
};

export function formatInstall(dto, home) {
  const { host, dryRun, scope, installDir, runtime, resolvedCli, nodeVersion } = dto;
  const lines = [`dotdotgod adapter install ${host} (${dryRun ? 'dry-run; no files written' : 'applied'})`];
  lines.push(...warnings(dto.warnings, home).flatMap((warning) => ['', warning]));
  if (runtime) lines.push('', 'Runtime binding:', runtime.mode === 'path'
    ? `  mode:   path (verified on PATH: ${prose(resolvedCli, home)}, node v${nodeVersion})`
    : `  mode:   pinned (node v${nodeVersion})\n  node:   ${prose(runtime.nodePath, home)}\n  entry:  ${prose(runtime.cliEntry, home)}`,
  `  scope:  ${scope}`, `  target: ${prose(installDir, home)}`);
  lines.push('', dryRun ? 'Planned changes:' : 'Applied changes:', ...changes(dto.changes, dryRun, home));
  if (dto.untouchedConfig.length) lines.push('', 'Untouched host config:', ...dto.untouchedConfig.map((path) => `  ${prose(path, home)} is not modified by dotdotgod.`));
  lines.push('', `Post-install activation${dryRun ? ' (after applying without --dry-run)' : ''}:`, ...commands(activation(host, installDir), home));
  return lines.join('\n');
}

export function formatUninstall(dto, home) {
  const { host, dryRun, changes: items, preserved, withSkills } = dto;
  const lines = [`dotdotgod adapter uninstall ${host} (${dryRun ? 'dry-run; no files written' : 'removed'})`];
  lines.push(...warnings(dto.warnings, home).flatMap((warning) => ['', warning]));
  lines.push('', dryRun ? 'Planned changes:' : 'Removed / Updated:', ...(items.length ? changes(items, dryRun, home) : ['  No owned changes.']), '',
    'Preserved data (never deleted by adapter uninstall):',
    '  - Project data: .dotdotgod/, docs/, dotdotgod.config.json',
    '  - Global data:  ~/.dotdotgod/{config.json,templates/,runtime/embedding/}',
    '  - Codex plans:  $CODEX_HOME/dotdotgod-plan-*.config.toml');
  if (preserved.length) lines.push('', `Optional skills (${withSkills ? 'shared; preserved' : 'preserved by default'}):`, ...preserved.map(({ targetDir, owners }) =>
    `  ${prose(targetDir, home)} (active owners: ${owners.join(', ') || 'none'})`));
  if (!withSkills) lines.push('  Pass --with-skills to remove unshared dotdotgod-owned skills.');
  lines.push('', `Host cleanup (manual${dryRun ? ', after removal' : ''}):`, ...commands(cleanup[host], home));
  return lines.join('\n');
}

export function formatSetupPlan(dto, home) {
  const { dryRun, codexVersion, root, profile, planDir, catalogPath, modelCount, profilePath, launch, boundary, next, apply } = dto;
  const action = dryRun ? 'would_create' : 'created';
  return [
    `dotdotgod adapter setup-plan codex (${dryRun ? 'preview; pass --confirm to write' : 'applied'})`, '',
    'Preconditions:', `  codex:   codex-cli ${codexVersion} (pinned OK)`, `  root:    ${prose(root, home)}`, `  profile: ${profile}`, '',
    `${dryRun ? 'Planned' : 'Written'} files (mode 0600 for files, fail-closed if already present):`,
    `  ${action}  ${prose(planDir, home)}/ (dir, if missing)`,
    `  ${action}  ${prose(catalogPath, home)} (${modelCount} models)`, `  ${action}  ${prose(profilePath, home)}`, '',
    `Launch command${dryRun ? ' (after --confirm)' : ''}:`, `  ${shellCommand(launch, home)}`, '',
    prose(boundary, home), `  ${prose(next, home)}`,
    ...(dryRun ? ['', 'Apply this plan profile:', `  ${shellCommand(apply, home)}`] : []),
  ].join('\n');
}

export function formatError({ code, target, detail, affectedPaths, recovery }, home, fallback = 'adapter') {
  return [`Error [${code}]: ${prose(detail, home)}`, `  target: ${prose(target ?? fallback, home)}`,
    ...((affectedPaths ?? []).map((path) => `  affected: ${prose(path, home)}`)), '  recovery:', ...commands(recovery, home, '    '),
  ].join('\n');
}
