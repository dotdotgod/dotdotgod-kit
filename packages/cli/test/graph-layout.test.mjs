import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as d3 from 'd3';

const context = { module: { exports: {} } };
runInNewContext(readFileSync(new URL('../src/graph-view/assets/layout.js', import.meta.url), 'utf8'), context);
const { layoutKey, createGraphLayout, graphFit, keepGraphInView } = context.module.exports;

test('topology identity ignores D3 mutation, ordering and styling-only changes', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }];
  const edges = [{ source: 'a', target: 'b', weight: 2 }];
  const before = layoutKey(nodes, edges);
  assert.equal(layoutKey([...nodes].reverse(), [{ source: nodes[0], target: nodes[1], weight: 4 }]), before);
  assert.notEqual(layoutKey(nodes, []), before);
});

test('disconnected clusters have bounded extent under repeated simulation', () => {
  const nodes = Array.from({ length: 24 }, (_, i) => ({ id: String(i) }));
  const edges = Array.from({ length: 12 }, (_, i) => ({ source: String(i * 2), target: String(i * 2 + 1) }));
  const simulation = createGraphLayout(d3, nodes, edges).stop();
  for (let i = 0; i < 5; i++) {
    simulation.alpha(1);
    simulation.tick(300);
    assert.ok(nodes.every(n => Number.isFinite(n.x) && Math.hypot(n.x, n.y) < 1000));
  }
});

test('large graphs fit below former 0.1 limit and zoom-out keeps bounds visible', () => {
  const nodes = [{ x: -100000, y: -50000 }, { x: 100000, y: 50000 }];
  const area = { width: 800, height: 500 };
  const fit = graphFit(nodes, area);
  assert.ok(fit.scale < .1 && fit.scale > 0);
  const scale = fit.scale / 2;
  const pan = keepGraphInView(nodes, area, scale, [9000, -9000]);
  assert.ok(nodes.every(n => Math.abs(n.x * scale + pan[0]) <= area.width / 2 - 16));
  assert.ok(nodes.every(n => Math.abs(n.y * scale + pan[1]) <= area.height / 2 - 16));
  const css = readFileSync(new URL('../src/graph-view/assets/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /line-through/);
});
