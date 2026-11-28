import { randomUUID } from 'node:crypto';
import { appendFileSync, constants, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const M = 16;
const M0 = 32;
const EF_CONSTRUCTION = 100;
const ML = 1 / Math.log(M);
export const HNSW_THRESHOLD = 2000;
const MAGIC = 'DDGHNSW1';

class Heap {
  rows = [];
  constructor(direction) { this.direction = direction; }
  before(a, b) { return (a.score - b.score) * this.direction < 0; }
  push(value) {
    const rows = this.rows;
    let i = rows.length;
    rows.push(value);
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (!this.before(value, rows[p])) break;
      rows[i] = rows[p]; i = p;
    }
    rows[i] = value;
  }
  pop() {
    const rows = this.rows;
    const first = rows[0];
    const end = rows.pop();
    if (!rows.length) return first;
    let i = 0;
    while (2 * i + 1 < rows.length) {
      let child = 2 * i + 1;
      if (child + 1 < rows.length && this.before(rows[child + 1], rows[child])) child += 1;
      if (!this.before(rows[child], end)) break;
      rows[i] = rows[child]; i = child;
    }
    rows[i] = end;
    return first;
  }
}
const ranked = (a, b) => b.score - a.score || a.id - b.id;
function dot(query, slab, offset) {
  let sum = 0;
  for (let i = 0; i < query.length; i += 1) sum += query[i] * slab[offset + i];
  return sum;
}
function layerFor(id) {
  let seed = Math.imul(id ^ (id >>> 16), 0x45d9f3b);
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  return Math.floor(-Math.log((((seed ^ (seed >>> 16)) >>> 0) + 1) / 4294967297) * ML);
}
export function vectorTier(active, threshold = HNSW_THRESHOLD) {
  return active >= threshold ? 'hnsw' : 'exact';
}
export function exactSearch(query, rows, k, allowed = () => true) {
  const heap = new Heap(1);
  const distinct = new Map();
  const offer = (row) => {
    if (heap.rows.length < k || ranked(row, heap.rows[0]) < 0) {
      heap.push(row);
      if (heap.rows.length > k) heap.pop();
    }
  };
  for (const { id, vector, key } of rows) {
    if (!allowed(id)) continue;
    const row = { id, score: dot(query, vector, 0) };
    if (key === undefined) offer(row);
    else if (!distinct.has(key) || ranked(row, distinct.get(key)) < 0) distinct.set(key, row);
  }
  for (const row of distinct.values()) offer(row);
  return heap.rows.sort(ranked);
}

