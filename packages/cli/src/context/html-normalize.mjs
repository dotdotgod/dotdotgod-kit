const DEFAULT_INPUT_BYTES = 10 * 1024 * 1024;
const DEFAULT_OUTPUT_BYTES = 10 * 1024 * 1024;
const EXTRACTOR = 'html-v1';
const ACCEPTED_MIME = new Set(['text/html', 'application/xhtml+xml']);
const ACCEPTED_CHARSET = new Set(['utf-8', 'utf8', 'us-ascii']);
const MAX_LINKS = 100;
const MAX_LINK_METADATA_BYTES = 64 * 1024;
const BLOCK_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer', 'header', 'hr', 'main', 'nav', 'p', 'section', 'tr']);
const DROP_CONTENT = new Set(['script', 'style', 'noscript', 'template', 'svg', 'math', 'iframe', 'object', 'embed', 'form']);

function positiveLimit(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw new TypeError('HTML byte limits must be positive finite numbers.');
  return Math.floor(value);
}

function parseMediaType(value) {
  const raw = String(value ?? 'text/html');
  const [type, ...parameters] = raw.split(';');
  const mimeType = type.trim().toLowerCase();
  if (!ACCEPTED_MIME.has(mimeType)) throw new Error(`Unsupported HTML MIME type: ${mimeType || '(empty)'}`);
  let charset = 'utf-8';
  for (const parameter of parameters) {
    const match = /^\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s;]+))\s*$/iu.exec(parameter);
    if (match) charset = (match[1] || match[2] || match[3]).toLowerCase();
  }
  if (!ACCEPTED_CHARSET.has(charset)) throw new Error(`Unsupported HTML charset: ${charset}`);
  return { mimeType, charset: charset === 'utf8' ? 'utf-8' : charset };
}

function decodeEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/giu, (whole, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? whole;
    const hexadecimal = entity[1]?.toLowerCase() === 'x';
    const number = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isInteger(number) || number < 0 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) return '\uFFFD';
    return String.fromCodePoint(number);
  });
}

