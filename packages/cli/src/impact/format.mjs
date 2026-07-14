import { commandUsage } from '../cli/usage.mjs';

function formatCompactImpactGroup(name, group) {
  const items = group?.items ?? [];
  if (items.length === 0) return [];
  return [
    `${name}:`,
    ...items.map((item) => {
      const label = item.type === 'contract' && item.path && item.contractId ? `${item.path}#${item.contractId}${item.title ? ` — ${item.title}` : ''}` : item.path ?? item.command ?? item.name ?? item.target ?? item.id;
      const reasons = (item.reasons ?? []).slice(0, 3).join(', ');
      return `- ${label} (${item.impactScore}; ${reasons})`;
    }),
  ];
}

export function formatCompactImpactOutput(payload, impact) {
  const refreshNote = payload.metadata.cacheRefreshed ? ', refreshed' : '';
  const lines = [`graph impact compact: ${impact.related.length} related node(s), ${impact.omittedRelated ?? 0} omitted (${payload.status.status}${refreshNote} index)`, `changed files: ${(impact.changedFiles ?? [impact.changed]).join(', ')}`];
  for (const entry of impact.perSeed ?? []) lines.push(...formatCompactImpactGroup(`top for ${entry.changed}`, { items: entry.related }));
  for (const name of ['docs', 'contracts', 'tests', 'files', 'commands', 'events', 'packageResources', 'symbols']) lines.push(...formatCompactImpactGroup(name, impact.groups[name]));
  return lines.join('\n');
}

function ymlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(String(value));
}

function ymlList(values = []) {
  return `[${values.map(ymlScalar).join(', ')}]`;
}

function formatYmlImpactItem(item) {
  const label = item.path ?? item.command ?? item.name ?? item.target ?? item.id;
  const lines = [`        - path: ${ymlScalar(label)}`];
  lines.push(`          id: ${ymlScalar(item.id)}`);
  lines.push(`          type: ${ymlScalar(item.type)}`);
  lines.push(`          score: ${ymlScalar(item.impactScore)}`);
  lines.push(`          reasons: ${ymlList((item.reasons ?? []).slice(0, 6))}`);
  if (item.contractId) lines.push(`          contract_id: ${ymlScalar(item.contractId)}`);
  if (item.title) lines.push(`          title: ${ymlScalar(item.title)}`);
  if (Array.isArray(item.sections) && item.sections.length > 0) lines.push(`          sections: ${ymlList(item.sections)}`);
  if (item.retrieval?.area) lines.push(`          area: ${ymlScalar(item.retrieval.area)}`);
  if (item.retrieval?.role) lines.push(`          role: ${ymlScalar(item.retrieval.role)}`);
  return lines;
}

function formatYmlImpactGroup(name, group) {
  const items = group?.items ?? [];
  const lines = [`    ${name}:`, `      omitted: ${group?.omitted ?? 0}`, '      items:'];
  if (items.length === 0) lines.push('        []');
  else for (const item of items) lines.push(...formatYmlImpactItem(item));
  return lines;
}

export function formatYmlImpactOutput(payload, impact) {
  const lines = [
    'impact:',
    `  ok: ${payload.ok ? 'true' : 'false'}`,
    `  changed: ${ymlScalar(payload.changed)}`,
    `  changed_files: ${ymlList(payload.changedFiles ?? [payload.changed])}`,
    `  root: ${ymlScalar(payload.root)}`,
    '  output: "yml"',
    '  status:',
    `    index: ${ymlScalar(payload.status.status)}`,
    `    cache_refreshed: ${payload.metadata.cacheRefreshed ? 'true' : 'false'}`,
    `  related_count: ${impact.related.length}`,
    `  omitted_related: ${impact.omittedRelated ?? 0}`,
    '  ranking:',
    `    method: ${ymlScalar(impact.ranking?.method)}`,
    `    preset: ${ymlScalar(impact.ranking?.preset)}`,
    `    config_source: ${ymlScalar(impact.ranking?.configSource)}`,
    '  per_seed:',
  ];
  for (const entry of impact.perSeed ?? []) {
    lines.push(`    - changed: ${ymlScalar(entry.changed)}`);
    lines.push(`      omitted_related: ${entry.omittedRelated ?? 0}`);
    lines.push('      related:');
    if ((entry.related ?? []).length === 0) lines.push('        []');
    else for (const item of entry.related) lines.push(...formatYmlImpactItem(item));
  }
  lines.push('  groups:');
  for (const name of ['docs', 'contracts', 'tests', 'files', 'commands', 'events', 'packageResources', 'symbols']) lines.push(...formatYmlImpactGroup(name, impact.groups[name]));
  lines.push('  recommended_actions:');
  lines.push('    - "review_related_docs"');
  lines.push('    - "run_related_tests"');
  lines.push('    - "run_dotdotgod_validate"');
  return lines.join('\n');
}

export function formatYmlGraphImpactError(options, message, code = 'GRAPH_IMPACT_ERROR') {
  return [
    'impact:',
    '  ok: false',
    '  command: "graph impact"',
    '  output: "yml"',
    `  compact: ${options.compact ? 'true' : 'false'}`,
    `  root: ${ymlScalar(options.root)}`,
    '  error:',
    `    code: ${ymlScalar(code)}`,
    `    message: ${ymlScalar(message)}`,
    `  usage: ${ymlScalar(commandUsage('graph impact'))}`,
  ].join('\n');
}
