const DEFAULT_CHARS = 4000;
const DEFAULT_OVERLAP = 400;

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