function normalizeWhitespace(value) {
  return value
    .replace(/[\t\f\v ]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function boundedUtf8(value, maxBytes) {
  if (Buffer.byteLength(value) <= maxBytes) return { value, truncated: false };
  let output = '';
  let bytes = 0;
  for (const point of value) {
    const size = Buffer.byteLength(point);
    if (bytes + size > maxBytes) break;
    output += point;
    bytes += size;
  }
  return { value: output.trimEnd(), truncated: true };
}

function tagInfo(raw) {
  const closing = /^<\s*\//u.test(raw);
  const match = /^<\s*\/?\s*([a-z][a-z0-9:-]*)/iu.exec(raw);
  if (!match) return null;
  const name = match[1].toLowerCase();
  return { name, closing, selfClosing: /\/\s*>$/u.test(raw), attributes: closing ? '' : raw.slice(match[0].length, -1) };
}

function hiddenElement(attributes) {
  return /(?:^|\s)hidden(?:\s|=|$)/iu.test(attributes)
    || /(?:^|\s)aria-hidden\s*=\s*(?:["']?true["']?)/iu.test(attributes)
    || /(?:^|\s)type\s*=\s*(?:["']?hidden["']?)/iu.test(attributes)
    || /(?:^|\s)style\s*=\s*(["'])[^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*\1/iu.test(attributes);
}

function hrefFrom(attributes) {
  const match = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/iu.exec(attributes);
  return decodeEntities(match ? (match[1] ?? match[2] ?? match[3] ?? '') : '').trim();
}

export function normalizeHtml(value, options = {}) {
  const maxInputBytes = positiveLimit(options.maxInputBytes, DEFAULT_INPUT_BYTES);
  const maxOutputBytes = positiveLimit(options.maxOutputBytes, DEFAULT_OUTPUT_BYTES);
  const { mimeType, charset } = parseMediaType(options.contentType);
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''), 'utf8');
  const inputBytes = input.length;
  if (inputBytes > maxInputBytes) throw new Error(`HTML input exceeds maximum size: ${inputBytes} bytes`);
  if (charset === 'us-ascii' && input.some((byte) => byte > 0x7f)) throw new Error('HTML body contains bytes outside the declared US-ASCII charset.');
  let html;
  try { html = new TextDecoder('utf-8', { fatal: true }).decode(input); }
  catch { throw new Error('HTML body is not valid UTF-8.'); }
  const declaredCharsets = [...html.matchAll(/<meta\b[^>]*charset\s*=\s*["']?([^\s"'/>;]+)/giu)].map((match) => match[1].toLowerCase().replace('utf8', 'utf-8'));
  for (const match of html.matchAll(/<meta\b(?=[^>]*http-equiv\s*=\s*["']?content-type["']?)[^>]*content\s*=\s*(?:"[^"]*charset\s*=\s*([^\s";]+)[^"]*"|'[^']*charset\s*=\s*([^\s';]+)[^']*'|[^>]*charset\s*=\s*([^\s;>]+))[^>]*>/giu)) {
    declaredCharsets.push((match[1] || match[2] || match[3]).toLowerCase().replace('utf8', 'utf-8'));
  }
  if (declaredCharsets.some((declared) => !ACCEPTED_CHARSET.has(declared) || declared !== charset)) throw new Error('HTML document charset conflicts with the response charset.');
  html = html.replace(/\0/gu, '\uFFFD').replace(/\r\n?/gu, '\n');
  const lower = html.toLowerCase();
  const output = [];
  const headings = [];
  const links = [];
  const skip = [];
  const anchors = [];
  let title = null;
  let titleStart = -1;
  let preDepth = 0;
  let malformed = false;
  let cursor = 0;

  const append = (text) => { if (!skip.length && text) output.push(text); };
  while (cursor < html.length) {
    const open = html.indexOf('<', cursor);
    if (open < 0) {
      append(decodeEntities(html.slice(cursor)));
      break;
    }
    append(decodeEntities(html.slice(cursor, open)));
    if (lower.startsWith('<!--', open)) {
      const end = lower.indexOf('-->', open + 4);
      if (end < 0) { malformed = true; break; }
      cursor = end + 3;
      continue;
    }
    const close = html.indexOf('>', open + 1);
    if (close < 0) { malformed = true; break; }
    const raw = html.slice(open, close + 1);
    if (/^<!|^<\?/u.test(raw)) { cursor = close + 1; continue; }
    const tag = tagInfo(raw);
    if (!tag) { malformed = true; cursor = close + 1; continue; }

    if (skip.length) {
      if (!tag.closing && !tag.selfClosing && tag.name === skip.at(-1)) skip.push(tag.name);
      else if (tag.closing && tag.name === skip.at(-1)) skip.pop();
      cursor = close + 1;
      continue;
    }
    if (!tag.closing && (DROP_CONTENT.has(tag.name) || hiddenElement(tag.attributes))) {
      if (!tag.selfClosing) skip.push(tag.name);
      cursor = close + 1;
      continue;
    }
    if (tag.name === 'title') {
      if (!tag.closing) titleStart = output.length;
      else if (titleStart >= 0) {
        title = normalizeWhitespace(output.splice(titleStart).join('')) || null;
        titleStart = -1;
      }
    } else if (/^h[1-6]$/u.test(tag.name)) {
      if (!tag.closing) {
        append(`\n${'#'.repeat(Number(tag.name[1]))} `);
        headings.push(tag.name);
      } else if (headings.at(-1) === tag.name) {
        headings.pop();
        append('\n');
      }
    } else if (tag.name === 'li') append(tag.closing ? '\n' : '\n- ');
    else if (tag.name === 'pre') {
      if (tag.closing) { preDepth = Math.max(0, preDepth - 1); append('\n```\n'); }
      else { append('\n```\n'); preDepth += 1; }
    } else if (tag.name === 'code' && !tag.closing) append(preDepth ? '' : '`');
    else if (tag.name === 'code' && tag.closing) append(preDepth ? '' : '`');
    else if (tag.name === 'a') {
      if (!tag.closing) anchors.push({ start: output.length, href: hrefFrom(tag.attributes) });
      else {
        const anchor = anchors.pop();
        if (anchor) {
          const text = normalizeWhitespace(output.slice(anchor.start).join(''));
          if (text && anchor.href && links.length < MAX_LINKS) {
            const link = { text: boundedUtf8(text, 500).value, href: boundedUtf8(anchor.href, 2048).value };
            if (Buffer.byteLength(JSON.stringify([...links, link])) <= MAX_LINK_METADATA_BYTES) links.push(link);
          }
        }
      }
    } else if (tag.name === 'td' || tag.name === 'th') append(tag.closing ? ' | ' : '| ');
    else if (BLOCK_TAGS.has(tag.name)) append(tag.name === 'br' || tag.closing ? '\n' : '\n');
    cursor = close + 1;
  }
  if (skip.length || titleStart >= 0 || anchors.length || headings.length) malformed = true;
  const normalized = normalizeWhitespace(output.join(''));
  const bounded = boundedUtf8(normalized, maxOutputBytes);
  return {
    text: bounded.value,
    title,
    links,
    extractor: EXTRACTOR,
    fallbackReason: malformed ? 'malformed-html' : null,
    mimeType,
    charset,
    inputBytes,
    outputBytes: Buffer.byteLength(bounded.value),
    truncated: bounded.truncated,
  };
}
