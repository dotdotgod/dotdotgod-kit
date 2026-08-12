import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const VECTOR_SCHEMA_VERSION = 2;
export const VECTOR_MODEL = 'Xenova/multilingual-e5-small';
export const VECTOR_DIMENSIONS = 384;

export function profileFingerprint(identity) {
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

export function isValidNormalizedVectorValues(values, dimensions = VECTOR_DIMENSIONS) {
  if (!Number.isInteger(dimensions) || dimensions < 1 || !values || values.length % dimensions !== 0) return false;
  for (let offset = 0; offset < values.length; offset += dimensions) {
    let squaredNorm = 0;
    for (let index = 0; index < dimensions; index += 1) {
      const value = values[offset + index];
      if (!Number.isFinite(value) || value < -1 || value > 1) return false;
      squaredNorm += value * value;
    }
    if (Math.abs(Math.sqrt(squaredNorm) - 1) > 0.01) return false;
  }
  return true;
}

export function vectorCachePaths(root) {
  const directory = join(root, '.dotdotgod', 'vectors');
  return { directory, manifest: join(directory, 'manifest.json'), chunks: join(directory, 'chunks.jsonl'), embeddings: join(directory, 'embeddings.f32') };
}

export function readVectorCache(root, identity = null) {
  const paths = vectorCachePaths(root);
  if (!existsSync(paths.manifest) || !existsSync(paths.chunks) || !existsSync(paths.embeddings)) return null;
  try {
    const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'));
    if (manifest.schemaVersion !== VECTOR_SCHEMA_VERSION || !Number.isInteger(manifest.dimensions) || manifest.dimensions < 1) return null;
    if (identity && manifest.profileFingerprint !== profileFingerprint(identity)) return null;
    const chunks = readFileSync(paths.chunks, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const buffer = readFileSync(paths.embeddings);
    if (buffer.byteLength !== chunks.length * manifest.dimensions * 4) return null;
    const vectors = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    if (!isValidNormalizedVectorValues(vectors, manifest.dimensions)) return null;
    return { manifest, chunks, vectors: new Float32Array(vectors) };
  } catch { return null; }
}

function atomicWrite(path, data) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, data);
  renameSync(temporary, path);
}

export function writeVectorCache(root, chunks, vectors, metadata = {}) {
  const paths = vectorCachePaths(root);
  const dimensions = metadata.dimensions;
  if (!Number.isInteger(dimensions) || dimensions < 1) throw new Error('Vector dimensions must be a positive integer.');
  mkdirSync(paths.directory, { recursive: true });
  if (vectors.length !== chunks.length * dimensions) throw new Error('Vector count does not match chunk metadata.');
  if (!isValidNormalizedVectorValues(vectors, dimensions)) throw new Error('Vectors must contain finite normalized values.');
  const manifest = { schemaVersion: VECTOR_SCHEMA_VERSION, chunks: chunks.length, generatedAt: new Date().toISOString(), ...metadata };
  atomicWrite(paths.chunks, `${chunks.map((chunk) => JSON.stringify(chunk)).join('\n')}\n`);
  atomicWrite(paths.embeddings, Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength));
  atomicWrite(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function removeVectorCache(root) { rmSync(vectorCachePaths(root).directory, { recursive: true, force: true }); }
