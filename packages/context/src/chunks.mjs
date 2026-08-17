const DEFAULT_CHARS = 4000;
const DEFAULT_OVERLAP = 400;
const DEFAULT_BYTES = 16_000;

export function normalizeText(value) {
  return String(value ?? '').replace(/\0/g, '\uFFFD').replace(/\r\n?/g, '\n');
}

export function chunkText(value, options = {}) {
  const text = normalizeText(value);
  const maxChars = Math.max(512, options.maxChars ?? DEFAULT_CHARS);
  const overlap = Math.min(Math.max(0, options.overlap ?? DEFAULT_OVERLAP), Math.floor(maxChars / 3));
  if (!text) return [];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n\n', end), text.lastIndexOf('\n', end));
      if (boundary > start + Math.floor(maxChars / 2)) end = boundary + 1;
    }
    chunks.push({ text: text.slice(start, end), start, end });
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function byteLimit(options) {
  return Math.max(64, Number.isFinite(options.maxBytes) ? Math.floor(options.maxBytes) : DEFAULT_BYTES);
}

function splitUtf8(value, maxBytes) {
  const text = String(value ?? '');
  if (!text) return [];
  const parts = [];
  let part = '';
  let bytes = 0;
  for (const point of text) {
    const size = Buffer.byteLength(point);
    if (part && bytes + size > maxBytes) {
      parts.push(part);
      part = '';
      bytes = 0;
    }
    if (size > maxBytes) throw new Error('Chunk byte limit cannot contain one Unicode code point.');
    part += point;
    bytes += size;
  }
  if (part) parts.push(part);
  return parts;
}

function boundedChunks(text, metadata, maxBytes) {
  const parts = splitUtf8(text, maxBytes);
  return parts.map((part, index) => ({
    text: part,
    metadata: {
      ...metadata,
      ...(parts.length > 1 ? { continuation: index + 1, continuations: parts.length } : {}),
    },
  }));
}

function markdownBlocks(text) {
  const lines = text.split(/(?<=\n)/u);
  const headings = [];
  const blocks = [];
  let prose = '';
  let proseHeadings = [];
  let fence = null;

  const flushProse = () => {
    if (!prose) return;
    blocks.push({ text: prose, headings: proseHeadings, blockType: 'prose' });
    prose = '';
  };

  for (const line of lines) {
    const heading = !fence && /^(#{1,6})\s+(.+?)(?:\n)?$/u.exec(line);
    const marker = /^\s*(`{3,}|~{3,})(.*?)(?:\n)?$/u.exec(line);
    if (fence) {
      fence.text += line;
      if (marker && marker[1][0] === fence.marker[0] && marker[1].length >= fence.marker.length) {
        blocks.push({ text: fence.text, headings: fence.headings, blockType: 'fence', language: fence.language });
        fence = null;
      }
      continue;
    }
    if (heading) {
      flushProse();
      const level = heading[1].length;
      headings.splice(level - 1);
      headings[level - 1] = heading[2].trim();
      while (headings.length && headings.at(-1) == null) headings.pop();
      proseHeadings = headings.filter(Boolean);
      prose = line;
      continue;
    }
    if (marker) {
      flushProse();
      fence = { marker: marker[1], language: marker[2].trim() || null, text: line, headings: headings.filter(Boolean) };
      continue;
    }
    if (!prose) proseHeadings = headings.filter(Boolean);
    prose += line;
    if (/^\s*$/u.test(line)) flushProse();
  }
  flushProse();
  if (fence) blocks.push({ text: fence.text, headings: fence.headings, blockType: 'fence', language: fence.language, unterminated: true });
  return blocks;
}

export function chunkMarkdown(value, options = {}) {
  const text = normalizeText(value);
  if (!text) return [];
  const maxBytes = byteLimit(options);
  const chunks = [];
  for (const block of markdownBlocks(text)) {
    const title = block.headings.join(' > ') || null;
    chunks.push(...boundedChunks(block.text, {
      format: 'markdown',
      blockType: block.blockType,
      headings: block.headings,
      title,
      ...(block.language ? { language: block.language } : {}),
      ...(block.unterminated ? { unterminated: true } : {}),
    }, maxBytes));
  }
  return chunks.map((chunk, ordinal) => ({ ...chunk, ordinal }));
}

function jsonPathSegment(key, array) {
  if (array) return `[${key}]`;
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function jsonEntries(value, path, depth, maxDepth, entries) {
  if (depth > maxDepth) throw new Error(`JSON nesting exceeds maximum depth: ${maxDepth}`);
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      if (value.length === 0) entries.push({ path, value });
      value.forEach((item, index) => jsonEntries(item, `${path}${jsonPathSegment(index, true)}`, depth + 1, maxDepth, entries));
      return;
    }
    const keys = Object.keys(value).sort();
    if (keys.length === 0) entries.push({ path, value });
    for (const key of keys) jsonEntries(value[key], `${path}${jsonPathSegment(key, false)}`, depth + 1, maxDepth, entries);
    return;
  }
  entries.push({ path, value });
}

export function chunkJson(value, options = {}) {
  const text = normalizeText(value);
  if (!text) return [];
  const maxBytes = byteLimit(options);
  const maxDepth = Math.max(1, Math.floor(options.maxDepth ?? 64));
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return boundedChunks(text, { format: 'text', extractor: 'json-fallback', title: null }, maxBytes)
      .map((chunk, ordinal) => ({ ...chunk, ordinal }));
  }
  const entries = [];
  jsonEntries(parsed, '$', 0, maxDepth, entries);
  const chunks = [];
  for (const entry of entries) {
    const rendered = `${entry.path}: ${JSON.stringify(entry.value)}`;
    chunks.push(...boundedChunks(rendered, {
      format: 'json',
      path: entry.path,
      title: entry.path,
      valueType: entry.value === null ? 'null' : Array.isArray(entry.value) ? 'array' : typeof entry.value,
    }, maxBytes));
  }
  return chunks.map((chunk, ordinal) => ({ ...chunk, ordinal }));
}

export function chunkContent(value, options = {}) {
  const format = String(options.format ?? options.contentType ?? 'text').toLowerCase();
  if (format === 'markdown' || format === 'md' || format.includes('markdown')) return chunkMarkdown(value, options);
  if (format === 'json' || format.includes('/json') || format.endsWith('+json')) return chunkJson(value, options);
  const maxBytes = byteLimit(options);
  return boundedChunks(normalizeText(value), { format: 'text', title: null }, maxBytes)
    .map((chunk, ordinal) => ({ ...chunk, ordinal }));
}

export function excerpt(text, query, maxChars = 1200) {
  const normalized = normalizeText(text);
  if (normalized.length <= maxChars) return normalized;
  const terms = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const lower = normalized.toLowerCase();
  const positions = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
  const center = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, center - Math.floor(maxChars / 3));
  const end = Math.min(normalized.length, start + maxChars);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`;
}