export class HnswIndex {
  constructor(dimensions, capacity = 32) {
    this.dimensions = dimensions;
    this.vectors = new Float32Array(capacity * dimensions);
    this.deleted = new Uint8Array(capacity);
    this.visited = new Uint32Array(capacity);
    this.ids = new Uint32Array(capacity);
    this.positions = new Map();
    this.links = [];
    this.visit = 0;
    this.entry = -1;
    this.maxLayer = -1;
    this.tombstoneCount = 0;
    this.generation = 0;
  }
  get size() { return this.links.length; }
  vector(position) { return this.vectors.subarray(position * this.dimensions, (position + 1) * this.dimensions); }
  score(query, position) { return dot(query, this.vectors, position * this.dimensions); }
  reserve() {
    if (this.size < this.ids.length) return;
    for (const key of ['vectors', 'deleted', 'visited', 'ids']) {
      const current = this[key];
      this[key] = new current.constructor(current.length * 2);
      this[key].set(current);
    }
  }
  descend(query, entry, layer) {
    let best = this.score(query, entry);
    let improved;
    do {
      improved = false;
      for (const neighbor of this.links[entry][layer]) {
        const score = this.score(query, neighbor);
        if (score > best) { entry = neighbor; best = score; improved = true; }
      }
    } while (improved);
    return entry;
  }
  beam(query, entry, layer, ef) {
    if (this.visit === 0xffffffff) { this.visited.fill(0); this.visit = 0; }
    const visit = ++this.visit;
    const candidates = new Heap(-1);
    const nearest = new Heap(1);
    const first = { id: entry, score: this.score(query, entry) };
    candidates.push(first); nearest.push(first); this.visited[entry] = visit;
    while (candidates.rows.length) {
      const current = candidates.pop();
      if (nearest.rows.length >= ef && current.score < nearest.rows[0].score) break;
      for (const id of this.links[current.id][layer]) {
        if (this.visited[id] === visit) continue;
        this.visited[id] = visit;
        const score = this.score(query, id);
        if (nearest.rows.length >= ef && score <= nearest.rows[0].score) continue;
        const row = { id, score };
        candidates.push(row); nearest.push(row);
        if (nearest.rows.length > ef) nearest.pop();
      }
    }
    return nearest.rows.sort(ranked);
  }
  select(candidates, count) {
    const selected = [];
    const skipped = [];
    for (const { id, score } of candidates) {
      if (selected.length === count) break;
      const vector = this.vector(id);
      if (selected.every((other) => this.score(vector, other) <= score)) selected.push(id);
      else skipped.push(id);
    }
    selected.push(...skipped.slice(0, count - selected.length));
    return Uint32Array.from(selected);
  }
  insert(nodeId, vector) {
    if (!Number.isInteger(nodeId) || nodeId < 0 || nodeId > 0xffffffff || this.positions.has(nodeId) || vector.length !== this.dimensions) throw new Error('Invalid HNSW node.');
    this.reserve();
    const position = this.size;
    const level = layerFor(nodeId);
    this.ids[position] = nodeId;
    this.positions.set(nodeId, position);
    this.vectors.set(vector, position * this.dimensions);
    this.links.push(Array.from({ length: level + 1 }, () => new Uint32Array(0)));
    if (this.entry >= 0) {
      let entry = this.entry;
      for (let layer = this.maxLayer; layer > level; layer -= 1) entry = this.descend(vector, entry, layer);
      for (let layer = Math.min(level, this.maxLayer); layer >= 0; layer -= 1) {
        const candidates = this.beam(vector, entry, layer, EF_CONSTRUCTION);
        const links = this.select(candidates, M);
        this.links[position][layer] = links;
        const cap = layer === 0 ? M0 : M;
        for (const neighbor of links) {
          const current = this.links[neighbor][layer];
          const next = [...current, position];
          this.links[neighbor][layer] = next.length <= cap ? Uint32Array.from(next) : this.select(
            next.map((id) => ({ id, score: this.score(this.vector(neighbor), id) })).sort(ranked), cap);
        }
        entry = candidates[0].id;
      }
    }
    if (level > this.maxLayer) { this.entry = position; this.maxLayer = level; }
  }
  markDeleted(id) {
    const offset = this.positions.get(id);
    if (offset !== undefined && !this.deleted[offset]) { this.deleted[offset] = 1; this.tombstoneCount += 1; }
  }
  search(query, k, efSearch = Math.max(64, k * 4), allowed = () => true) {
    if (this.entry < 0) return [];
    let entry = this.entry;
    for (let layer = this.maxLayer; layer > 0; layer -= 1) entry = this.descend(query, entry, layer);
    return this.beam(query, entry, 0, Math.max(k, efSearch))
      .filter(({ id }) => !this.deleted[id] && allowed(this.ids[id])).slice(0, k)
      .map(({ id, score }) => ({ id: this.ids[id], score }));
  }
  compact() {
    if (this.tombstoneCount < 500 || this.tombstoneCount / this.size <= 0.2) return false;
    const rebuilt = new HnswIndex(this.dimensions, Math.max(32, this.size - this.tombstoneCount));
    for (let i = 0; i < this.size; i += 1) if (!this.deleted[i]) rebuilt.insert(this.ids[i], this.vector(i));
    rebuilt.generation = this.generation;
    Object.assign(this, rebuilt);
    return true;
  }
  save(path) {
    const header = Buffer.alloc(64);
    header.write(MAGIC);
    [1, this.dimensions, M, M0, this.entry, this.maxLayer, this.size, this.tombstoneCount, this.generation]
      .forEach((n, i) => header.writeInt32LE(n, 8 + 4 * i));
    const layers = this.links.flat();
    const layerCounts = Uint32Array.from(this.links, (node) => node.length);
    const lengths = Uint32Array.from(layers, (layer) => layer.length);
    const neighbors = new Uint32Array(lengths.reduce((sum, length) => sum + length, 0));
    let offset = 0;
    for (const layer of layers) { neighbors.set(layer, offset); offset += layer.length; }
    const array = (slab) => Buffer.from(slab.buffer, slab.byteOffset, slab.byteLength);
    const data = Buffer.concat([header, array(this.vectors.subarray(0, this.size * this.dimensions)), array(this.ids.subarray(0, this.size)),
      array(layerCounts), array(lengths), array(neighbors), array(this.deleted.subarray(0, this.size))]);
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp-${randomUUID()}`;
    try { writeFileSync(temporary, data, { flag: 'wx', flush: true }); renameSync(temporary, path); }
    finally { rmSync(temporary, { force: true }); }
  }
  static load(path) {
    const data = readBinary(path);
    if (data.toString('utf8', 0, 8) !== MAGIC || data.readInt32LE(8) !== 1) throw new Error('Invalid HNSW header.');
    const [dimensions, m, m0, entry, maxLayer, count, tombstoneCount, generation] = Array.from({ length: 8 }, (_, i) => data.readInt32LE(12 + i * 4));
    if (dimensions < 1 || count < 0 || m !== M || m0 !== M0 || count * (dimensions * 4 + 9) > data.length - 64) throw new Error('Invalid HNSW dimensions.');
    const result = new HnswIndex(dimensions, Math.max(32, count));
    let offset = 64;
    const take = (Type, length) => {
      const bytes = length * Type.BYTES_PER_ELEMENT;
      if (offset + bytes > data.length) throw new Error('Truncated HNSW data.');
      const values = new Type(data.buffer, data.byteOffset + offset, length);
      offset += bytes;
      return values;
    };
    result.vectors.set(take(Float32Array, count * dimensions));
    result.ids.set(take(Uint32Array, count));
    const layerCounts = take(Uint32Array, count);
    const lengths = take(Uint32Array, layerCounts.reduce((sum, length) => sum + length, 0));
    let layer = 0;
    for (let i = 0; i < count; i += 1) {
      if (result.positions.has(result.ids[i]) || layerCounts[i] < 1 || layerCounts[i] > 32) throw new Error('Invalid HNSW layers.');
      result.positions.set(result.ids[i], i);
      result.links.push(Array.from({ length: layerCounts[i] }, (_, level) => {
        const length = lengths[layer++];
        if (length > (level ? M : M0)) throw new Error('Invalid HNSW edge count.');
        const adjacent = take(Uint32Array, length);
        if (adjacent.some((node) => node >= count || layerCounts[node] <= level)) throw new Error('Invalid HNSW neighbor.');
        return Uint32Array.from(adjacent);
      }));
    }
    result.deleted.set(take(Uint8Array, count));
    if (offset !== data.length || (count ? !result.links[entry]?.[maxLayer] : entry !== -1)) throw new Error('Invalid HNSW layout.');
    Object.assign(result, { entry, maxLayer, tombstoneCount, generation });
    return result;
  }
}

export function graphPath(root, profile) {
  if (!/^[a-f0-9]{64}$/.test(profile)) throw new Error('Invalid vector profile fingerprint.');
  const directory = join(realpathSync(root), '.dotdotgod', 'vectors');
  const entry = lstatSync(directory, { throwIfNoEntry: false });
  if (entry && !entry.isDirectory()) throw new Error('Vector directory must not be a symlink.');
  return join(directory, `hnsw-${profile.slice(0, 16)}.bin`);
}
function readBinary(path) {
  if (!lstatSync(path).isFile()) throw new Error('Graph paths must be regular files.');
  return readFileSync(path, { flag: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK });
}
const deltaPath = (path) => path.replace(/\.bin$/, '.wal');
export function appendGraphDelta(path, generation, dimensions, inserted, deleted) {
  const delta = deltaPath(path);
  const stat = lstatSync(delta, { throwIfNoEntry: false });
  if (stat && !stat.isFile()) throw new Error('Graph delta must be a regular file.');
  const frame = Buffer.alloc(12 + inserted.length * (4 + dimensions * 4) + deleted.length * 4);
  [generation, inserted.length, deleted.length].forEach((n, i) => frame.writeUInt32LE(n, i * 4));
  let offset = 12;
  for (const { id, vector } of inserted) {
    frame.writeUInt32LE(id, offset); offset += 4;
    Buffer.from(vector.buffer, vector.byteOffset, dimensions * 4).copy(frame, offset); offset += dimensions * 4;
  }
  for (const id of deleted) { frame.writeUInt32LE(id, offset); offset += 4; }
  appendFileSync(delta, frame, { flush: true });
}
export function checkpointGraph(path, graph) {
  graph.save(path);
  rmSync(deltaPath(path), { force: true });
}
export function loadGraph(path, generation) {
  const graph = HnswIndex.load(path);
  if (graph.generation > generation) return null;
  graph.deltaBytes = 0;
  if (graph.generation === generation) return graph;
  const data = readBinary(deltaPath(path));
  const { dimensions } = graph;
  let offset = 0;
  while (graph.generation < generation) {
    const version = data.readUInt32LE(offset);
    const inserted = data.readUInt32LE(offset + 4);
    const deleted = data.readUInt32LE(offset + 8);
    offset += 12;
    const end = offset + inserted * (4 + dimensions * 4) + deleted * 4;
    if (end > data.length || version > graph.generation + 1) return null;
    if (version <= graph.generation) { offset = end; continue; }
    for (let i = 0; i < inserted; i += 1) {
      const id = data.readUInt32LE(offset); offset += 4;
      graph.insert(id, new Float32Array(data.buffer, data.byteOffset + offset, dimensions)); offset += dimensions * 4;
    }
    for (let i = 0; i < deleted; i += 1) { graph.markDeleted(data.readUInt32LE(offset)); offset += 4; }
    graph.generation = version;
  }
  graph.deltaBytes = offset;
  return graph;
}

export function discardUncommittedDelta(path, graph) {
  const delta = deltaPath(path);
  const stat = lstatSync(delta, { throwIfNoEntry: false });
  if (stat && !stat.isFile()) throw new Error('Graph delta must be a regular file.');
  if (stat && stat.size !== graph.deltaBytes) truncateSync(delta, graph.deltaBytes);
}

const warm = new Map();
export function warmGraph(path, generation, instance = '') {
  const key = `${path}\0${instance}`;
  const cached = warm.get(key);
  if (cached?.generation === generation) return cached;
  try {
    const graph = loadGraph(path, generation);
    if (graph) {
      if (warm.size >= 4) warm.delete(warm.keys().next().value);
      warm.set(key, graph);
    }
    return graph;
  } catch { return null; }
}
