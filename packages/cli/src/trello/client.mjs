const TRELLO_API_BASE = 'https://api.trello.com';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function credentialError(message) {
  return {
    ok: false,
    error: {
      code: 'TRELLO_CREDENTIALS_MISSING',
      message: `${message} Fix: configure GitHub Actions secrets or environment variables TRELLO_API_KEY and TRELLO_TOKEN, then retry from the trusted Trello sync workflow.`,
    },
  };
}

export function resolveTrelloCredentials({ env = process.env } = {}) {
  const apiKey = clean(env.TRELLO_API_KEY);
  const token = clean(env.TRELLO_TOKEN);
  if (!apiKey || !token) return credentialError('Trello write mode credentials are missing or empty.');
  return { ok: true, credentials: { apiKey, token, source: 'env' } };
}

function trelloApiError({ status = 0, statusText = '', body = '', retryAfter = null, operation = 'Trello API request', idOrShortLink = '', redact = (value) => value } = {}) {
  const bodyText = redact(typeof body === 'string' ? body : JSON.stringify(body ?? ''));
  const code = bodyText.includes('API_TOKEN_LIMIT_EXCEEDED') ? 'API_TOKEN_LIMIT_EXCEEDED' : bodyText.includes('API_KEY_LIMIT_EXCEEDED') ? 'API_KEY_LIMIT_EXCEEDED' : 'TRELLO_API_FAILED';
  const rateLimitGuidance = status === 429 ? ` Wait and retry${retryAfter ? ` after ${retryAfter} seconds` : ''}.` : '';
  return {
    code,
    status,
    retryAfter,
    message: `${operation} failed${idOrShortLink ? ` for Trello card ${idOrShortLink}` : ''}${status ? ` with HTTP ${status}${statusText ? ` ${statusText}` : ''}` : ''}${bodyText ? `: ${bodyText}` : ''}. Fix:${rateLimitGuidance || ' check card access, credentials, and Trello response details, then retry.'}`,
  };
}

export function createTrelloClient({ credentials, fetchImpl = globalThis.fetch, baseUrl = TRELLO_API_BASE } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Trello client requires a fetch implementation.');
  const auth = { key: credentials?.apiKey ?? '', token: credentials?.token ?? '' };
  const redact = (value = '') => String(value).split(auth.key).join('[REDACTED_API_KEY]').split(auth.token).join('[REDACTED_TOKEN]');

  async function request(path, { method = 'GET', params = {}, body = null, operation, idOrShortLink } = {}) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries({ ...params, ...auth })) url.searchParams.set(key, value);
    const init = { method };
    if (body !== null) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      throw trelloApiError({ operation, idOrShortLink, body: error?.message ?? 'network error', redact });
    }
    const bodyText = await response.text();
    if (!response.ok) {
      throw trelloApiError({ status: response.status, statusText: response.statusText, body: bodyText, retryAfter: response.headers?.get?.('Retry-After') ?? null, operation, idOrShortLink, redact });
    }
    if (!bodyText) return null;
    try {
      return JSON.parse(bodyText);
    } catch {
      throw trelloApiError({ status: response.status, statusText: response.statusText, body: 'Malformed JSON response', operation, idOrShortLink, redact });
    }
  }

  return {
    async getCard(idOrShortLink) {
      const card = await request(`/1/cards/${encodeURIComponent(idOrShortLink)}`, { params: { fields: 'id,idBoard,desc', customFieldItems: 'true' }, operation: 'Card lookup', idOrShortLink });
      if (!card || typeof card.id !== 'string' || typeof card.idBoard !== 'string') throw trelloApiError({ body: 'Malformed card response', operation: 'Card lookup', idOrShortLink, redact });
      return card;
    },
    async listAttachments(idOrShortLink) {
      const attachments = await request(`/1/cards/${encodeURIComponent(idOrShortLink)}/attachments`, { operation: 'Attachment lookup', idOrShortLink });
      if (!Array.isArray(attachments)) throw trelloApiError({ body: 'Malformed attachments response', operation: 'Attachment lookup', idOrShortLink, redact });
      return attachments;
    },
    async createAttachment(idOrShortLink, githubUrl) {
      return request(`/1/cards/${encodeURIComponent(idOrShortLink)}/attachments`, { method: 'POST', params: { url: githubUrl }, operation: 'Attachment creation', idOrShortLink });
    },
    async listCustomFields(idBoard) {
      const fields = await request(`/1/boards/${encodeURIComponent(idBoard)}/customFields`, { operation: 'Custom field lookup' });
      if (!Array.isArray(fields)) throw trelloApiError({ body: 'Malformed custom fields response', operation: 'Custom field lookup', redact });
      return fields;
    },
    async createCustomField(idBoard, { name, type = 'text' } = {}) {
      return request('/1/customFields', { method: 'POST', params: { idModel: idBoard, modelType: 'board', name, type, pos: 'bottom', display_cardFront: 'false' }, operation: 'Custom field creation' });
    },
    async updateCardCustomFieldText(idCard, idCustomField, text) {
      return request(`/1/cards/${encodeURIComponent(idCard)}/customField/${encodeURIComponent(idCustomField)}/item`, { method: 'PUT', body: { value: { text } }, operation: 'Custom field update', idOrShortLink: idCard });
    },
  };
}
