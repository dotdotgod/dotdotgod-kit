// Shared by the standalone browser and the Obsidian adapter.
function selectTraceability(graph, { documentsOnly = false, disabledRelations = [] } = {}) {
  const disabled = new Set(disabledRelations);
  const active = graph.edges.filter(e => !disabled.has(e.relation) && (!documentsOnly || [e.source, e.target].every(p => /\.md$/i.test(p))));
  const pairs = new Map();
  for (const edge of [...active].sort((a, b) => b.weight - a.weight || a.relation.localeCompare(b.relation))) {
    const key = `${edge.source}\0${edge.target}`;
    if (!pairs.has(key)) pairs.set(key, edge);
  }
  return { edges: [...pairs.values()], paths: [...new Set(active.flatMap(e => [e.source, e.target]))] };
}
if (typeof module !== 'undefined') module.exports = { selectTraceability };
else globalThis.selectTraceability = selectTraceability;
