import { resolve } from 'node:path';
import { usage } from '../cli/usage.mjs';
import { resolveEmbeddingProfile } from '../query/embedding-config.mjs';
import { embeddingRuntimeRoot, embeddingRuntimeStatus, installEmbeddingRuntime, installEmbeddingRuntimeAsync, MASKED_EMBEDDING_RUNTIME_LOCATION } from '../query/embedding-runtime.mjs';
import { DotdotgodServiceError } from './map.mjs';

const disclosure = 'Installation uses network access and dependency install scripts; the configured model may download on first query.';

export function getEmbeddingStatus(root, options = {}) {
  options.signal?.throwIfAborted();
  let resolved;
  try { resolved = resolveEmbeddingProfile(root, options); }
  catch (error) { throw DotdotgodServiceError.from(error, 'EMBEDDING_STATUS_FAILED'); }
  if (!resolved.profile) return { ok: true, command: 'embedding status', provider: null, required: false, installed: false, installAvailable: false, source: 'not-configured' };
  if (resolved.profile.provider !== 'local') return { ok: true, command: 'embedding status', provider: resolved.profile.provider, required: false, installed: false, installAvailable: false };
  return { ...embeddingRuntimeStatus(options), location: MASKED_EMBEDDING_RUNTIME_LOCATION, command: 'embedding status', provider: 'local', required: true };
}

function installProfile(status) {
  if (!status.provider) throw new DotdotgodServiceError('EMBEDDING_PROFILE_REQUIRED', 'Configure an explicit local embedding profile before installing its runtime.');
  return { ...status, command: 'embedding install' };
}

export async function installProjectEmbedding(root, options) {
  const status = installProfile(getEmbeddingStatus(root, options));
  if (!status.required) return status;
  return { ...await installEmbeddingRuntimeAsync(options), provider: 'local', required: true, disclosure };
}

function parse(argv) {
  const [action = 'status', ...rest] = argv;
  let root = '.'; let json = false; let confirm = false;
  for (const arg of rest) {
    if (arg === '--json') json = true;
    else if (arg === '--confirm') confirm = true;
    else if (!arg.startsWith('-') && root === '.') root = arg;
    else usage(`Unknown embedding option: ${arg}`, `embedding ${action}`);
  }
  return { action, root: resolve(root), json, confirm };
}

export function runEmbedding(argv, options = {}) {
  const parsed = parse(argv);
  if (!['status', 'install'].includes(parsed.action)) usage(`Unknown embedding command: ${parsed.action}`, 'embedding');
  const status = getEmbeddingStatus(parsed.root, options);
  let payload = parsed.action === 'install' ? installProfile(status) : status;
  if (status.required) {
    if (parsed.action === 'install' && !parsed.confirm) usage('embedding install requires --confirm after user approval.', 'embedding install');
    payload = parsed.action === 'status'
      ? { ...status, location: embeddingRuntimeRoot(options) }
      : { ...installEmbeddingRuntime({ ...options, confirm: parsed.confirm }), provider: 'local', required: true, disclosure };
  }
  const message = !payload.provider ? 'Embedding is not configured; keyword search is used.'
    : !payload.required ? 'Local embedding runtime is not required for the configured remote provider.'
    : payload.installed ? `Embedding runtime installed (${payload.packageVersion}).` : 'Embedding runtime is not installed.';
  console.log(parsed.json ? JSON.stringify(payload, null, 2) : message);
  return payload;
}
