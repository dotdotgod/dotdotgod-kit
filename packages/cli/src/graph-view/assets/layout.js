function layoutKey(nodes, edges) {
  return JSON.stringify([
    nodes.map(node => node.id).sort(),
    edges.map(edge => [typeof edge.source === 'string' ? edge.source : edge.source.id,
      typeof edge.target === 'string' ? edge.target : edge.target.id]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ]);
}

function createGraphLayout(d3, nodes, edges) {
  return d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(node => node.id).distance(110))
    .force('charge', d3.forceManyBody().strength(-180).distanceMax(450))
    .force('center', d3.forceCenter())
    .force('x', d3.forceX(0).strength(.04))
    .force('y', d3.forceY(0).strength(.04))
    .force('collision', d3.forceCollide(18));
}

function graphFit(nodes, viewport) {
  const points = nodes.filter(node => Number.isFinite(node.x) && Number.isFinite(node.y));
  if (!points.length) return { scale: 1, pan: [0, 0] };
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const node of points) {
    left = Math.min(left, node.x); right = Math.max(right, node.x);
    top = Math.min(top, node.y); bottom = Math.max(bottom, node.y);
  }
  const scale = Math.min(1, Math.max(1, viewport.width - 64) / Math.max(1, right - left + 32),
    Math.max(1, viewport.height - 64) / Math.max(1, bottom - top + 32));
  return { scale, pan: [-(left + right) / 2 * scale, -(top + bottom) / 2 * scale] };
}

function keepGraphInView(nodes, viewport, scale, pan) {
  if (!nodes.length) return pan;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const node of nodes) {
    left = Math.min(left, node.x); right = Math.max(right, node.x);
    top = Math.min(top, node.y); bottom = Math.max(bottom, node.y);
  }
  const constrain = (min, max, size, offset) => {
    const low = -size / 2 + 16 - min * scale;
    const high = size / 2 - 16 - max * scale;
    return low <= high ? Math.max(low, Math.min(high, offset)) : offset;
  };
  return [constrain(left, right, viewport.width, pan[0]), constrain(top, bottom, viewport.height, pan[1])];
}

if (typeof module !== 'undefined') module.exports = { layoutKey, createGraphLayout, graphFit, keepGraphInView };
