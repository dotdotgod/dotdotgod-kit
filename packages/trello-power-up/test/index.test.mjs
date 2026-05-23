import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DOTDOTGOD_FIELD_NAME, parseDotdotgodViewPayload, readDotdotgodEntries, renderLinkedDocsHtml } from '../src/index.js';

describe('dotdotgod Trello Power-Up helpers', () => {
  it('parses dotdotgod-view custom field payloads', () => {
    const parsed = parseDotdotgodViewPayload(JSON.stringify({ version: 1, entries: [{ repositoryKey: 'example/repo', docsPath: 'docs/trello/task.md', githubUrl: 'https://github.com/example/repo/blob/main/docs/trello/task.md', title: 'Task', summary: 'Preview text.', traceabilityState: 'present' }] }));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.entries[0].repositoryLabel, 'repo');
    assert.equal(parsed.entries[0].title, 'Task');
    assert.equal(parsed.entries[0].summary, 'Preview text.');
  });

  it('reports invalid payloads without throwing', () => {
    const parsed = parseDotdotgodViewPayload('{bad');
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /Invalid/);
  });

  it('renders linked docs safely', () => {
    const html = renderLinkedDocsHtml([{ repositoryKey: '<repo>', docsPath: 'docs/trello/task.md', githubUrl: 'https://github.com/example/repo/blob/main/docs/trello/task.md', title: '<Title>', summary: 'Summary <script>', traceabilityState: 'present', traceabilityDetails: ['implementedBy: 1'] }]);
    assert.match(html, /&lt;repo&gt;/);
    assert.match(html, /&lt;Title&gt;/);
    assert.match(html, /Summary &lt;script&gt;/);
    assert.match(html, /implementedBy: 1/);
    assert.doesNotMatch(html, /<repo>/);
  });

  it('reads entries from Trello custom field data', async () => {
    const payload = JSON.stringify({ version: 1, entries: [{ repositoryKey: 'example/repo' }] });
    const t = {
      async card() { return { customFieldItems: [{ idCustomField: 'field1', value: { text: payload } }] }; },
      async board() { return { customFields: [{ id: 'field1', name: DOTDOTGOD_FIELD_NAME, type: 'text' }] }; },
    };
    const parsed = await readDotdotgodEntries(t);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.entries[0].repositoryKey, 'example/repo');
  });
});
