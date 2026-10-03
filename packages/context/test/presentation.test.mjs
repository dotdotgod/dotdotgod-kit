import assert from 'node:assert/strict';
import test from 'node:test';
import { formatToolMarkdown } from '../src/presentation.mjs';

const tools = ['execute', 'execute_file', 'index', 'search', 'fetch_and_index', 'session_resume', 'ingestion_job_start', 'ingestion_job_status', 'ingestion_job_cancel', 'context_heal', 'stats', 'doctor', 'purge', 'dotdotgod_project_load', 'dotdotgod_embedding_status', 'dotdotgod_embedding_install', 'dotdotgod_project_initialize', 'impact_status'];
for (const name of tools) {
  test(`${name}: summary preserves failures, empty results and untrusted multiline data without mutating fields`, () => {
    const value = { ok: false, results: [{ ok: false, label: 'x', code: 9, timedOut: false, aborted: true, captureLimitExceeded: true, truncated: true, indexed: { id: 'source-1' }, stdout: '```\n# injected\n````\n中文 <tag> & text' }], error: null, pending: [] };
    const before = structuredClone(value);
    const text = formatToolMarkdown(name, value);
    assert.match(text, /^## /);
    for (const marker of ['code: 9', 'timed Out: false', 'aborted: true', 'capture Limit Exceeded: true', 'truncated: true', 'source-1', '- None', '中文 <tag> & text']) assert.ok(text.includes(marker), marker);
    assert.match(text, /`````text\n/);
    assert.deepEqual(value, before);
    assert.ok(text.includes('# injected'));
    if (name === 'search') assert.match(text, /partial evidence/);
  });
}
test('metadata keys cannot introduce Markdown headings', () => {
  const text = formatToolMarkdown('index', { 'key\n# heading': true });
  assert.equal(text.includes('\n# heading'), false);
  assert.ok(text.includes('\\# heading'));
});
test('dense backticks do not exceed the JavaScript argument limit or lose payload', () => {
  const payload = '`x'.repeat(150000);
  const text = formatToolMarkdown('execute', { stdout: payload });
  assert.ok(text.includes(payload));
  assert.match(text, /```text\n/);
});
test('successful execution summary is smaller than JSON while structured fields stay intact', () => {
  const value = { ok: true, concurrency: 1, results: [{ ok: true, command: 'node --version', cwd: '/workspace', code: 0, signal: null, timedOut: false, aborted: false, captureLimitExceeded: false, captureLimitBytes: 10485760, durationMs: 39, stdoutBytes: 8, stderrBytes: 0, environmentPolicy: { mode: 'inherit-filtered-v1', platform: 'darwin', filteredNames: [] }, stdout: 'v24.0.0\n', stderr: '', truncated: false }] };
  const before = structuredClone(value);
  const text = formatToolMarkdown('execute', value);
  assert.ok(text.length < JSON.stringify(value).length);
  for (const marker of ['ok: true', 'code: 0', 'v24.0.0', 'untrusted']) assert.ok(text.includes(marker), marker);
  for (const marker of ['cwd:', 'duration Ms:', 'environment Policy:', 'timed Out:', 'stderr:']) assert.equal(text.includes(marker), false, marker);
  assert.deepEqual(value, before);
});
test('indexed IDs and failure diagnostics survive summary', () => {
  const text = formatToolMarkdown('execute', { ok: false, results: [{ ok: false, code: null, signal: 'SIGTERM', timedOut: true, aborted: false, captureLimitExceeded: true, truncated: true, cwd: '/workspace', indexed: { id: 'source-1' }, stderr: 'fatal\nreason' }] });
  for (const marker of ['code: null', 'SIGTERM', 'timed Out: true', 'aborted: false', 'capture Limit Exceeded: true', 'truncated: true', '/workspace', 'source-1', 'fatal\n']) assert.ok(text.includes(marker), marker);
});
test('search summary removes ranking duplicates, not evidence or source identifiers', () => {
  const value = { ok: true, results: [{ sourceId: 'source-1', label: 'report', ordinal: 2, text: 'evidence', metadata: { contentHash: 'duplicate' }, ranking: { rrfScore: 0.03 }, rank: -4 }] };
  const text = formatToolMarkdown('search', value);
  for (const marker of ['source-1', 'ordinal: 2', 'evidence', 'untrusted', 'partial evidence']) assert.ok(text.includes(marker), marker);
  assert.equal(text.includes('duplicate'), false);
  assert.equal(text.includes('rrf Score'), false);
  const unsummarized = formatToolMarkdown('index', value);
  assert.ok(text.slice(text.indexOf('- ok:')).length < unsummarized.slice(unsummarized.indexOf('- ok:')).length);
  assert.equal(value.results[0].metadata.contentHash, 'duplicate');
});
test('short values cannot inject markup and multiline array fences remain nested', () => {
  const text = formatToolMarkdown('index', { id: '<tag>*value*', items: ['first\n```\n# injected'] });
  assert.ok(text.includes('\\<tag\\>\\*value\\*'));
  assert.ok(text.includes('    ````text\n'));
});
test('presentation adds no size cap', () => {
  const payload = 'x'.repeat(100000);
  assert.ok(formatToolMarkdown('execute', { stdout: payload }).includes(payload));
});
