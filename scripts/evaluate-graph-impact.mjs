#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildImpactReport, buildMemoryAreas, readFreshIndex } from '../packages/cli/src/core.mjs';

const SEEDS = [
  {
    seed: 'packages/cli/src/core.mjs',
    must: ['packages/cli/test/core.test.mjs', 'packages/cli/test/e2e.test.mjs', 'docs/spec/CLI_INTERFACE.md', 'docs/spec/IMPACT_RANKING_CONFIG.md', 'docs/spec/MEMORY_AREA_CONFIG.md', 'docs/spec/TRACEABILITY_CONFIG.md'],
    should: ['docs/test/CLI_INTERFACE.md', 'docs/test/IMPACT_RANKING_CONFIG.md', 'docs/arch/IMPACT_RANKING_CONFIG.md', 'docs/arch/VALIDATION_ARCHITECTURE.md', 'packages/cli/README.md'],
  },
  {
    seed: 'packages/cli/test/e2e.test.mjs',
    must: ['packages/cli/src/core.mjs', 'docs/spec/CLI_INTERFACE.md'],
    should: ['docs/test/CLI_INTERFACE.md', 'docs/spec/TRACEABILITY_CONFIG.md', 'docs/spec/IMPACT_RANKING_CONFIG.md', 'docs/test/IMPACT_RANKING_CONFIG.md', 'docs/spec/MEMORY_AREA_CONFIG.md', 'docs/test/MEMORY_AREA_CONFIG.md', 'docs/spec/LOAD_PROJECT.md', 'docs/spec/WORKSPACE_VERIFICATION.md', 'packages/cli/README.md'],
  },
  {
    seed: 'packages/pi/extensions/plan-mode/utils.ts',
    must: ['packages/pi/test/plan-mode-utils.test.ts', 'packages/pi/extensions/plan-mode/index.ts', 'docs/spec/PLAN_MODE.md', 'docs/spec/PLAN_MODE_TOOL_SETTINGS.md'],
    should: ['docs/arch/EXTENSION_ARCHITECTURE.md', 'docs/test/MANUAL_SMOKE.md'],
  },
  {
    seed: 'packages/pi/extensions/load-project/utils.ts',
    must: ['packages/pi/test/load-project-utils.test.ts', 'packages/pi/extensions/load-project/index.ts', 'docs/spec/LOAD_PROJECT.md'],
    should: ['docs/arch/EXTENSION_ARCHITECTURE.md', 'docs/test/CONTEXT_MEASUREMENT.md', 'packages/shared/workflows/load.md'],
  },
  {
    seed: 'docs/spec/IMPACT_RANKING_CONFIG.md',
    must: ['packages/cli/src/core.mjs', 'packages/cli/test/core.test.mjs', 'packages/cli/test/e2e.test.mjs', 'docs/test/IMPACT_RANKING_CONFIG.md', 'docs/arch/IMPACT_RANKING_CONFIG.md'],
    should: ['docs/spec/MEMORY_AREA_CONFIG.md', 'docs/spec/TRACEABILITY_CONFIG.md', 'docs/arch/VALIDATION_ARCHITECTURE.md'],
  },
  {
    seed: 'docs/spec/MEMORY_AREA_CONFIG.md',
    must: ['packages/cli/src/core.mjs', 'packages/cli/test/core.test.mjs', 'packages/cli/test/e2e.test.mjs', 'docs/test/MEMORY_AREA_CONFIG.md', 'docs/arch/MEMORY_AREA_CONFIG.md'],
    should: ['docs/spec/TRACEABILITY_CONFIG.md', 'docs/spec/IMPACT_RANKING_CONFIG.md', 'docs/arch/VALIDATION_ARCHITECTURE.md'],
  },
  {
    seed: 'docs/test/CONTEXT_MEASUREMENT.md',
    must: ['scripts/measure-context.mjs', 'docs/plan/context-metrics-follow-up/README.md'],
    should: ['docs/archive/report/context-metrics/README.md', 'docs/spec/LOAD_PROJECT.md', 'packages/pi/extensions/load-project/utils.ts', 'docs/test/README.md'],
  }, 
  {
    seed: 'package.json',
    must: ['docs/spec/WORKSPACE_VERIFICATION.md', 'docs/test/README.md', 'docs/arch/CODE_CONVENTIONS.md', 'scripts/check-package-verify-contract.mjs', '.husky/pre-push'],
    should: ['packages/cli/package.json', 'packages/pi/package.json', 'README.md'],
  },
  {
    seed: 'packages/shared/workflows/load.md',
    must: ['docs/spec/LOAD_PROJECT.md', 'docs/spec/CROSS_AGENT_SUPPORT.md', 'docs/arch/CROSS_AGENT_ARCHITECTURE.md'],
    should: ['packages/claude-code/commands/dd/load.md', 'packages/claude-code/skills/project-load/SKILL.md', 'packages/codex/skills/project-load/SKILL.md', 'scripts/generate-adapters.mjs', 'packages/shared/workflows/init.md', 'packages/shared/workflows/plan.md'],
  },
];

