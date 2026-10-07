import { dirname, posix } from 'node:path';
import { addEdge, addNode } from '../graph/store.mjs';

function importTarget(file, specifier, paths) {
  if (!specifier.startsWith('.')) return null;
  const base = posix.normalize(posix.join(dirname(file).replaceAll('\\', '/'), specifier));
  if (base.startsWith('../')) return null;
  const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'].map((extension) => `${stem}${extension}`), ...['.ts', '.js', '.py'].map((extension) => `${base}/index${extension}`)];
  return candidates.find((path) => paths.has(path)) ?? null;
}
export function addOutlineGraph(graph, index) {
  const paths = new Set(index.files.map((file) => file.path));
  for (const file of index.files) {
    const source = `file:${file.path}`;
    for (const symbol of file.symbols) {
      addNode(graph, symbol.id, 'symbol', { ...symbol, sourceHash: file.hash });
      addEdge(graph, symbol.ownerId ?? source, symbol.id, symbol.ownerId ? 'contains_symbol' : 'declares_symbol', { confidence: 'PARSED', path: file.path });
    }
    for (const item of file.imports) {
      const resolved = importTarget(file.path, item.specifier, paths);
      const target = resolved ? `file:${resolved}` : `import:${file.path}#${item.specifier}`;
      if (!resolved) addNode(graph, target, 'unresolved_import', { path: file.path, specifier: item.specifier });
      addEdge(graph, source, target, 'imports', { ...item, resolved: Boolean(resolved), confidence: resolved ? 'RESOLVED_RELATIVE_FILE' : 'SYNTAX_ONLY', path: file.path });
    }
  }
  return graph;
}
