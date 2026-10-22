// Fixed lifetime for persisted context payloads, independent of scope/session.
export const RETENTION_MS = 24 * 60 * 60 * 1000;

export function rejectCustomTtl(input) {
  if (Object.hasOwn(input, 'ttlMs')) throw new Error('ttlMs is no longer supported; context data expires after 24 hours.');
}
