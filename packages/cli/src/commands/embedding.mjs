import { resolve } from 'node:path';
import { usage } from '../cli/usage.mjs';
import { resolveEmbeddingProfile } from '../query/embedding-config.mjs';
import { embeddingRuntimeStatus, installEmbeddingRuntime } from '../query/embedding-runtime.mjs';

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
  const resolved = resolveEmbeddingProfile(parsed.root, options);
  if (resolved.profile.provider !== 'local') {
    const result = { ok: true, command: `embedding ${parsed.action}`, provider: resolved.profile.provider, required: false, installed: false, installAvailable: false };
    console.log(parsed.json ? JSON.stringify(result, null, 2) : 'Local embedding runtime is not required for the configured remote provider.');
    return result;
  }
  if (parsed.action === 'install' && !parsed.confirm) usage('embedding install requires --confirm after user approval.', 'embedding install');
  const runtimeOptions = { home: options.home };
  const result = parsed.action === 'status' ? embeddingRuntimeStatus(runtimeOptions) : installEmbeddingRuntime({ ...runtimeOptions, confirm: true, spawnImpl: options.spawnImpl, npmCommand: options.npmCommand });
  const payload = { ...result, command: `embedding ${parsed.action}`, provider: 'local', required: true, ...(parsed.action === 'install' ? { disclosure: 'Installation uses network access and dependency install scripts; the configured model may download on first query.' } : {}) };
  console.log(parsed.json ? JSON.stringify(payload, null, 2) : payload.installed ? `Embedding runtime installed (${payload.packageVersion}).` : 'Embedding runtime is not installed.');
  return payload;
}
