#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { buildImpactReport, buildMemoryAreas, buildVectorImpactOverlay, readFreshIndex } from '../packages/cli/src/core.mjs';
import { buildPersonalizedPageRank } from '../packages/cli/src/impact/scoring.mjs';
import { DEFAULT_IMPACT_RANKING_POLICY } from '../packages/cli/src/memory/config.mjs';

const LEGACY_QUALITY_BASELINE = { precisionAt5: 0.48, precisionAt10: 0.31, recallMustAt10: 0.5, mrr: 0.59, ndcgAt10: 0.44 };

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
  {
    seeds: ['packages/cli/src/commands/graph.mjs', 'packages/cli/src/impact/report.mjs'],
    must: ['docs/spec/cli/GRAPH_IMPACT.md', 'packages/cli/test/core.test.mjs', 'packages/cli/test/e2e.test.mjs', 'docs/test/IMPACT_RANKING_CONFIG.md'],
    should: ['packages/cli/src/impact/scoring.mjs', 'packages/cli/src/impact/format.mjs', 'docs/arch/IMPACT_RANKING_CONFIG.md', 'docs/test/GRAPH_IMPACT_QUALITY.md', 'packages/cli/README.md'],
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

function seedsFor(gold) {
  return gold.seeds ?? [gold.seed];
}

function seedLabel(gold) {
  return seedsFor(gold).join(' + ');
}

function topWithoutSeed(items, seeds, k) {
  const seedKeys = new Set(seeds.flatMap((seed) => [seed, idForPath(seed)]));
  const seen = new Set();
  const top = [];
  for (const item of items) {
    if ([...itemKeys(item)].some((key) => seedKeys.has(key))) continue;
    const key = canonicalItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    top.push(item);
    if (top.length >= k) break;
  }
  return top;
}

function precisionAt(items, gold, k) {
  const top = topWithoutSeed(items, seedsFor(gold), k);
  if (top.length === 0) return 0;
  return top.filter((item) => relevanceForItem(item, gold) >= 2).length / k;
}

function recallMustAt(items, gold, k) {
  if (gold.must.length === 0) return 1;
  const found = new Set();
  for (const item of topWithoutSeed(items, seedsFor(gold), k)) {
    for (const key of itemKeys(item)) if (gold.must.includes(key)) found.add(key);
    for (const path of gold.must) if (itemKeys(item).has(idForPath(path))) found.add(path);
  }
  return found.size / gold.must.length;
}

function mrr(items, gold) {
  const top = topWithoutSeed(items, seedsFor(gold), items.length);
  const index = top.findIndex((item) => relevanceForItem(item, gold) === 3);
  return index === -1 ? 0 : 1 / (index + 1);
}

function dcg(relevances) {
  return relevances.reduce((sum, rel, index) => sum + ((2 ** rel) - 1) / Math.log2(index + 2), 0);
}

function ndcgAt(items, gold, k) {
  const rels = topWithoutSeed(items, seedsFor(gold), k).map((item) => relevanceForItem(item, gold));
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

function lexicalBaseline(index, seeds) {
  return (index.graph.nodes ?? [])
    .filter((node) => node.type === 'file' && node.path && !seeds.includes(node.path))
    .map((node) => ({ ...node, impactScore: Math.max(...seeds.map((seed) => lexicalScore(seed, node.path))), reasons: ['lexical-path'] }))
    .filter((item) => item.impactScore > 0)
    .sort((a, b) => b.impactScore - a.impactScore || a.path.localeCompare(b.path));
}

function snapshotBaseline(index, seeds) {
  const memoryAreas = buildMemoryAreas(index, { items: 4 });
  const paths = [
    'AGENTS.md', 'README.md', 'docs/README.md', 'docs/spec/README.md', 'docs/test/README.md', 'docs/arch/README.md', 'docs/plan/README.md', 'docs/archive/README.md',
    ...memoryAreas.areas.flatMap((area) => area.files ?? []),
  ];
  return [...new Set(paths)]
    .filter((path) => !seeds.includes(path))
    .map((path, index) => ({ id: idForPath(path), type: 'file', path, impactScore: 100 - index, reasons: ['snapshot-readme'] }));
}

function isSemanticOnly(item) {
  const reasons = item.reasons ?? [];
  return reasons.length > 0 && reasons.every((reason) => /semantic|mentions_/.test(reason));
}

function hasCurated(item) {
  return (item.reasons ?? []).some((reason) => /implemented_by|verified_by|related_doc|design_decision|verification_command|tests|imports|same-directory|shares-import|routes_to/.test(reason));
}

function evaluateItems(items, gold) {
  const top10 = topWithoutSeed(items, seedsFor(gold), 10);
  return {
    precisionAt5: round(precisionAt(items, gold, 5)),
    precisionAt10: round(precisionAt(items, gold, 10)),
    recallMustAt10: round(recallMustAt(items, gold, 10)),
    mrr: round(mrr(items, gold)),
    ndcgAt10: round(ndcgAt(items, gold, 10)),
    curatedTop10: top10.filter(hasCurated).length,
    semanticOnlyTop10: top10.filter(isSemanticOnly).length,
    saturatedConnectionTop10: top10.filter((item) => (item.scoreBreakdown?.connection?.ppr ?? 0) >= 80).length,
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
    `- Average graph P@5: ${summary.averages.graphPrecisionAt5}`,
    `- Average graph P@10: ${summary.averages.graphPrecisionAt10}`,
    `- Average graph must Recall@10: ${summary.averages.graphRecallMustAt10}`,
    `- Average semantic-only top10: ${summary.averages.semanticOnlyTop10}`,
    `- Average saturated connection top10: ${summary.averages.saturatedConnectionTop10}`,
    '',
    '## Baseline Comparison',
    '',
    table(['Metric', 'Graph', 'Legacy floor', 'Lexical/path', 'Snapshot/README'], [
      ['Precision@5', summary.averages.graphPrecisionAt5, summary.legacyBaseline.precisionAt5, 'n/a', 'n/a'],
      ['Precision@10', summary.averages.graphPrecisionAt10, summary.legacyBaseline.precisionAt10, summary.averages.lexicalPrecisionAt10, summary.averages.snapshotPrecisionAt10],
      ['Must Recall@10', summary.averages.graphRecallMustAt10, summary.legacyBaseline.recallMustAt10, summary.averages.lexicalRecallMustAt10, summary.averages.snapshotRecallMustAt10],
      ['nDCG@10', summary.averages.graphNdcgAt10, summary.legacyBaseline.ndcgAt10, 'n/a', 'n/a'],
      ['MRR', summary.averages.graphMrr, summary.legacyBaseline.mrr, 'n/a', 'n/a'],
    ]),
    '',
    '## Per-Seed Results',
    '',
    table(['Seed', 'P@10', 'Recall@10', 'MRR', 'nDCG@10', 'Semantic-only top10', 'Saturated top10', 'Missing must-inspect'], summary.rows.map((row) => [row.seed, row.graph.precisionAt10, row.graph.recallMustAt10, row.graph.mrr, row.graph.ndcgAt10, row.graph.semanticOnlyTop10, row.graph.saturatedConnectionTop10, row.graph.falseNegatives.join('<br>') || 'none'])),
    '',
    '## Calibration',
    '',
    `- Internal reference: ${summary.calibration.reference}`,
    `- Raw fixture PPR: ${JSON.stringify(summary.calibration.rawPpr)}`,
    `- Candidate references: ${JSON.stringify(summary.calibration.candidateReferences)}`,
    `- Fixture connection scores: ${JSON.stringify(summary.calibration.connectionScores)}`,
    '- Selection rationale: `0.4` avoids fixture saturation while preserving visible curated, explicit, deterministic, one-hop, and multi-hop score separation.',
    `- Saturated fixture candidates: ${summary.calibration.saturated}`,
    `- Candidate-independent: ${summary.calibration.candidateIndependent}`,
    `- Multi-seed order invariant: ${summary.calibration.seedOrderInvariant}`,
    '',
    '## Interpretation',
    '',
    summary.verdict,
    '',
  ].join('\n');
}

async function vectorOverlayEvidence() {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-vector-eval-'));
  try {
    mkdirSync(join(root, 'packages/app'), { recursive: true });
    writeFileSync(join(root, 'packages/app/search.mjs'), '// 한국어 검색 변경 내용\nexport const search = true;\n');
    const semantic = { ...DEFAULT_IMPACT_RANKING_POLICY.semantic, enabled: true, threshold: 0, topKPerFile: 1 };
    const index = {
      memoryConfig: { source: 'evaluation', impactRanking: { ...DEFAULT_IMPACT_RANKING_POLICY, semantic } },
      graph: {
        nodes: [
          { id: 'file:packages/app/search.mjs', type: 'file', path: 'packages/app/search.mjs' },
          { id: 'file:docs/spec/SEARCH.md', type: 'file', path: 'docs/spec/SEARCH.md' },
          { id: 'file:docs/spec/SECOND.md', type: 'file', path: 'docs/spec/SECOND.md' },
        ],
        edges: [],
      },
    };
    const unit = Float32Array.from([1, ...Array(383).fill(0)]);
    const vectorIndex = {
      chunks: [
        { id: 'search-chunk', path: 'docs/spec/SEARCH.md', heading: 'Search' },
        { id: 'second-chunk', path: 'docs/spec/SECOND.md', heading: 'Second' },
      ],
      vectors: Float32Array.from([...unit, ...unit]),
      manifest: { embedded: 0, reused: 2 },
    };
    const options = { buildIndex: async () => vectorIndex, embed: async () => [Array.from(unit)] };
    const first = await buildVectorImpactOverlay(root, index, ['./packages/app/search.mjs'], options);
    const second = await buildVectorImpactOverlay(root, index, ['packages/app/search.mjs'], options);
    const report = buildImpactReport(index, './packages/app/search.mjs', { overlay: first });
    const candidate = report.related.find((item) => item.id === 'file:docs/spec/SEARCH.md');
    const deterministicTopK = first.edges.length === 1 && JSON.stringify(first.edges) === JSON.stringify(second.edges) && first.edges[0]?.target === 'file:docs/spec/SEARCH.md';
    const changedSourcePersisted = existsSync(join(root, '.dotdotgod'));
    return { candidateFound: Boolean(candidate), reason: candidate?.reasons?.includes('vector_similarity') === true, cosine: candidate?.vectorEvidence?.score, connection: candidate?.scoreBreakdown?.connection?.ppr, deterministicTopK, changedSourcePersisted };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function calibrationEvidence() {
  const graph = {
    nodes: ['seed-a', 'seed-b', 'curated', 'explicit', 'deterministic', 'one-hop', 'multi-hop', 'unrelated'].map((id) => ({ id })),
    edges: [
      { source: 'seed-a', target: 'curated', relation: 'implemented_by' },
      { source: 'seed-a', target: 'explicit', relation: 'links_to' },
      { source: 'seed-a', target: 'deterministic', relation: 'mentions_package' },
      { source: 'curated', target: 'one-hop', relation: 'links_to' },
      { source: 'one-hop', target: 'multi-hop', relation: 'links_to' },
      { source: 'seed-b', target: 'curated', relation: 'verified_by' },
    ],
  };
  const policy = {
    ...DEFAULT_IMPACT_RANKING_POLICY,
    relationWeights: { ...DEFAULT_IMPACT_RANKING_POLICY.relationWeights, implemented_by: 4, verified_by: 4, related_doc: 3, design_decision: 3 },
  };
  const single = buildPersonalizedPageRank(graph, ['seed-a'], policy);
  const multi = buildPersonalizedPageRank(graph, ['seed-a', 'seed-b'], policy);
  const extended = buildPersonalizedPageRank({ nodes: [...graph.nodes, { id: 'disconnected' }], edges: graph.edges }, ['seed-a'], policy);
  const fixtureIds = ['curated', 'explicit', 'deterministic', 'one-hop', 'multi-hop', 'unrelated'];
  const classes = Object.fromEntries(fixtureIds.map((id) => [id, round(single.get(id) ?? 0)]));
  const multiSeed = Object.fromEntries(fixtureIds.map((id) => [id, round(multi.get(id) ?? 0)]));
  const candidateIndependent = [...single].every(([id, value]) => Math.abs(value - (extended.get(id) ?? 0)) < 1e-12);
  const seedOrderInvariant = [...multi].every(([id, value]) => Math.abs(value - (buildPersonalizedPageRank(graph, ['seed-b', 'seed-a'], policy).get(id) ?? 0)) < 1e-12);
  const reference = policy.ppr.reference;
  const scoreForReference = (candidateReference) => Object.fromEntries(Object.entries(classes).map(([id, probability]) => [id, round(Math.min(80, (probability / candidateReference) * 80))]));
  const candidateReferences = [0.2, 0.3, 0.4, 0.5].map((candidateReference) => {
    const scores = scoreForReference(candidateReference);
    return { reference: candidateReference, saturated: Object.values(scores).filter((score) => score >= 80).length, scores };
  });
  const connectionScores = scoreForReference(reference);
  return { reference, rawPpr: { singleSeed: classes, multiSeed }, candidateReferences, connectionScores, saturated: Object.values(connectionScores).filter((score) => score >= 80).length, candidateIndependent, seedOrderInvariant };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { status, index, metadata } = readFreshIndex(options.root);
  const rows = SEEDS.map((gold) => {
    const seeds = seedsFor(gold);
    const report = buildImpactReport(index, seeds);
    const graph = evaluateItems(report.related, gold);
    const lexical = evaluateItems(lexicalBaseline(index, seeds), gold);
    const snapshot = evaluateItems(snapshotBaseline(index, seeds), gold);
    return {
      seed: seedLabel(gold),
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
      graphPrecisionAt5: average(rows, (row) => row.graph.precisionAt5),
      graphPrecisionAt10: average(rows, (row) => row.graph.precisionAt10),
      lexicalPrecisionAt10: average(rows, (row) => row.lexical.precisionAt10),
      snapshotPrecisionAt10: average(rows, (row) => row.snapshot.precisionAt10),
      graphRecallMustAt10: average(rows, (row) => row.graph.recallMustAt10),
      lexicalRecallMustAt10: average(rows, (row) => row.lexical.recallMustAt10),
      snapshotRecallMustAt10: average(rows, (row) => row.snapshot.recallMustAt10),
      graphNdcgAt10: average(rows, (row) => row.graph.ndcgAt10),
      graphMrr: average(rows, (row) => row.graph.mrr),
      semanticOnlyTop10: average(rows, (row) => row.graph.semanticOnlyTop10),
      saturatedConnectionTop10: average(rows, (row) => row.graph.saturatedConnectionTop10),
    },
    calibration: calibrationEvidence(),
    vectorOverlay: await vectorOverlayEvidence(),
    legacyBaseline: LEGACY_QUALITY_BASELINE,
  };
  summary.legacyComparison = {
    precisionAt5: summary.averages.graphPrecisionAt5 - LEGACY_QUALITY_BASELINE.precisionAt5,
    precisionAt10: summary.averages.graphPrecisionAt10 - LEGACY_QUALITY_BASELINE.precisionAt10,
    recallMustAt10: summary.averages.graphRecallMustAt10 - LEGACY_QUALITY_BASELINE.recallMustAt10,
    mrr: summary.averages.graphMrr - LEGACY_QUALITY_BASELINE.mrr,
    ndcgAt10: summary.averages.graphNdcgAt10 - LEGACY_QUALITY_BASELINE.ndcgAt10,
  };
  summary.ok = summary.calibration.candidateIndependent && summary.calibration.seedOrderInvariant && summary.vectorOverlay.candidateFound && summary.vectorOverlay.reason && summary.vectorOverlay.deterministicTopK && !summary.vectorOverlay.changedSourcePersisted;
  summary.verdict = summary.ok
    ? 'Graph impact records the intentional PPR-only migration and passes fixed-reference stability invariants.'
    : 'Graph impact fails a fixed-reference stability invariant; inspect the calibration evidence.';

  const output = options.json ? `${JSON.stringify(summary, null, 2)}\n` : markdownReport(summary);
  if (options.output) {
    mkdirSync(dirname(resolve(options.output)), { recursive: true });
    writeFileSync(resolve(options.output), output);
  } else process.stdout.write(output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
