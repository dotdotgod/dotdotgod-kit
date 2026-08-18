const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;

export function validateSessionId(value) {
  if (typeof value !== 'string' || !SESSION_ID.test(value)) {
    throw new TypeError('sessionId must be an opaque 1-128 character identifier using letters, digits, dot, underscore, tilde, or hyphen.');
  }
  return value;
}

export function resolveSessionId(value) {
  return value == null ? crypto.randomUUID() : validateSessionId(value);
}
