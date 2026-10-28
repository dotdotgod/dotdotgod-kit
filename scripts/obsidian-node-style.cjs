const palette = ['#b9a3ff', '#70c9a2', '#72b9e6', '#d6b879', '#e393a9', '#78c9cd', '#a6c67a', '#e5a475'];
function describeNode(path, root = 'docs') {
  root = root.replace(/^\.\//, '').replace(/\/$/, '');
  if (!path.startsWith(`${root}/`)) return { label: path, group: null, color: null };
  const parts = path.slice(root.length + 1).split('/');
  const group = parts.length === 1 ? root : parts.shift();
  let hash = 0;
  for (const char of group) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const known = { docs: '#b9a3ff', spec: '#72b9e6', arch: '#d6b879', test: '#70c9a2', concept: '#e393a9', report: '#78c9cd' };
  return { label: parts.join('/'), group, color: known[group] ?? palette[hash % palette.length] };
}
module.exports = { describeNode };
