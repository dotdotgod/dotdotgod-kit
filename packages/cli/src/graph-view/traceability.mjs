import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { readMemoryConfig, memoryConfigSummary, resolveMemoryArea } from '../memory/config.mjs';
import { readFreshIndex } from '../index/cache.mjs';

export async function exportTraceability(root) {
  const config = readMemoryConfig(root);
  if (config.errors?.length) throw new Error(JSON.stringify(config.errors));
  const { index } = readFreshIndex(root);
  const nodes = new Map(index.graph.nodes.map(n => [n.id, n]));
  const colors = ['#b9a3ff', '#70c9a2', '#72b9e6', '#d6b879', '#e393a9', '#78c9cd'];
  const types = config.traceability.keys.map((k, i) => ({ ...k, color: colors[i % colors.length] }));
  const typesByRelation = new Map(types.map(t => [t.relation, t]));
  const edges = [];
  for (const edge of index.graph.edges) {
    const type = typesByRelation.get(edge.relation);
    const source = nodes.get(edge.source)?.path;
    const target = nodes.get(edge.target)?.path;
    if (!type || !source || !target || source === target) continue;
    if ([source, target].some(p => resolveMemoryArea(p, config)?.scope === 'local')) continue;
    if (!(await Promise.all([source, target].map(async p => {
      const absolute = resolve(root, p);
      if (!absolute.startsWith(resolve(root) + '/')) return false;
      try { return (await stat(absolute)).isFile(); } catch { return false; }
    }))).every(Boolean)) continue;
    edges.push({ source, target, relation: type.relation, weight: type.weight, color: type.color });
  }
  return { version: 1, projectRoot: resolve(root), config: memoryConfigSummary(config), types,
    edges: [...new Map(edges.map(e => [`${e.source}\0${e.target}\0${e.relation}`, e])).values()] };
}
