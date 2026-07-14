import { commandUsage, parseCommon, usage } from '../cli/usage.mjs';
import { buildCommunities } from '../graph/communities.mjs';
import { graphSummary, readFreshIndex } from '../index/cache.mjs';
import { buildCompactImpactReport, buildImpactReport } from '../impact/report.mjs';
import { formatCompactImpactOutput, formatYmlGraphImpactError, formatYmlImpactOutput } from '../impact/format.mjs';

const MAX_CHANGED_FILES = 20;

export function parseGraphOptions(argv) {
  const filtered = [];
  const changed = [];
  let compact = false;
  let yml = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--changed') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        changed.push(next);
        i += 1;
      }
    } else if (argv[i] === '--compact') compact = true;
    else if (argv[i] === '--yml' || argv[i] === '--yaml') yml = true;
    else filtered.push(argv[i]);
  }
  const options = parseCommon(filtered);
  options.changed = [...new Set(changed)];
  options.compact = compact;
  options.yml = yml;
  return options;
}

export async function runGraph(argv) {
  const sub = argv[0];
  const isImpact = sub === 'impact';
  if (!['impact', 'communities'].includes(sub)) usage(sub ? `Unknown graph command: ${sub}` : 'Missing graph command.', 'graph');
  const options = parseGraphOptions(argv.slice(1));
  if (isImpact && [options.json, options.compact, options.yml].filter(Boolean).length > 1) {
    const message = 'Choose only one graph impact output mode: --compact, --json, or --yml/--yaml.';
    if (options.json) console.log(JSON.stringify({ ok: false, command: 'graph impact', compact: options.compact || undefined, yml: options.yml || undefined, root: options.root, error: { code: 'OUTPUT_MODE_CONFLICT', message }, usage: commandUsage('graph impact') }, null, 2));
    else if (options.yml) console.log(formatYmlGraphImpactError(options, message, 'OUTPUT_MODE_CONFLICT'));
    else usage(message, 'graph impact');
    process.exit(2);
  }
  if (isImpact && options.changed.length === 0) {
    const message = 'Missing required option: --changed <path>. Run `dotdotgod graph impact <root> --changed <path>`.';
    if (options.json) {
      console.log(JSON.stringify({ ok: false, command: 'graph impact', compact: options.compact || undefined, root: options.root, error: { code: 'MISSING_CHANGED', message }, usage: commandUsage('graph impact') }, null, 2));
      process.exit(2);
    }
    if (options.yml) {
      console.log(formatYmlGraphImpactError(options, message, 'MISSING_CHANGED'));
      process.exit(2);
    }
    usage(message, 'graph impact');
  }
  if (isImpact && options.changed.length > MAX_CHANGED_FILES) {
    const message = `Too many changed files: received ${options.changed.length}; maximum is ${MAX_CHANGED_FILES}.`;
    if (options.json) {
      console.log(JSON.stringify({ ok: false, command: 'graph impact', root: options.root, error: { code: 'TOO_MANY_CHANGED', message }, usage: commandUsage('graph impact') }, null, 2));
      process.exit(2);
    }
    if (options.yml) {
      console.log(formatYmlGraphImpactError(options, message, 'TOO_MANY_CHANGED'));
      process.exit(2);
    }
    usage(message, 'graph impact');
  }
  const { status, index, metadata } = readFreshIndex(options.root);
  const rawImpact = isImpact ? buildImpactReport(index, options.changed) : undefined;
  const impact = isImpact && (options.compact || options.yml) ? buildCompactImpactReport(rawImpact) : rawImpact;
  const payload = isImpact
    ? { ok: status.ok, command: 'graph impact', compact: options.compact || undefined, root: options.root, status, metadata, changed: options.changed[0], changedFiles: options.changed, related: impact.related, impact }
    : { ok: status.ok, command: 'graph communities', root: options.root, status, metadata, graph: graphSummary(index), communities: buildCommunities(index) };
  const refreshNote = metadata.cacheRefreshed ? ', refreshed' : '';
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else if (isImpact && options.yml) console.log(formatYmlImpactOutput(payload, impact));
  else if (isImpact && options.compact) console.log(formatCompactImpactOutput(payload, impact));
  else if (isImpact) console.log(`graph impact: ${payload.related.length} related node(s), ${impact.omittedRelated ?? 0} omitted (${status.status}${refreshNote} index)`);
  else console.log(`graph communities: ${payload.communities.communities.length}/${payload.communities.total} shown, ${payload.communities.omitted} omitted (${status.status}${refreshNote} index)`);
}