function parseArgs(argv) {
  const options = { root: '.', json: false, markdown: false, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--markdown') options.markdown = true;
    else if (arg === '--output') {
      options.output = argv[i + 1];
      i += 1;
    } else if (!arg.startsWith('-')) options.root = arg;
  }
  options.root = resolve(options.root);
  return options;
}

function idForPath(path) {
  return `file:${path}`;
}

function itemKeys(item) {
  const path = item.path ?? item.id?.replace(/^file:/, '').replace(/^test:/, '');
  return new Set([item.id, path, path ? idForPath(path) : undefined].filter(Boolean));
}

function relevanceForItem(item, gold) {
  const keys = itemKeys(item);
  if (gold.must.some((path) => keys.has(path) || keys.has(idForPath(path)))) return 3;
  if (gold.should.some((path) => keys.has(path) || keys.has(idForPath(path)))) return 2;
  return 0;
}

function canonicalItemKey(item) {
  return item.path ?? item.id?.replace(/^file:/, '').replace(/^test:/, '') ?? item.id;
}

function topWithoutSeed(items, seed, k) {
  const seen = new Set();
  const top = [];
  for (const item of items) {
    if (itemKeys(item).has(seed) || itemKeys(item).has(idForPath(seed))) continue;
    const key = canonicalItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    top.push(item);
    if (top.length >= k) break;
  }
  return top;
}

function precisionAt(items, gold, k) {
  const top = topWithoutSeed(items, gold.seed, k);
  if (top.length === 0) return 0;
  return top.filter((item) => relevanceForItem(item, gold) >= 2).length / k;
}

function recallMustAt(items, gold, k) {
  if (gold.must.length === 0) return 1;
  const found = new Set();
  for (const item of topWithoutSeed(items, gold.seed, k)) {
    for (const key of itemKeys(item)) if (gold.must.includes(key)) found.add(key);
    for (const path of gold.must) if (itemKeys(item).has(idForPath(path))) found.add(path);
  }
  return found.size / gold.must.length;
}

function mrr(items, gold) {
  const top = topWithoutSeed(items, gold.seed, items.length);
  const index = top.findIndex((item) => relevanceForItem(item, gold) === 3);
  return index === -1 ? 0 : 1 / (index + 1);
}

function dcg(relevances) {
  return relevances.reduce((sum, rel, index) => sum + ((2 ** rel) - 1) / Math.log2(index + 2), 0);
}

function ndcgAt(items, gold, k) {
  const rels = topWithoutSeed(items, gold.seed, k).map((item) => relevanceForItem(item, gold));
  const ideal = [...Array(Math.min(k, gold.must.length + gold.should.length))]
    .map((_, index) => index < gold.must.length ? 3 : 2);
  const idealScore = dcg(ideal);
  return idealScore === 0 ? 0 : dcg(rels) / idealScore;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function tokens(value = '') {
  return new Set(String(value).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !['docs', 'test', 'tests', 'readme', 'index', 'package'].includes(token)));
}

function lexicalScore(seed, path) {
  const seedTokens = tokens(seed);
  const pathTokens = tokens(path);
  const overlap = [...seedTokens].filter((token) => pathTokens.has(token)).length;
  const seedDir = seed.split('/').slice(0, -1).join('/');
  const pathDir = path.split('/').slice(0, -1).join('/');
  const sameDir = seedDir && seedDir === pathDir ? 5 : 0;
  const samePackage = seed.split('/').slice(0, 2).join('/') === path.split('/').slice(0, 2).join('/') ? 2 : 0;
  return overlap * 3 + sameDir + samePackage;
}

function lexicalBaseline(index, seed) {
  return (index.graph.nodes ?? [])
    .filter((node) => node.type === 'file' && node.path && node.path !== seed)
    .map((node) => ({ ...node, impactScore: lexicalScore(seed, node.path), reasons: ['lexical-path'] }))
    .filter((item) => item.impactScore > 0)
    .sort((a, b) => b.impactScore - a.impactScore || a.path.localeCompare(b.path));
}

function snapshotBaseline(index, seed) {
  const memoryAreas = buildMemoryAreas(index, { items: 4 });
  const paths = [
    'AGENTS.md', 'README.md', 'docs/README.md', 'docs/spec/README.md', 'docs/test/README.md', 'docs/arch/README.md', 'docs/plan/README.md', 'docs/archive/README.md',
    ...memoryAreas.areas.flatMap((area) => area.files ?? []),
  ];
  return [...new Set(paths)]
    .filter((path) => path !== seed)
    .map((path, index) => ({ id: idForPath(path), type: 'file', path, impactScore: 100 - index, reasons: ['snapshot-readme'] }));
}

function isSemanticOnly(item) {
  const reasons = item.reasons ?? [];
  return reasons.length > 0 && reasons.every((reason) => /semantic|mentions_/.test(reason));
}

function hasCurated(item) {
  return (item.reasons ?? []).some((reason) => /implemented_by|verified_by|related_doc|verification_command|tests|imports|same-directory|shares-import|routes_to/.test(reason));
}

