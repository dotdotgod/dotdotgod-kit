import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDocumentationMap, DotdotgodServiceError } from '../commands/map.mjs';
import { buildDecisionDocsMap } from '../memory/documentation-map.mjs';
import { queryProject } from '../commands/query.mjs';
import { expandReferences } from '../reference/resolve.mjs';
import { getEmbeddingStatus, installProjectEmbedding } from '../commands/embedding.mjs';
import { computeGraphImpact } from '../commands/graph.mjs';
import { formatCompactImpactOutput } from '../impact/format.mjs';
import { initializeProject } from '../init.mjs';

function embeddingRuntimeRecovery() {
  return {
    code: 'EMBEDDING_RUNTIME_MISSING',
    message: 'Semantic vectors need an optional runtime; continue with keyword/map retrieval or ask before installation.',
    recovery: { kind: 'embedding-runtime-install', requiresConfirmation: true, statusTool: 'embedding_status', installTool: 'embedding_install', cliCommand: 'dotdotgod embedding install --confirm' },
  };
}

export async function projectLoad(input) {
  return loadProject(input, input.readOnly || input.maxDepth == null || Number.isInteger(input.maxDepth) && input.maxDepth > 0);
}

export async function loadProject(input, validDepth = true) {
  const root = resolve(input.root || process.cwd());
  const focus = input.focus?.trim() ?? '';
  const { readOnly, signal, refs } = input;
  signal?.throwIfAborted();
  let documentationMap;
  try {
    if (!validDepth) throw new DotdotgodServiceError('INVALID_DEPTH', '--depth requires a positive integer.');
    documentationMap = readOnly ? buildDecisionDocsMap(root)
      : buildDocumentationMap(root, { depth: input.maxDepth ?? (focus ? 3 : 5), signal });
    if (!documentationMap.ok) throw new Error('MAP_UNAVAILABLE');
  } catch {
    signal?.throwIfAborted();
    return { ok: false, root, focus, documentationTree: [], query: null,
      mapUnavailable: { code: 'MAP_UNAVAILABLE', message: 'Configured documentation map is unavailable; inspect project settings and README indexes with host tools. Do not treat this as an empty project map.' } };
  }
  const tree = documentationMap.paths?.length ? documentationMap.tree.split('\n') : [];
  let query = null;
  let queryUnavailable;
  let vectorUnavailable;
  if (focus) {
    try {
      query = await queryProject(root, focus, { limit: Math.min(input.limit ?? 30, 30), signal, cwd: root, readOnly, scope: readOnly ? 'shared' : 'all' });
      if (query.warnings?.some((warning) => warning.includes('Optional local embedding runtime is not installed'))) vectorUnavailable = embeddingRuntimeRecovery();
    } catch (error) {
      signal?.throwIfAborted();
      if (readOnly) throw error;
      const missingRuntime = String(error?.message ?? error).includes('Optional local embedding runtime is not installed');
      queryUnavailable = missingRuntime ? embeddingRuntimeRecovery() : {
        code: 'QUERY_UNAVAILABLE',
        message: 'Semantic project query is unavailable; continue with the documentation map and targeted reads.',
      };
    }
  }
  let references;
  if (readOnly && refs?.length) {
    references = expandReferences(root, refs.map((ref) => `[[${ref}]]`).join(' '), { readOnly: true, scope: 'shared', signal }).refs;
  }
  signal?.throwIfAborted();
  return { ok: true, root, focus, documentationTree: tree, documentationRoot: documentationMap.documentationRoot, query, ...(references ? { references } : {}), ...(queryUnavailable ? { queryUnavailable } : {}), ...(vectorUnavailable ? { vectorUnavailable } : {}) };
}

export async function projectEmbeddingStatus(input = {}) {
  const root = resolve(input.root || process.cwd());
  return getEmbeddingStatus(root, { signal: input.signal });
}

export async function projectEmbeddingInstall(input = {}) {
  if (input.confirm !== true) throw new DotdotgodServiceError('CONFIRMATION_REQUIRED', 'confirm: true is required after explicit user approval.');
  const root = resolve(input.root || process.cwd());
  return installProjectEmbedding(root, { confirm: input.confirm, signal: input.signal });
}

export async function reviewProjectImpact(root, paths, signal) {
  signal?.throwIfAborted();
  if (paths.some((path) => typeof path === 'string' && path.includes('\u0000'))) throw new DotdotgodServiceError('INVALID_CHANGED_PATH', 'Changed paths must not contain NUL characters.');
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new DotdotgodServiceError('ROOT_NOT_FOUND', `Project root not found: ${root}`);
  const result = await computeGraphImpact(root, paths, { compact: true, signal, cwd: root });
  signal?.throwIfAborted();
  return { ok: true, summary: formatCompactImpactOutput(result, result.impact).trim() };
}

export async function projectImpact(input) {
  const root = resolve(input.root || process.cwd());
  const paths = [...new Set(input.paths ?? [])];
  if (paths.length === 0) throw new DotdotgodServiceError('MISSING_CHANGED', 'paths must contain at least one changed path');
  if (paths.length > 20) throw new DotdotgodServiceError('TOO_MANY_CHANGED', 'paths is limited to 20 entries per call');
  return reviewProjectImpact(root, paths, input.signal);
}

export async function projectInitialize(input) {
  const root = resolve(input.root || process.cwd());
  const dryRun = input.dryRun !== false;
  if (!dryRun && input.confirmWrite !== true) throw new DotdotgodServiceError('CONFIRMATION_REQUIRED', 'confirmWrite: true is required when dryRun is false');
  return initializeProject(root, { dryRun, projectName: input.projectName || undefined, template: input.template || undefined, signal: input.signal });
}
