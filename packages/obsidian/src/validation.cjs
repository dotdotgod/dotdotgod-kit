function relativePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') &&
    !value.includes(':') && !/[\x00-\x1f]/.test(value) && !value.startsWith('/') &&
    value.split('/').every(part => part && part !== '.' && part !== '..');
}
function graphPath(value) {
  if (!relativePath(value) || !value.endsWith('.json')) throw new Error('Graph path must be a vault-relative JSON path.');
  return value;
}
function validateGraph(graph) {
  if (!graph || graph.version !== 1 || !Array.isArray(graph.edges) || !Array.isArray(graph.types) ||
      !relativePath(graph.config?.documentation?.root) || graph.edges.length > 100000) throw new Error('Invalid traceability graph.');
  const types = new Map();
  for (const type of graph.types) {
    if (!type || typeof type.relation !== 'string' || !type.relation || types.has(type.relation) ||
        typeof type.label !== 'string' || !/^#[0-9a-f]{6}$/i.test(type.color) ||
        !Number.isFinite(type.weight) || type.weight < 0) throw new Error('Invalid relation type.');
    types.set(type.relation, type);
  }
  for (const edge of graph.edges) {
    if (!edge || !relativePath(edge.source) || !relativePath(edge.target) || !types.has(edge.relation)) throw new Error('Invalid relation endpoint.');
    const type = types.get(edge.relation);
    if (edge.weight !== type.weight || edge.color !== type.color) throw new Error('Relation does not match configured type.');
  }
  return graph;
}
function normalizeOptions(value) {
  const options = value && typeof value === 'object' ? value : {};
  let path = '.dotdotgod/traceability.json';
  try { path = graphPath(options.graphPath); } catch { /* Use the first-run path. */ }
  return { graphPath: path,
    disabledRelations: Array.isArray(options.disabledRelations) ? options.disabledRelations.filter(v => typeof v === 'string') : [],
    documentsOnly: typeof options.documentsOnly === 'boolean' ? options.documentsOnly : options.showFiles === false,
    showLegend: typeof options.showLegend === 'boolean' ? options.showLegend : true,
    weightedLines: typeof options.weightedLines === 'boolean' ? options.weightedLines : true };
}
module.exports = { graphPath, validateGraph, normalizeOptions };