function evaluateItems(items, gold) {
  const top10 = topWithoutSeed(items, gold.seed, 10);
  return {
    precisionAt5: round(precisionAt(items, gold, 5)),
    precisionAt10: round(precisionAt(items, gold, 10)),
    recallMustAt10: round(recallMustAt(items, gold, 10)),
    mrr: round(mrr(items, gold)),
    ndcgAt10: round(ndcgAt(items, gold, 10)),
    curatedTop10: top10.filter(hasCurated).length,
    semanticOnlyTop10: top10.filter(isSemanticOnly).length,
    falseNegatives: gold.must.filter((path) => !top10.some((item) => itemKeys(item).has(path) || itemKeys(item).has(idForPath(path)))),
  };
}

function average(rows, getter) {
  if (rows.length === 0) return 0;
  return round(rows.reduce((sum, row) => sum + getter(row), 0) / rows.length);
}

function table(headers, rows) {
  return `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}`;
}

function markdownReport(summary) {
  return [
    '# Graph Impact Quality Follow-Up Measurement',
    '',
    '## Summary',
    '',
    `- Measured at: ${summary.measuredAt}`,
    `- Seeds: ${summary.seedCount}`,
    `- Graph: ${summary.graph.nodes} nodes / ${summary.graph.edges} edges`,
    `- Average graph P@10: ${summary.averages.graphPrecisionAt10}`,
    `- Average graph must Recall@10: ${summary.averages.graphRecallMustAt10}`,
    `- Average semantic-only top10: ${summary.averages.semanticOnlyTop10}`,
    '',
    '## Baseline Comparison',
    '',
    table(['Metric', 'Graph', 'Lexical/path', 'Snapshot/README'], [
      ['Precision@10', summary.averages.graphPrecisionAt10, summary.averages.lexicalPrecisionAt10, summary.averages.snapshotPrecisionAt10],
      ['Must Recall@10', summary.averages.graphRecallMustAt10, summary.averages.lexicalRecallMustAt10, summary.averages.snapshotRecallMustAt10],
      ['nDCG@10', summary.averages.graphNdcgAt10, 'n/a', 'n/a'],
      ['MRR', summary.averages.graphMrr, 'n/a', 'n/a'],
    ]),
    '',
    '## Per-Seed Results',
    '',
    table(['Seed', 'P@10', 'Recall@10', 'MRR', 'nDCG@10', 'Semantic-only top10', 'Missing must-inspect'], summary.rows.map((row) => [row.seed, row.graph.precisionAt10, row.graph.recallMustAt10, row.graph.mrr, row.graph.ndcgAt10, row.graph.semanticOnlyTop10, row.graph.falseNegatives.join('<br>') || 'none'])),
    '',
    '## Interpretation',
    '',
    summary.verdict,
    '',
  ].join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { status, index, metadata } = readFreshIndex(options.root);
  const rows = SEEDS.map((gold) => {
    const report = buildImpactReport(index, gold.seed);
    const graph = evaluateItems(report.related, gold);
    const lexical = evaluateItems(lexicalBaseline(index, gold.seed), gold);
    const snapshot = evaluateItems(snapshotBaseline(index, gold.seed), gold);
    return {
      seed: gold.seed,
      relatedCount: report.related.length,
      omittedRelated: report.omittedRelated,
      graph,
      lexical,
      snapshot,
    };
  });
  const summary = {
    ok: true,
    measuredAt: new Date().toISOString(),
    root: options.root,
    cache: status,
    metadata,
    graph: status.graph,
    seedCount: rows.length,
    rows,
    averages: {
      graphPrecisionAt10: average(rows, (row) => row.graph.precisionAt10),
      lexicalPrecisionAt10: average(rows, (row) => row.lexical.precisionAt10),
      snapshotPrecisionAt10: average(rows, (row) => row.snapshot.precisionAt10),
      graphRecallMustAt10: average(rows, (row) => row.graph.recallMustAt10),
      lexicalRecallMustAt10: average(rows, (row) => row.lexical.recallMustAt10),
      snapshotRecallMustAt10: average(rows, (row) => row.snapshot.recallMustAt10),
      graphNdcgAt10: average(rows, (row) => row.graph.ndcgAt10),
      graphMrr: average(rows, (row) => row.graph.mrr),
      semanticOnlyTop10: average(rows, (row) => row.graph.semanticOnlyTop10),
    },
  };
  summary.verdict = summary.averages.graphPrecisionAt10 >= 0.6 && summary.averages.graphRecallMustAt10 >= 0.8
    ? 'Graph impact passes the broad quality threshold for this seed set.'
    : 'Graph impact remains useful but below the broad quality threshold; inspect missing must-inspect items before relying on it as a default.';

  const output = options.json ? `${JSON.stringify(summary, null, 2)}\n` : markdownReport(summary);
  if (options.output) {
    mkdirSync(dirname(resolve(options.output)), { recursive: true });
    writeFileSync(resolve(options.output), output);
  } else process.stdout.write(output);
}

main();
