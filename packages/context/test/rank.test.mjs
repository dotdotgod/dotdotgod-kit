import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateKey,
  normalizeSearchTerms,
  reciprocalRankFusion,
  rerankCandidates,
  scoreCandidateSignals,
  termProximity,
} from '../src/rank.mjs';

function candidate(sourceId, ordinal = 0, extra = {}) {
  return { sourceId, ordinal, label: sourceId, body: '', metadata: {}, ...extra };
}

test('normalizeSearchTerms deduplicates normalized terms and enforces the query bound', () => {
  const terms = normalizeSearchTerms(`Alpha ALPHA ${Array.from({ length: 30 }, (_, i) => `t${i}`).join(' ')}`);
  assert.equal(terms[0], 'alpha');
  assert.equal(new Set(terms).size, terms.length);
  assert.equal(terms.length, 20);
});

test('candidateKey uses source and ordinal or an explicit id', () => {
  assert.equal(candidateKey(candidate('source', 3)), 'source:3');
  assert.equal(candidateKey({ id: 'label-only' }), 'label-only');
  assert.throws(() => candidateKey({ label: 'missing' }), /requires sourceId or id/);
});

test('reciprocalRankFusion combines named providers and ignores provider duplicates', () => {
  const a = candidate('a');
  const b = candidate('b');
  const c = candidate('c');
  const fused = reciprocalRankFusion([
    { name: 'porter', candidates: [a, b, b, c] },
    { name: 'label', candidates: [b, a] },
  ], { k: 10 });

  assert.deepEqual(fused.map((entry) => entry.key), ['a:0', 'b:0', 'c:0']);
  assert.deepEqual(fused[1].ranks, [{ provider: 'porter', rank: 2 }, { provider: 'label', rank: 1 }]);
  assert.equal(fused[1].rrfScore, 1 / 12 + 1 / 11);
});

test('reciprocalRankFusion has deterministic key ties and bounded output', () => {
  const fused = reciprocalRankFusion([
    { name: 'one', candidates: [candidate('b'), candidate('a')] },
    { name: 'two', candidates: [candidate('a'), candidate('b')] },
  ], { limit: 1 });
  assert.equal(fused.length, 1);
  assert.equal(fused[0].key, 'a:0');
  assert.throws(() => reciprocalRankFusion([{ name: '', candidates: [] }]), /requires a name/);
  assert.throws(() => reciprocalRankFusion([], { k: 0 }), /positive number/);
});

test('termProximity rewards adjacent terms and requires all distinct query terms', () => {
  assert.equal(termProximity('alpha beta', 'alpha beta'), 1);
  assert.equal(termProximity('alpha one two beta', 'alpha beta'), 1 / 3);
  assert.equal(termProximity('alpha only', 'alpha beta'), 0);
  assert.equal(termProximity('alpha', 'alpha'), 0);
});

test('scoreCandidateSignals explains exact and coverage signals within a bound', () => {
  const scored = scoreCandidateSignals(candidate('x', 0, {
    label: 'auth token',
    body: 'auth token refresh',
    metadata: { path: 'docs/auth-token.md' },
  }), 'auth token', { maxExplanations: 2 });
  assert.ok(scored.score > 0);
  assert.equal(scored.signals.length, 2);
  assert.equal(scored.signals[0], 'exact-title');
  assert.match(scored.signals[1], /^title-coverage:/);
});

test('rerankCandidates can promote a stronger title without losing RRF evidence', () => {
  const weak = candidate('weak', 0, { label: 'misc', body: 'auth words far from token' });
  const strong = candidate('strong', 0, { label: 'auth token', body: 'auth token' });
  const fused = [
    { key: 'weak:0', candidate: weak, rrfScore: 0.02, ranks: [{ provider: 'porter', rank: 1 }] },
    { key: 'strong:0', candidate: strong, rrfScore: 0.019, ranks: [{ provider: 'porter', rank: 2 }] },
  ];
  const ranked = rerankCandidates(fused, 'auth token');
  assert.equal(ranked[0].key, 'strong:0');
  assert.equal(ranked[0].ranking.rrfScore, 0.019);
  assert.ok(ranked[0].ranking.rerankScore > 0);
  assert.ok(ranked[0].ranking.signals.length <= 4);
});
