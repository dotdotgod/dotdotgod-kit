export const DEFAULT_DOTDOTGOD_CUSTOM_FIELD_NAME = 'dotdotgod-view';

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function dotdotgodCustomFieldName({ env = process.env, name = '' } = {}) {
  return cleanString(name) || cleanString(env.DOTDOTGOD_TRELLO_CUSTOM_FIELD_NAME) || DEFAULT_DOTDOTGOD_CUSTOM_FIELD_NAME;
}

export function buildLinkedDocsCustomFieldData({ docsPath, githubUrl, trelloUrl, repositoryKey, repositoryLabel, title, summary, traceabilityState, traceabilityDetails = [] } = {}) {
  return {
    repositoryKey: cleanString(repositoryKey),
    repositoryLabel: cleanString(repositoryLabel) || cleanString(repositoryKey).split('/').filter(Boolean).at(-1) || '',
    docsPath: cleanString(docsPath),
    githubUrl: cleanString(githubUrl),
    trelloUrl: cleanString(trelloUrl),
    title: cleanString(title),
    summary: cleanString(summary),
    traceabilityState: cleanString(traceabilityState) || 'not_required',
    traceabilityDetails: Array.isArray(traceabilityDetails) ? traceabilityDetails.map((item) => String(item)) : [],
  };
}

function normalizeEntry(entry = {}) {
  return buildLinkedDocsCustomFieldData(entry);
}

export function serializeLinkedDocsCustomFieldPayload(entries = []) {
  return JSON.stringify({ version: 1, entries: entries.map(normalizeEntry) });
}

export function parseLinkedDocsCustomFieldPayload(text = '') {
  const value = cleanString(text);
  if (!value) return { ok: true, entries: [] };
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'TRELLO_CUSTOM_FIELD_INVALID',
        message: `dotdotgod custom field contains invalid JSON. Cause: ${error.message}. Fix: clear the custom field or restore a valid dotdotgod linked-docs payload, then retry sync.`,
      },
    };
  }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    return {
      ok: false,
      error: {
        code: 'TRELLO_CUSTOM_FIELD_INVALID',
        message: 'dotdotgod custom field has an unsupported shape. Fix: clear the custom field or restore a version 1 linked-docs payload with an entries array, then retry sync.',
      },
    };
  }
  const entries = parsed.entries.map(normalizeEntry);
  const keys = entries.map((entry) => entry.repositoryKey).filter(Boolean);
  if (keys.length !== new Set(keys).size) {
    return {
      ok: false,
      error: {
        code: 'TRELLO_CUSTOM_FIELD_DUPLICATE_REPOSITORY',
        message: 'dotdotgod custom field contains duplicate repository entries. Fix: keep one entry per repository key, then retry sync.',
      },
    };
  }
  return { ok: true, entries };
}

export function mergeLinkedDocsCustomFieldValue(existingText = '', entry = {}) {
  const current = normalizeEntry(entry);
  if (!current.repositoryKey) {
    return {
      ok: false,
      error: {
        code: 'TRELLO_CUSTOM_FIELD_REPOSITORY_MISSING',
        message: 'Cannot update dotdotgod custom field without a repository key. Fix: run from a trusted GitHub Actions repository or configure repository metadata, then retry sync.',
      },
    };
  }
  const parsed = parseLinkedDocsCustomFieldPayload(existingText);
  if (!parsed.ok) return parsed;
  const entries = [...parsed.entries];
  const index = entries.findIndex((item) => item.repositoryKey === current.repositoryKey);
  let action = 'create-payload';
  if (index >= 0) {
    const before = JSON.stringify(entries[index]);
    const after = JSON.stringify(current);
    action = before === after ? 'unchanged-entry' : 'replace-entry';
    entries[index] = current;
  } else if (entries.length > 0) {
    action = 'append-entry';
    entries.push(current);
  } else {
    entries.push(current);
  }
  const text = serializeLinkedDocsCustomFieldPayload(entries);
  const status = cleanString(existingText) === text ? 'unchanged' : 'written';
  return { ok: true, status, action: status === 'unchanged' ? 'unchanged-entry' : action, text, entries, preservedRepositoryEntries: entries.filter((item) => item.repositoryKey !== current.repositoryKey).length };
}

export function customFieldTextValue(card = {}, idCustomField = '') {
  const item = Array.isArray(card.customFieldItems) ? card.customFieldItems.find((fieldItem) => fieldItem?.idCustomField === idCustomField) : null;
  return typeof item?.value?.text === 'string' ? item.value.text : '';
}
