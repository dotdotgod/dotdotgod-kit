import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { rel } from '../common/paths.mjs';
import { extractLinks } from '../docs/markdown.mjs';
import { defaultMemoryConfig } from '../memory/config.mjs';
import { addEdge, addNode } from './store.mjs';
import { addMemoryAreaMembership, addPackageResource, addTraceabilityGraph, fileNodeMetadata, headingId, isReadmeIndexPath } from './metadata.mjs';

function extractMarkdownGraph(root, file, graph, config = defaultMemoryConfig()) {
  const path = rel(root, file);
  const content = readFileSync(file, 'utf8');
  const fileId = `file:${path}`;
  const headingRe = /^(#{1,6})\s+(.+)$/gm;
  let match;
  while ((match = headingRe.exec(content)) !== null) {
    const title = match[2].trim();
    const id = headingId(path, title);
    addNode(graph, id, 'heading', { path, title, depth: match[1].length });
    addEdge(graph, fileId, id, 'contains_heading', { confidence: 'EXTRACTED' });
  }
  for (const { href, line } of extractLinks(content)) {
    const pathPart = href.split('#')[0];
    if (!pathPart) continue;
    const targetPath = rel(root, resolve(dirname(file), pathPart));
    const targetId = `file:${targetPath}`;
    addNode(graph, targetId, 'file', fileNodeMetadata(targetPath, null, config));
    addEdge(graph, fileId, targetId, 'links_to', { line, confidence: 'EXTRACTED' });
    if (isReadmeIndexPath(path)) addEdge(graph, fileId, targetId, 'routes_to', { line, confidence: 'CURATED_INDEX', sourceRole: 'readme-index' });
  }
  addTraceabilityGraph(root, fileId, content, graph, config);
}

function extractPackageGraph(root, file, graph) {
  const path = rel(root, file);
  const fileId = `file:${path}`;
  let pkg;
  try { pkg = JSON.parse(readFileSync(file, 'utf8')); } catch { return; }
  if (pkg.name) {
    const pkgId = `package:${pkg.name}`;
    addNode(graph, pkgId, 'package', { name: pkg.name, path });
    addEdge(graph, fileId, pkgId, 'declares_package', { confidence: 'EXTRACTED' });
  }
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    const id = `script:${path}#${name}`;
    addNode(graph, id, 'script', { name, command, path });
    addEdge(graph, fileId, id, 'declares_script', { confidence: 'EXTRACTED' });
  }
  for (const [name, target] of Object.entries(typeof pkg.bin === 'string' ? { [pkg.name ?? 'bin']: pkg.bin } : pkg.bin ?? {})) {
    const id = `bin:${name}`;
    addNode(graph, id, 'binary', { name, target, path });
    addEdge(graph, fileId, id, 'declares_bin', { confidence: 'EXTRACTED' });
    addPackageResource(graph, fileId, path, name, target, 'bin');
  }
  for (const [index, target] of (Array.isArray(pkg.files) ? pkg.files : []).entries()) addPackageResource(graph, fileId, path, `files:${index}`, target, 'files');
  for (const [kind, value] of Object.entries(pkg.pi ?? {})) {
    for (const [index, target] of (Array.isArray(value) ? value : [value]).entries()) addPackageResource(graph, fileId, path, `pi:${kind}:${index}`, target, `pi:${kind}`);
  }
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      const id = `dependency:${name}`;
      addNode(graph, id, 'dependency', { name });
      addEdge(graph, fileId, id, 'depends_on', { section, confidence: 'EXTRACTED' });
    }
  }
}

export function buildGraph(root, files, config = defaultMemoryConfig()) {
  const graph = { nodes: [], edges: [] };
  for (const file of files) {
    const path = rel(root, file);
    const fileId = `file:${path}`;
    addNode(graph, fileId, 'file', fileNodeMetadata(path, file, config));
    addMemoryAreaMembership(graph, fileId, path, config);
    if (path.endsWith('.md')) extractMarkdownGraph(root, file, graph, config);
    else if (basename(file) === 'package.json') extractPackageGraph(root, file, graph);
  }
  return graph;
}
