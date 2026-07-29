import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const VECTOR_SCHEMA_VERSION = 1;
export const VECTOR_MODEL = 'Xenova/multilingual-e5-small';
export const VECTOR_DIMENSIONS = 384;

export function vectorCachePaths(root) {
  const directory = join(root, '.dotdotgod', 'vectors');
  return {
    directory,
    manifest: join(directory, 'manifest.json'),
    chunks: join(directory, 'chunks.jsonl'),
    embeddings: join(directory, 'embeddings.f32'),
  };
}

export function readVectorCache(root) {
  const paths = vectorCachePaths(root);
  if (!existsSync(paths.manifest) || !existsSync(paths.chunks) || !existsSync(paths.embeddings)) return null;
  try {
    const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'));
    if (manifest.schemaVersion !== VECTOR_SCHEMA_VERSION || manifest.model !== VECTOR_MODEL || manifest.dimensions !== VECTOR_DIMENSIONS) return null;
    const chunks = readFileSync(paths.chunks, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const buffer = readFileSync(paths.embeddings);
    if (buffer.byteLength !== chunks.length * VECTOR_DIMENSIONS * 4) return null;
    const vectors = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    return { manifest, chunks, vectors: new Float32Array(vectors) };
  } catch {
    return null;
  }
}

function atomicWrite(path, data) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, data);
  renameSync(temporary, path);
}

export function writeVectorCache(root, chunks, vectors, metadata = {}) {
  const paths = vectorCachePaths(root);
  mkdirSync(paths.directory, { recursive: true });
  if (vectors.length !== chunks.length * VECTOR_DIMENSIONS) throw new Error('Vector count does not match chunk metadata.');
  const manifest = {
    schemaVersion: VECTOR_SCHEMA_VERSION,
    model: VECTOR_MODEL,
    dimensions: VECTOR_DIMENSIONS,
    chunks: chunks.length,
    generatedAt: new Date().toISOString(),
    ...metadata,
  };
  atomicWrite(paths.chunks, `${chunks.map((chunk) => JSON.stringify(chunk)).join('\n')}\n`);
  atomicWrite(paths.embeddings, Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength));
  atomicWrite(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function removeVectorCache(root) {
  rmSync(vectorCachePaths(root).directory, { recursive: true, force: true });
}
