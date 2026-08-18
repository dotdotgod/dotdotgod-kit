import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHtml } from '../src/html-normalize.mjs';

test('preserves useful document structure and metadata deterministically', () => {
  const html = `<!doctype html><html><head><title>  Example &amp; Test </title></head><body>
    <h1>Guide</h1><p>Hello <strong>world</strong>.</p>
    <h2>Steps</h2><ul><li>One</li><li>Two</li></ul>
    <table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>
    <pre><code>const x = 1 &lt; 2;</code></pre>
    <p>Read <a href="/docs?a=1&amp;b=2">the docs</a>.</p>
  </body></html>`;
  const first = normalizeHtml(html, { contentType: 'text/html; charset=UTF-8' });
  const second = normalizeHtml(html, { contentType: 'text/html; charset=UTF-8' });
  assert.deepEqual(first, second);
  assert.equal(first.title, 'Example & Test');
  assert.match(first.text, /^# Guide/mu);
  assert.match(first.text, /## Steps/mu);
  assert.match(first.text, /- One\n{1,2}- Two/u);
  assert.match(first.text, /\| Name \| \| Value/u);
  assert.match(first.text, /```\nconst x = 1 < 2;\n```/u);
  assert.match(first.text, /Read the docs\./u);
  assert.deepEqual(first.links, [{ text: 'the docs', href: '/docs?a=1&b=2' }]);
  assert.equal(first.extractor, 'html-v1');
  assert.equal(first.fallbackReason, null);
  assert.equal(first.mimeType, 'text/html');
  assert.equal(first.charset, 'utf-8');
  assert.equal(first.truncated, false);
});

test('removes active, non-content, comment, and hidden content', () => {
  const result = normalizeHtml(`<main>
    safe<!-- secret --><script>alert('x')</script><style>.x{}</style>
    <noscript>fallback instruction</noscript><template>template instruction</template>
    <iframe>frame</iframe><svg><text>vector</text></svg><form>submit me</form>
    <div hidden>hidden one<div>nested</div>still hidden</div>
    <p aria-hidden="true">hidden two</p><span style="display: none">hidden three</span>
    <p onclick="evil()">visible text</p>
  </main>`);
  assert.equal(result.text, 'safe\n\nvisible text');
  for (const absent of ['alert', 'fallback', 'template', 'frame', 'vector', 'submit', 'hidden', 'evil', 'onclick']) {
    assert.doesNotMatch(result.text, new RegExp(absent, 'u'));
  }
  assert.doesNotMatch(result.text, /\.x/u);
});

test('does not load subresources, follow links, or expose attributes as text', () => {
  const result = normalizeHtml('<p><img src="https://invalid.example/pixel" onerror="steal()">Visit <a href="https://example.test/next" onclick="run()">next</a></p>');
  assert.equal(result.text, 'Visit next');
  assert.deepEqual(result.links, [{ text: 'next', href: 'https://example.test/next' }]);
  assert.doesNotMatch(result.text, /invalid|steal|onclick|run/u);
});

test('rejects unsupported MIME types and charsets', () => {
  assert.throws(() => normalizeHtml('hello', { contentType: 'text/plain' }), /Unsupported HTML MIME type/u);
  assert.throws(() => normalizeHtml('hello', { contentType: 'text/html; charset=iso-8859-1' }), /Unsupported HTML charset/u);
  assert.equal(normalizeHtml('<p>ok</p>', { contentType: 'application/xhtml+xml; charset=us-ascii' }).charset, 'us-ascii');
});

test('rejects invalid bytes and conflicting document charset declarations', () => {
  assert.throws(() => normalizeHtml(Buffer.from([0xff]), { contentType: 'text/html; charset=utf-8' }), /not valid UTF-8/u);
  assert.throws(() => normalizeHtml(Buffer.from('é'), { contentType: 'text/html; charset=us-ascii' }), /outside the declared US-ASCII/u);
  assert.throws(() => normalizeHtml('<meta charset="us-ascii"><p>ok</p>', { contentType: 'text/html; charset=utf-8' }), /charset conflicts/u);
  assert.throws(() => normalizeHtml('<meta http-equiv="Content-Type" content="text/html; charset=us-ascii"><p>ok</p>', { contentType: 'text/html; charset=utf-8' }), /charset conflicts/u);
});

test('bounds collected link metadata independently from normalized text', () => {
  const html = Array.from({ length: 150 }, (_, index) => `<a href="/${index}">link ${index}</a>`).join('');
  const result = normalizeHtml(html);
  assert.equal(result.links.length, 100);
  assert.ok(Buffer.byteLength(JSON.stringify(result.links)) <= 64 * 1024);
});

test('enforces input bytes and bounds output at UTF-8 code-point boundaries', () => {
  assert.throws(() => normalizeHtml('<p>12345</p>', { maxInputBytes: 5 }), /input exceeds maximum/u);
  const result = normalizeHtml('<p>éééé</p>', { maxOutputBytes: 5 });
  assert.equal(result.text, 'éé');
  assert.equal(result.outputBytes, 4);
  assert.equal(result.truncated, true);
  assert.throws(() => normalizeHtml('x', { maxOutputBytes: 0 }), /byte limits/u);
});

test('marks malformed input and returns bounded visible text', () => {
  const unclosed = normalizeHtml('<h1>Title<p>body');
  assert.equal(unclosed.fallbackReason, 'malformed-html');
  assert.match(unclosed.text, /# Title/u);
  assert.match(unclosed.text, /body/u);

  const comment = normalizeHtml('<p>safe</p><!-- never closed');
  assert.equal(comment.text, 'safe');
  assert.equal(comment.fallbackReason, 'malformed-html');
});

test('decodes safe entities and replaces invalid numeric entities', () => {
  const result = normalizeHtml('<p>&lt;x&gt; &quot;q&quot; &#x1F642; &#xD800; &unknown;</p>');
  assert.equal(result.text, '<x> "q" 🙂 � &unknown;');
});

test('replaces nulls and normalizes newlines', () => {
  const result = normalizeHtml('<p>a\0b\r\nc</p>');
  assert.equal(result.text, 'a�b\nc');
});
