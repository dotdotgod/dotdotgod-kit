import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import { isSecretLikePathPattern } from '../memory/config.mjs';

export const MAX_VECTOR_PROFILE_FILE_BYTES = 64 * 1024;
export const MAX_VECTOR_PROFILE_CHARS = 4000;
export const MAX_VECTOR_PROFILE_METADATA_ITEMS = 20;

const TEXT_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.css', '.go', '.h', '.hpp', '.html', '.java', '.js', '.json', '.jsx', '.md', '.mjs', '.py', '.rb', '.rs', '.sh', '.ts', '.tsx', '.txt', '.yaml', '.yml']);
const GENERATED_SEGMENTS = new Set(['.dotdotgod', 'build', 'coverage', 'dist', 'node_modules']);

function insideRoot(root, absolute) {
  const normalizedRoot = resolve(root);
  return absolute === normalizedRoot || absolute.startsWith(`${normalizedRoot}${sep}`);
}

export function normalizeChangedPath(path) {
  const normalized = String(path ?? '').replaceAll('\\', '/').replace(/^\.\/+/, '');
  if (!normalized || normalized === '.') return null;
  return normalized;
}

export function canonicalizeChangedPath(root, path) {
  const normalized = normalizeChangedPath(path);
  if (!normalized) return null;
  const rootAbsolute = resolve(root);
  const absolute = resolve(rootAbsolute, normalized);
  if (!insideRoot(rootAbsolute, absolute)) return normalized;
  try {
    const canonicalRoot = realpathSync(rootAbsolute);
    const canonicalAbsolute = realpathSync(absolute);
    if (!insideRoot(canonicalRoot, canonicalAbsolute)) return normalized;
    const canonical = relative(canonicalRoot, canonicalAbsolute).replaceAll('\\', '/');
    return canonical || normalized;
  } catch {
    return relative(rootAbsolute, absolute).replaceAll('\\', '/') || normalized;
  }
}

function unsafeProfilePath(path) {
  return isSecretLikePathPattern(path) || path.split('/').some((segment) => GENERATED_SEGMENTS.has(segment));
}

function graphMetadata(graph, seedId) {
  const nodeById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const values = [];
  for (const edge of graph.edges ?? []) {
    if (edge.source !== seedId) continue;
    if (!['contains_heading', 'declares_package', 'declares_bin', 'includes_resource', 'depends_on'].includes(edge.relation)) continue;
    const target = nodeById.get(edge.target);
    const value = target?.title ?? target?.name ?? target?.target ?? target?.id;
    if (value) values.push(`${edge.relation}: ${value}`);
    if (values.length === MAX_VECTOR_PROFILE_METADATA_ITEMS) break;
  }
  return values;
}

function safeTextPrefix(root, path) {
  if (unsafeProfilePath(path) || !TEXT_EXTENSIONS.has(extname(path).toLowerCase())) return '';
  try {
    const absolute = resolve(root, path);
    if (!insideRoot(root, absolute)) return '';
    const canonicalAbsolute = realpathSync(absolute);
    if (!insideRoot(realpathSync(root), canonicalAbsolute)) return '';
    const canonicalPath = relative(realpathSync(root), canonicalAbsolute).replaceAll('\\', '/');
    if (canonicalPath !== path || unsafeProfilePath(canonicalPath) || !TEXT_EXTENSIONS.has(extname(canonicalPath).toLowerCase())) return '';
    const stats = lstatSync(canonicalAbsolute);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_VECTOR_PROFILE_FILE_BYTES) return '';
    const buffer = readFileSync(canonicalAbsolute);
    if (buffer.includes(0)) return '';
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return text.slice(0, MAX_VECTOR_PROFILE_CHARS);
  } catch {
    return '';
  }
}

export function buildChangedFileProfile(root, path, graph = { nodes: [], edges: [] }) {
  const normalized = canonicalizeChangedPath(root, path);
  if (!normalized || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || unsafeProfilePath(normalized)) return null;
  const metadata = graphMetadata(graph, `file:${normalized}`);
  const text = safeTextPrefix(root, normalized);
  const sections = [`Path: ${normalized}`];
  if (metadata.length) sections.push(`Graph metadata:\n${metadata.join('\n')}`);
  if (text) sections.push(`Text:\n${text}`);
  return { path: normalized, text: sections.join('\n\n').slice(0, MAX_VECTOR_PROFILE_CHARS), metadataItems: metadata.length, sourceTextIncluded: Boolean(text) };
}
