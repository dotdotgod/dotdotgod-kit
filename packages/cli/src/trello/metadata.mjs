const TRELLO_KEYS = new Set(['trelloUrl', 'trelloShortLink', 'trelloCardId']);

export function parseFrontmatter(content = '') {
  if (!String(content).startsWith('---\n')) return { data: {}, errors: [] };
  const end = String(content).indexOf('\n---', 4);
  if (end === -1) return { data: {}, errors: [{ code: 'TRELLO_FRONTMATTER_INVALID', message: 'Frontmatter start marker is missing a closing marker.' }] };
  const raw = String(content).slice(4, end).split('\n');
  const data = {};
  const errors = [];
  for (const [index, line] of raw.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (Object.hasOwn(data, key)) errors.push({ code: 'TRELLO_FRONTMATTER_DUPLICATE_KEY', message: `Duplicate frontmatter key: ${key}.`, line: index + 2 });
    data[key] = value;
  }
  return { data, errors };
}

export function extractTrelloShortLink(trelloUrl = '') {
  let url;
  try {
    url = new URL(trelloUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'trello.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'c' || !parts[1] || parts.length > 3) return null;
  return parts[1];
}

export function parseTrelloMetadata(content = '') {
  const { data, errors } = parseFrontmatter(content);
  const warnings = [];
  const unsupported = [...TRELLO_KEYS].filter((key) => key !== 'trelloUrl' && Object.hasOwn(data, key));
  const trelloUrl = typeof data.trelloUrl === 'string' ? data.trelloUrl.trim() : '';
  if (unsupported.length > 0) {
    warnings.push({ code: 'TRELLO_UNSUPPORTED_METADATA', message: `Unsupported Trello metadata ignored in Phase 1: ${unsupported.join(', ')}. Use trelloUrl only.` });
  }
  if (!trelloUrl) {
    errors.push({ code: 'TRELLO_METADATA_MISSING_URL', message: 'Missing required frontmatter field: trelloUrl.' });
    return { ok: false, trelloUrl: '', shortLink: '', warnings, errors };
  }
  const shortLink = extractTrelloShortLink(trelloUrl);
  if (!shortLink) errors.push({ code: 'TRELLO_METADATA_INVALID_URL', message: 'trelloUrl must match https://trello.com/c/<shortLink>/ or https://trello.com/c/<shortLink>/<slug>.' });
  return { ok: errors.length === 0, trelloUrl, shortLink: shortLink ?? '', warnings, errors };
}
