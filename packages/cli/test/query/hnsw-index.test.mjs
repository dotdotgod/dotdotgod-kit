import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { HnswIndex, appendGraphDelta, checkpointGraph, discardUncommittedDelta, exactSearch, loadGraph, vectorTier, warmGraph } from '../../src/query/hnsw-index.mjs';

function rng(seed) {
  return () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 2 ** 32;
  };
}
function normalized(row) {
  const norm = Math.sqrt(row.reduce((sum, value) => sum + value * value, 0));
  return row.map((value) => value / norm);
}

test('binary snapshots, generations, interrupted deltas and compaction', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hnsw-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'index.bin');
  const graph = new HnswIndex(2);
  const unit = (i) => normalized(Float32Array.of(Math.cos(i), Math.sin(i)));
  for (let id = 1; id <= 2200; id += 1) graph.insert(id, unit(id));
  graph.generation = 1;
  checkpointGraph(path, graph);
  assert.equal(readFileSync(path).toString('ascii', 0, 8), 'DDGHNSW1');
  const original = HnswIndex.load(path);
  assert.deepEqual(original.vectors.subarray(0, 4400), graph.vectors.subarray(0, 4400));
  assert.deepEqual(original.links, graph.links);
  const query = unit(14);
  assert.equal(original.search(query, 1)[0].id, 14);
  const inserted = { id: 3000, vector: query };
  graph.insert(inserted.id, inserted.vector);
  graph.markDeleted(14);
  appendGraphDelta(path, 2, 2, [inserted], [14]);
  appendFileSync(join(dir, 'index.wal'), Buffer.from([3, 0, 0]));
  assert.equal(loadGraph(path, 1).search(query, 1)[0].id, 14);
  assert.deepEqual(loadGraph(path, 2).search(query, 5), graph.search(query, 5));
  const reopened = loadGraph(path, 2);
  discardUncommittedDelta(path, reopened);
  assert.equal(warmGraph(path, 2), warmGraph(path, 2));
  assert.equal(reopened.search(query, 1)[0].id, 3000);
  for (let id = 1; id <= 497; id += 1) reopened.markDeleted(id);
  assert.equal(reopened.compact(), false);
  for (let id = 498; id <= 500; id += 1) reopened.markDeleted(id);
  assert.equal(reopened.compact(), true);
  assert.equal(reopened.tombstoneCount, 0);
  assert.equal(reopened.size, 1701);
  checkpointGraph(path, reopened);
  assert.deepEqual(loadGraph(path, 2).links, reopened.links);
  assert.equal(vectorTier(1999), 'exact');
  assert.equal(vectorTier(2000), 'hnsw');
  assert.equal(vectorTier(4, 4), 'hnsw');
  assert.deepEqual(exactSearch(query, [inserted, { id: 4000, vector: unit(4000) }], 1).map(({ id }) => id), [3000]);
});

for (const size of [10_000, 50_000]) test(`offline nearest-neighbor recall at ${size} × 384`, { timeout: 300_000 }, async (t) => {
  const dimensions = 384;
  const random = rng(42);
  const centers = Array.from({ length: 128 }, () => normalized(Float32Array.from({ length: dimensions }, () => random() * 2 - 1)));
  function near(base, jitter) { return normalized(base.map((entry) => entry + (random() * 2 - 1) * jitter)); }
  const rows = Array.from({ length: size }, (_, id) => ({ id, vector: near(centers[id % centers.length], 0.055) }));
  const queries = Array.from({ length: 32 }, (_, i) => near(rows[(i * 1951 + 43) % size].vector, 0.036));
  const buildStart = performance.now();
  const graph = new HnswIndex(dimensions, size);
  for (const row of rows) graph.insert(row.id, row.vector);
  const buildMs = performance.now() - buildStart;
  // Measure the two retrieval methods in separate warm passes, not interleaved with exact scans or graph builds.
  await nextTurn();
  const measure = (search) => {
    for (const query of queries.slice(0, 8)) search(query);
    const times = [];
    const results = queries.map((query) => {
      const start = performance.now();
      const result = search(query);
      times.push(performance.now() - start);
      return result;
    });
    return { times, results };
  };
  const ann = measure((query) => graph.search(query, 10));
  const exact = measure((query) => exactSearch(query, rows, 10));
  const hits = ann.results.reduce((count, approx, i) => {
    const truth = new Set(exact.results[i].map(({ id }) => id));
    return count + approx.filter(({ id }) => truth.has(id)).length;
  }, 0);
  const stats = (samples) => {
    samples.sort((a, b) => a - b);
    return { medianMs: samples[samples.length >> 1], p95Ms: samples[Math.ceil(samples.length * 0.95) - 1], maxMs: samples.at(-1) };
  };
  const recall = hits / (queries.length * 10);
  t.diagnostic(JSON.stringify({ size, dimensions, seed: 42, centers: centers.length, queryCount: queries.length, buildMs, recallAt10: recall,
    tier: vectorTier(size), efSearch: 64, graphWarm: stats(ann.times), exactWarm: stats(exact.times) }));
  assert.ok(recall >= 0.95, `recall@10=${recall}`);
  assert.ok(Math.max(...ann.times) < 10, `warm HNSW max=${Math.max(...ann.times)} ms`);
});
