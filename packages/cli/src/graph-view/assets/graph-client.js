async function fetchGraph(fetcher = fetch) {
  let response;
  try { response = await fetcher('/api/graph', { cache: 'no-store' }); }
  catch { throw new Error('NETWORK: graph server is unavailable'); }
  let graph;
  try { graph = await response.json(); }
  catch { throw new Error(`HTTP ${response.status}: invalid graph response; check the server URL and version`); }
  if (!response.ok) {
    const details = typeof graph.error?.message === 'string' ? graph.error.message.slice(0, 800) : 'graph request failed';
    throw new Error(`HTTP ${response.status}: ${details}`);
  }
  if (graph.version !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.types)) {
    throw new Error('INVALID_GRAPH: incompatible graph data; reload the page and server');
  }
  const paths = new Set(graph.nodes.map(node => node.id));
  if (graph.edges.some(edge => !paths.has(edge.source) || !paths.has(edge.target))) {
    throw new Error('INVALID_GRAPH: connection endpoint is missing');
  }
  return graph;
}
if (typeof module !== 'undefined') module.exports = { fetchGraph };
