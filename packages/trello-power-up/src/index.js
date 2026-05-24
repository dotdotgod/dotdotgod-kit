export const DOTDOTGOD_FIELD_NAME = 'dotdotgod-view';

export function parseDotdotgodViewPayload(text = '') {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return { ok: true, entries: [] };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return { ok: false, entries: [], error: 'Unsupported dotdotgod-view payload.' };
    return { ok: true, entries: parsed.entries.map(normalizeEntry) };
  } catch (error) {
    return { ok: false, entries: [], error: `Invalid dotdotgod-view JSON: ${error.message}` };
  }
}

function normalizeEntry(entry = {}) {
  return {
    repositoryKey: stringValue(entry.repositoryKey),
    repositoryLabel: stringValue(entry.repositoryLabel) || stringValue(entry.repositoryKey).split('/').filter(Boolean).at(-1) || '',
    docsPath: stringValue(entry.docsPath),
    githubUrl: stringValue(entry.githubUrl),
    trelloUrl: stringValue(entry.trelloUrl),
    title: stringValue(entry.title),
    summary: stringValue(entry.summary),
    traceabilityState: stringValue(entry.traceabilityState) || 'not_required',
    traceabilityDetails: Array.isArray(entry.traceabilityDetails) ? entry.traceabilityDetails.map(String) : [],
  };
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function linkHtml(url, label) {
  const safeUrl = escapeHtml(url);
  return safeUrl ? `<a href="${safeUrl}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label);
}

export function renderLinkedDocsHtml(entries = []) {
  if (entries.length === 0) return '<p class="meta">No linked dotdotgod docs yet.</p>';
  return entries.map((entry) => `
    <section class="entry">
      <div class="repo">${escapeHtml(entry.repositoryKey || entry.repositoryLabel || 'Unknown repository')}</div>
      ${entry.title ? `<div><strong>${escapeHtml(entry.title)}</strong></div>` : ''}
      ${entry.summary ? `<p>${escapeHtml(entry.summary)}</p>` : ''}
      <div>${linkHtml(entry.githubUrl, entry.docsPath || entry.githubUrl || 'GitHub document')}</div>
      <div class="meta">Traceability: ${escapeHtml(entry.traceabilityState)}</div>
      ${entry.traceabilityDetails.length ? `<ul class="meta">${entry.traceabilityDetails.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>` : ''}
    </section>
  `).join('');
}

export async function readDotdotgodEntries(t) {
  const [card, board] = await Promise.all([t.card('customFieldItems'), t.board('customFields')]);
  const field = (board.customFields ?? []).find((item) => item?.name === DOTDOTGOD_FIELD_NAME && item?.type === 'text');
  const item = (card.customFieldItems ?? []).find((customFieldItem) => customFieldItem?.idCustomField === field?.id);
  return parseDotdotgodViewPayload(item?.value?.text ?? '');
}

export async function renderPowerUpSection(t, documentRef = globalThis.document) {
  const target = documentRef?.getElementById?.('dotdotgod-view');
  if (!target) return;
  const parsed = await readDotdotgodEntries(t);
  target.innerHTML = parsed.ok ? renderLinkedDocsHtml(parsed.entries) : `<p class="meta">${escapeHtml(parsed.error)}</p>`;
  await t.sizeTo?.('#dotdotgod-view');
}

export function initializePowerUp(TrelloPowerUp = globalThis.TrelloPowerUp) {
  if (!TrelloPowerUp) return;
  if (globalThis.document?.getElementById?.('dotdotgod-view')) {
    renderPowerUpSection(TrelloPowerUp.iframe());
    return;
  }
  TrelloPowerUp.initialize({
    'card-back-section': (t) => ({
      title: 'dotdotgod linked docs',
      icon: './icon.svg',
      content: { type: 'iframe', url: t.signUrl('./section.html'), height: 180 },
    }),
  });
}

initializePowerUp();
