import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rel } from '../common/paths.mjs';
import { isKebabCase } from '../docs/markdown.mjs';

const MEMORY_CONFIG_FILES = ['dotdotgod.config.json', '.dotdotgodrc.json'];
const MEMORY_SCOPES = new Set(['shared', 'local']);
const MEMORY_FRESHNESS = new Set(['fresh', 'stale']);
export const DEFAULT_TRACEABILITY_POLICY = {
  required: ['docs/spec/**'],
  exclude: ['**/README.md'],
};
export const DEFAULT_VALIDATION_POLICY = {
  markdown: { maxLines: 200, maxChars: 10000, exclude: [] },
};
export const DEFAULT_IMPACT_RANKING_POLICY = {
  preset: 'balanced',
  weights: { ppr: 40, traceability: 30, memoryPolicy: 10, verification: 15, proximity: 10, semantic: 10, freshness: 5, archivePenalty: -25 },
  ppr: { enabled: true, damping: 0.85, iterations: 20, tolerance: 0.000001 },
  relationWeights: {
    implemented_by: 4,
    verified_by: 4,
    related_doc: 3,
    verification_command: 3,
    links_to: 2,
    belongs_to_area: 2,
    semantic_similarity: 2,
    mentions_package: 1,
  },
  traceabilityBoosts: { implemented_by: 30, 'incoming:implemented_by': 30, verified_by: 25, 'incoming:verified_by': 25, verification_command: 15, 'incoming:verification_command': 15, related_doc: 12, 'incoming:related_doc': 12 },
  verificationBoosts: { verified_by: 15, 'incoming:verified_by': 15, verification_command: 12, 'incoming:verification_command': 12 },
  semanticBoosts: { semantic_similarity: 8, 'incoming:semantic_similarity': 8, mentions_package: 4, 'incoming:mentions_package': 4 },
  proximityBoosts: { links_to: 6, 'incoming:links_to': 6, routes_to: 5, 'incoming:routes_to': 5 },
  semantic: { enabled: true, threshold: 0.5, topKPerFile: 5, includeArchiveBodies: false, signals: ['path', 'filename', 'heading', 'package'] },
};
const IMPACT_RANKING_PRESETS = {
  balanced: {},
  'docs-first': { weights: { ppr: 35, traceability: 35, memoryPolicy: 15, verification: 15, proximity: 5, semantic: 8, freshness: 5, archivePenalty: -30 } },
  'code-proximity': { weights: { ppr: 45, traceability: 20, memoryPolicy: 8, verification: 12, proximity: 20, semantic: 8, freshness: 3, archivePenalty: -25 } },
  'test-focused': { weights: { ppr: 35, traceability: 25, memoryPolicy: 8, verification: 25, proximity: 10, semantic: 7, freshness: 5, archivePenalty: -25 } },
  'archive-aware': { weights: { ppr: 35, traceability: 25, memoryPolicy: 10, verification: 15, proximity: 10, semantic: 8, freshness: 3, archivePenalty: -10 } },
};
export const SEMANTIC_RELATIONS = new Set(['semantic_similarity', 'mentions_package']);
const IMPACT_RANKING_WEIGHT_KEYS = new Set(['ppr', 'traceability', 'memoryPolicy', 'verification', 'proximity', 'semantic', 'freshness', 'archivePenalty']);
const IMPACT_RANKING_RELATION_KEYS = new Set(['implemented_by', 'verified_by', 'related_doc', 'verification_command', 'links_to', 'belongs_to_area', 'semantic_similarity', 'mentions_package']);
const IMPACT_RANKING_REASON_KEYS = new Set(['implemented_by', 'incoming:implemented_by', 'verified_by', 'incoming:verified_by', 'verification_command', 'incoming:verification_command', 'related_doc', 'incoming:related_doc', 'semantic_similarity', 'incoming:semantic_similarity', 'mentions_package', 'incoming:mentions_package', 'links_to', 'incoming:links_to', 'routes_to', 'incoming:routes_to']);
const SEMANTIC_SIGNAL_KEYS = new Set(['path', 'filename', 'heading', 'package']);
const DEFAULT_FUZZY_LOW_SIGNAL_TERMS = [
  'a', 'an', 'and', 'are', 'as', 'by', 'docs', 'document', 'for', 'from', 'it', 'of', 'on', 'plan', 'test', 'the', 'to', 'update', 'version', 'with',
  '계획', '문서', '수정', '업데이트', '버전', '정보', '확인', '테스트',
];
const DEFAULT_MEMORY_AREAS = [
  { id: 'rules', label: 'Agent Rules', paths: ['AGENTS.md'], scope: 'shared', freshness: 'fresh', role: 'agent-working-rules', priority: 100, includeBodiesByDefault: true },
  { id: 'agent-entrypoint', label: 'Agent Entrypoints', paths: ['CLAUDE.md', 'CODEX.md'], scope: 'shared', freshness: 'fresh', role: 'agent-specific-entrypoint', priority: 85, includeBodiesByDefault: true },
  { id: 'project-overview', label: 'Project Overview', paths: ['README.md'], scope: 'shared', freshness: 'fresh', role: 'project-map', priority: 85, includeBodiesByDefault: true },
  { id: 'docs-index', label: 'Docs Index', paths: ['docs/README.md'], scope: 'shared', freshness: 'fresh', role: 'documentation-routing-map', priority: 90, includeBodiesByDefault: true },
  { id: 'spec', label: 'Product Specs', paths: ['docs/spec/**'], scope: 'shared', freshness: 'fresh', role: 'behavior-truth', priority: 80, includeBodiesByDefault: true },
  { id: 'architecture', label: 'Architecture', paths: ['docs/arch/**'], scope: 'shared', freshness: 'fresh', role: 'architecture-rationale', priority: 75, includeBodiesByDefault: true },
  { id: 'test', label: 'Tests', paths: ['docs/test/**'], scope: 'shared', freshness: 'fresh', role: 'verification-knowledge', priority: 70, includeBodiesByDefault: true },
  { id: 'active-plan', label: 'Active Plans', paths: ['docs/plan/**'], scope: 'local', freshness: 'fresh', role: 'active-task-intent', priority: 95, includeBodiesByDefault: true },
  { id: 'archive-map', label: 'Archive Map', paths: ['docs/archive/README.md'], scope: 'local', freshness: 'stale', role: 'historical-memory-map', priority: 65, includeBodiesByDefault: true },
  { id: 'archive-body', label: 'Archive Body', paths: ['docs/archive/**'], excludePaths: ['docs/archive/README.md'], scope: 'local', freshness: 'stale', role: 'historical-memory-body', priority: 20, includeBodiesByDefault: false },
];

function cloneArea(area) {
  return {
    ...area,
    paths: [...(area.paths ?? [])],
    excludePaths: [...(area.excludePaths ?? [])],
  };
}

export function cloneTraceabilityPolicy(policy = DEFAULT_TRACEABILITY_POLICY) {
  return {
    required: [...(policy.required ?? [])],
    exclude: [...(policy.exclude ?? [])],
  };
}

export function cloneValidationPolicy(policy = DEFAULT_VALIDATION_POLICY) {
  return {
    markdown: {
      maxLines: policy.markdown?.maxLines ?? DEFAULT_VALIDATION_POLICY.markdown.maxLines,
      maxChars: policy.markdown?.maxChars ?? DEFAULT_VALIDATION_POLICY.markdown.maxChars,
      exclude: [...(policy.markdown?.exclude ?? [])],
    },
  };
}

export function cloneImpactRankingPolicy(policy = DEFAULT_IMPACT_RANKING_POLICY) {
  return {
    preset: policy.preset ?? 'balanced',
    weights: { ...DEFAULT_IMPACT_RANKING_POLICY.weights, ...(policy.weights ?? {}) },
    ppr: { ...DEFAULT_IMPACT_RANKING_POLICY.ppr, ...(policy.ppr ?? {}) },
    relationWeights: { ...DEFAULT_IMPACT_RANKING_POLICY.relationWeights, ...(policy.relationWeights ?? {}) },
    traceabilityBoosts: { ...DEFAULT_IMPACT_RANKING_POLICY.traceabilityBoosts, ...(policy.traceabilityBoosts ?? {}) },
    verificationBoosts: { ...DEFAULT_IMPACT_RANKING_POLICY.verificationBoosts, ...(policy.verificationBoosts ?? {}) },
    semanticBoosts: { ...DEFAULT_IMPACT_RANKING_POLICY.semanticBoosts, ...(policy.semanticBoosts ?? {}) },
    proximityBoosts: { ...DEFAULT_IMPACT_RANKING_POLICY.proximityBoosts, ...(policy.proximityBoosts ?? {}) },
    semantic: { ...DEFAULT_IMPACT_RANKING_POLICY.semantic, ...(policy.semantic ?? {}), signals: [...(policy.semantic?.signals ?? DEFAULT_IMPACT_RANKING_POLICY.semantic.signals)] },
  };
}

export function normalizeLowSignalTerm(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniqueNormalizedTerms(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeLowSignalTerm).filter(Boolean))];
}

export function cloneReferenceExpansionPolicy(policy = {}) {
  const lowSignal = policy.fuzzy?.lowSignal ?? {};
  const defaults = uniqueNormalizedTerms(lowSignal.defaults ?? DEFAULT_FUZZY_LOW_SIGNAL_TERMS);
  const add = uniqueNormalizedTerms(lowSignal.add ?? []);
  const remove = uniqueNormalizedTerms(lowSignal.remove ?? []);
  const terms = new Set(defaults);
  for (const term of remove) terms.delete(term);
  for (const term of add) terms.add(term);
  return { fuzzy: { lowSignal: { defaults, add, remove, terms: [...terms].sort() } } };
}

function normalizeReferenceExpansionPolicy(raw) {
  const lowSignal = raw?.fuzzy?.lowSignal ?? {};
  return cloneReferenceExpansionPolicy({ fuzzy: { lowSignal: { add: lowSignal.add, remove: lowSignal.remove } } });
}

function normalizeImpactRankingPolicy(raw) {
  const presetName = typeof raw?.preset === 'string' ? raw.preset : 'balanced';
  const preset = IMPACT_RANKING_PRESETS[presetName] ?? IMPACT_RANKING_PRESETS.balanced;
  return cloneImpactRankingPolicy({ ...preset, ...raw, preset: presetName, weights: { ...(preset.weights ?? {}), ...(raw?.weights ?? {}) }, ppr: { ...(preset.ppr ?? {}), ...(raw?.ppr ?? {}) }, semantic: { ...(preset.semantic ?? {}), ...(raw?.semantic ?? {}) } });
}

export function defaultMemoryConfig() {
  return { source: 'default', areas: DEFAULT_MEMORY_AREAS.map(cloneArea), traceability: cloneTraceabilityPolicy(), validation: cloneValidationPolicy(), impactRanking: cloneImpactRankingPolicy(), referenceExpansion: cloneReferenceExpansionPolicy() };
}

function normalizePathPattern(value = '') {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$|^\/+/, '');
}

function isValidPathPattern(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = normalizePathPattern(value);
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') return false;
  if (normalized.includes('*') && !(normalized.endsWith('/**') || normalized.startsWith('**/'))) return false;
  return true;
}

function matchMemoryPattern(path, pattern) {
  const normalized = normalizePathPattern(path);
  const normalizedPattern = normalizePathPattern(pattern);
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.startsWith('**/')) {
    const suffix = normalizedPattern.slice(3);
    return normalized === suffix || normalized.endsWith(`/${suffix}`);
  }
  return normalized === normalizedPattern;
}

function areaMatchesPath(area, path) {
  const excluded = (area.excludePaths ?? []).some((pattern) => matchMemoryPattern(path, pattern));
  if (excluded) return false;
  return (area.paths ?? []).some((pattern) => matchMemoryPattern(path, pattern));
}

export function resolveMemoryArea(path = '', config = defaultMemoryConfig()) {
  return (config.areas ?? []).find((area) => areaMatchesPath(area, path));
}

export function memoryAreaForPath(path = '', config = defaultMemoryConfig()) {
  return resolveMemoryArea(path, config)?.id;
}

export function memoryRoleForPath(path = '', config = defaultMemoryConfig()) {
  return resolveMemoryArea(path, config)?.role;
}

export function retrievalPriorityForPath(path = '', config = defaultMemoryConfig()) {
  return resolveMemoryArea(path, config)?.priority ?? 30;
}

function normalizeTraceabilityPolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return cloneTraceabilityPolicy();
  return {
    required: Array.isArray(raw.required) ? raw.required.map(normalizePathPattern) : [],
    exclude: Array.isArray(raw.exclude) ? raw.exclude.map(normalizePathPattern) : [],
  };
}

function normalizeValidationPolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return cloneValidationPolicy();
  const markdown = raw.markdown && typeof raw.markdown === 'object' && !Array.isArray(raw.markdown) ? raw.markdown : {};
  return cloneValidationPolicy({
    markdown: {
      maxLines: Number.isInteger(markdown.maxLines) ? markdown.maxLines : DEFAULT_VALIDATION_POLICY.markdown.maxLines,
      maxChars: Number.isInteger(markdown.maxChars) ? markdown.maxChars : DEFAULT_VALIDATION_POLICY.markdown.maxChars,
      exclude: Array.isArray(markdown.exclude) ? markdown.exclude.map(normalizePathPattern) : [],
    },
  });
}

export function isMarkdownSizeExcluded(path = '', config = defaultMemoryConfig()) {
  const policy = config.validation ?? DEFAULT_VALIDATION_POLICY;
  return (policy.markdown?.exclude ?? []).some((pattern) => matchMemoryPattern(path, pattern));
}

export function requiresTraceability(path = '', config = defaultMemoryConfig()) {
  const policy = config.traceability ?? DEFAULT_TRACEABILITY_POLICY;
  const excluded = (policy.exclude ?? []).some((pattern) => matchMemoryPattern(path, pattern));
  if (excluded) return false;
  return (policy.required ?? []).some((pattern) => matchMemoryPattern(path, pattern));
}

function normalizeMemoryArea(raw) {
  return {
    id: raw.id,
    label: raw.label ?? raw.id,
    paths: Array.isArray(raw.paths) ? raw.paths.map(normalizePathPattern) : [],
    excludePaths: Array.isArray(raw.excludePaths) ? raw.excludePaths.map(normalizePathPattern) : [],
    scope: raw.scope,
    freshness: raw.freshness,
    role: raw.role ?? raw.id,
    priority: typeof raw.priority === 'number' ? raw.priority : 30,
    includeBodiesByDefault: raw.includeBodiesByDefault !== false,
  };
}

function isFiniteNumberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validateNumberMap(map, keys, min, max) {
  return map && typeof map === 'object' && !Array.isArray(map) && Object.entries(map).every(([key, value]) => keys.has(key) && isFiniteNumberInRange(value, min, max));
}

export function validateMemoryConfigData(data, root = '.', file = 'dotdotgod.config.json') {
  const errors = [];
  const add = (code, field, message, fix = null) => errors.push({
    file: rel(root, resolve(root, file)),
    code,
    message: `${field ? `Field "${field}": ` : ''}${message}\nFix: ${fix ?? `update ${field ?? 'this config'} in ${file} to match the expected dotdotgod config schema.`}`,
  });
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    add('MEMORY_CONFIG_INVALID', null, 'Config must be a JSON object.');
    return errors;
  }
  const traceability = data.traceability;
  if (traceability !== undefined) {
    if (!traceability || typeof traceability !== 'object' || Array.isArray(traceability)) {
      add('TRACEABILITY_CONFIG_INVALID', 'traceability', 'Expected an object.');
    } else {
      if (!Array.isArray(traceability.required)) add('TRACEABILITY_CONFIG_INVALID_REQUIRED', 'traceability.required', 'Expected an array of path strings.');
      else if (traceability.required.some((value) => !isValidPathPattern(value))) add('TRACEABILITY_CONFIG_INVALID_REQUIRED', 'traceability.required', 'Expected path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
      if (traceability.exclude !== undefined && !Array.isArray(traceability.exclude)) add('TRACEABILITY_CONFIG_INVALID_EXCLUDE', 'traceability.exclude', 'Expected an array of path strings.');
      else if (Array.isArray(traceability.exclude) && traceability.exclude.some((value) => !isValidPathPattern(value))) add('TRACEABILITY_CONFIG_INVALID_EXCLUDE', 'traceability.exclude', 'Expected path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
    }
  }
  const validation = data.validation;
  if (validation !== undefined) {
    if (!validation || typeof validation !== 'object' || Array.isArray(validation)) {
      add('VALIDATION_CONFIG_INVALID', 'validation', 'Expected an object.');
    } else if (validation.markdown !== undefined) {
      const markdown = validation.markdown;
      if (!markdown || typeof markdown !== 'object' || Array.isArray(markdown)) {
        add('VALIDATION_CONFIG_INVALID_MARKDOWN', 'validation.markdown', 'Expected an object.');
      } else {
        if (markdown.maxLines !== undefined && (!Number.isInteger(markdown.maxLines) || markdown.maxLines < 1)) add('VALIDATION_CONFIG_INVALID_MAX_LINES', 'validation.markdown.maxLines', 'Expected a positive integer.');
        if (markdown.maxChars !== undefined && (!Number.isInteger(markdown.maxChars) || markdown.maxChars < 1)) add('VALIDATION_CONFIG_INVALID_MAX_CHARS', 'validation.markdown.maxChars', 'Expected a positive integer.');
        if (markdown.exclude !== undefined && !Array.isArray(markdown.exclude)) add('VALIDATION_CONFIG_INVALID_EXCLUDE', 'validation.markdown.exclude', 'Expected an array of path strings.');
        else if (Array.isArray(markdown.exclude) && markdown.exclude.some((value) => !isValidPathPattern(value))) add('VALIDATION_CONFIG_INVALID_EXCLUDE', 'validation.markdown.exclude', 'Expected path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
      }
    }
  }
  const referenceExpansion = data.referenceExpansion;
  if (referenceExpansion !== undefined) {
    if (!referenceExpansion || typeof referenceExpansion !== 'object' || Array.isArray(referenceExpansion)) {
      add('REFERENCE_EXPANSION_CONFIG_INVALID', 'referenceExpansion', 'Expected an object.');
    } else if (referenceExpansion.fuzzy !== undefined) {
      const fuzzy = referenceExpansion.fuzzy;
      if (!fuzzy || typeof fuzzy !== 'object' || Array.isArray(fuzzy)) {
        add('REFERENCE_EXPANSION_CONFIG_INVALID_FUZZY', 'referenceExpansion.fuzzy', 'Expected an object.');
      } else if (fuzzy.lowSignal !== undefined) {
        const lowSignal = fuzzy.lowSignal;
        if (!lowSignal || typeof lowSignal !== 'object' || Array.isArray(lowSignal)) {
          add('REFERENCE_EXPANSION_CONFIG_INVALID_LOW_SIGNAL', 'referenceExpansion.fuzzy.lowSignal', 'Expected an object.');
        } else {
          for (const key of ['add', 'remove']) {
            if (lowSignal[key] !== undefined && (!Array.isArray(lowSignal[key]) || lowSignal[key].some((value) => typeof value !== 'string' || !value.trim()))) add('REFERENCE_EXPANSION_CONFIG_INVALID_LOW_SIGNAL_TERMS', `referenceExpansion.fuzzy.lowSignal.${key}`, 'Expected an array of non-empty strings.');
          }
        }
      }
    }
  }
  const impactRanking = data.impactRanking;
  if (impactRanking !== undefined) {
    if (!impactRanking || typeof impactRanking !== 'object' || Array.isArray(impactRanking)) {
      add('IMPACT_RANKING_CONFIG_INVALID', 'impactRanking', 'Expected an object.');
    } else {
      if (impactRanking.preset !== undefined && !Object.hasOwn(IMPACT_RANKING_PRESETS, impactRanking.preset)) add('IMPACT_RANKING_CONFIG_INVALID_PRESET', 'impactRanking.preset', 'Expected one of balanced, docs-first, code-proximity, test-focused, or archive-aware.');
      if (impactRanking.weights !== undefined && !validateNumberMap(impactRanking.weights, IMPACT_RANKING_WEIGHT_KEYS, -100, 100)) add('IMPACT_RANKING_CONFIG_INVALID_WEIGHTS', 'impactRanking.weights', 'Expected known numeric weight keys with finite values from -100 to 100.');
      if (impactRanking.relationWeights !== undefined && !validateNumberMap(impactRanking.relationWeights, IMPACT_RANKING_RELATION_KEYS, 0, 20)) add('IMPACT_RANKING_CONFIG_INVALID_RELATION_WEIGHTS', 'impactRanking.relationWeights', 'Expected known relation keys with finite values from 0 to 20.');
      for (const key of ['traceabilityBoosts', 'verificationBoosts', 'semanticBoosts', 'proximityBoosts']) {
        if (impactRanking[key] !== undefined && !validateNumberMap(impactRanking[key], IMPACT_RANKING_REASON_KEYS, 0, 100)) add('IMPACT_RANKING_CONFIG_INVALID_BOOSTS', `impactRanking.${key}`, 'Expected known reason keys with finite values from 0 to 100.');
      }
      if (impactRanking.ppr !== undefined) {
        const ppr = impactRanking.ppr;
        if (!ppr || typeof ppr !== 'object' || Array.isArray(ppr)) add('IMPACT_RANKING_CONFIG_INVALID_PPR', 'impactRanking.ppr', 'Expected an object.');
        else {
          if (ppr.enabled !== undefined && typeof ppr.enabled !== 'boolean') add('IMPACT_RANKING_CONFIG_INVALID_PPR', 'impactRanking.ppr.enabled', 'Expected a boolean.');
          if (ppr.damping !== undefined && !isFiniteNumberInRange(ppr.damping, 0.01, 0.99)) add('IMPACT_RANKING_CONFIG_INVALID_PPR', 'impactRanking.ppr.damping', 'Expected a number greater than 0 and less than 1.');
          if (ppr.iterations !== undefined && (!Number.isInteger(ppr.iterations) || ppr.iterations < 1 || ppr.iterations > 100)) add('IMPACT_RANKING_CONFIG_INVALID_PPR', 'impactRanking.ppr.iterations', 'Expected an integer from 1 to 100.');
          if (ppr.tolerance !== undefined && !isFiniteNumberInRange(ppr.tolerance, 0, 1)) add('IMPACT_RANKING_CONFIG_INVALID_PPR', 'impactRanking.ppr.tolerance', 'Expected a number from 0 to 1.');
        }
      }
      if (impactRanking.semantic !== undefined) {
        const semantic = impactRanking.semantic;
        if (!semantic || typeof semantic !== 'object' || Array.isArray(semantic)) add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic', 'Expected an object.');
        else {
          if (semantic.enabled !== undefined && typeof semantic.enabled !== 'boolean') add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic.enabled', 'Expected a boolean.');
          if (semantic.threshold !== undefined && !isFiniteNumberInRange(semantic.threshold, 0, 1)) add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic.threshold', 'Expected a number from 0 to 1.');
          if (semantic.topKPerFile !== undefined && (!Number.isInteger(semantic.topKPerFile) || semantic.topKPerFile < 0 || semantic.topKPerFile > 20)) add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic.topKPerFile', 'Expected an integer from 0 to 20.');
          if (semantic.includeArchiveBodies !== undefined && typeof semantic.includeArchiveBodies !== 'boolean') add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic.includeArchiveBodies', 'Expected a boolean.');
          if (semantic.signals !== undefined && (!Array.isArray(semantic.signals) || semantic.signals.some((value) => !SEMANTIC_SIGNAL_KEYS.has(value)))) add('IMPACT_RANKING_CONFIG_INVALID_SEMANTIC', 'impactRanking.semantic.signals', 'Expected an array of known deterministic signal names.');
        }
      }
    }
  }
  const areas = data.memory?.areas;
  if (areas === undefined) return errors;
  if (!Array.isArray(areas)) {
    add('MEMORY_CONFIG_INVALID_FIELD', 'memory.areas', 'Expected an array.');
    return errors;
  }
  const ids = new Set();
  const exactIncluded = new Map();
  for (const [index, area] of areas.entries()) {
    const prefix = `memory.areas[${index}]`;
    if (!area || typeof area !== 'object' || Array.isArray(area)) {
      add('MEMORY_CONFIG_INVALID_AREA', prefix, 'Expected an object.');
      continue;
    }
    if (typeof area.id !== 'string' || !isKebabCase(area.id)) add('MEMORY_CONFIG_INVALID_ID', `${prefix}.id`, 'Expected a kebab-case string.');
    else if (ids.has(area.id)) add('MEMORY_CONFIG_DUPLICATE_ID', `${prefix}.id`, `Duplicate memory area id: ${area.id}`);
    else ids.add(area.id);
    if (!Array.isArray(area.paths) || area.paths.length === 0 || area.paths.some((value) => !isValidPathPattern(value))) add('MEMORY_CONFIG_INVALID_PATHS', `${prefix}.paths`, 'Expected a non-empty array of path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
    if (area.excludePaths !== undefined && (!Array.isArray(area.excludePaths) || area.excludePaths.some((value) => !isValidPathPattern(value)))) add('MEMORY_CONFIG_INVALID_EXCLUDE_PATHS', `${prefix}.excludePaths`, 'Expected an array of path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
    if (!MEMORY_SCOPES.has(area.scope)) add('MEMORY_CONFIG_INVALID_SCOPE', `${prefix}.scope`, 'Expected "shared" or "local".');
    if (!MEMORY_FRESHNESS.has(area.freshness)) add('MEMORY_CONFIG_INVALID_FRESHNESS', `${prefix}.freshness`, 'Expected "fresh" or "stale".');
    if (area.priority !== undefined && (!Number.isInteger(area.priority) || area.priority < 0 || area.priority > 100)) add('MEMORY_CONFIG_INVALID_PRIORITY', `${prefix}.priority`, 'Expected an integer from 0 to 100.');
    if (area.includeBodiesByDefault !== undefined && typeof area.includeBodiesByDefault !== 'boolean') add('MEMORY_CONFIG_INVALID_INCLUDE_POLICY', `${prefix}.includeBodiesByDefault`, 'Expected a boolean.');
    for (const pattern of area.paths ?? []) {
      if (exactIncluded.has(pattern) && !(area.excludePaths ?? []).includes(pattern)) add('MEMORY_CONFIG_OVERLAP', `${prefix}.paths`, `Path pattern also appears in ${exactIncluded.get(pattern)}: ${pattern}`);
      else exactIncluded.set(pattern, `${prefix}.paths`);
    }
  }
  return errors;
}

export function readMemoryConfig(root = '.') {
  for (const name of MEMORY_CONFIG_FILES) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      const errors = validateMemoryConfigData(data, root, name);
      if (errors.length > 0) return { ...defaultMemoryConfig(), source: name, errors };
      const configuredAreas = data.memory?.areas?.map(normalizeMemoryArea) ?? [];
      const traceability = data.traceability === undefined ? cloneTraceabilityPolicy() : normalizeTraceabilityPolicy(data.traceability);
      const validation = data.validation === undefined ? cloneValidationPolicy() : normalizeValidationPolicy(data.validation);
      const impactRanking = normalizeImpactRankingPolicy(data.impactRanking);
      const referenceExpansion = normalizeReferenceExpansionPolicy(data.referenceExpansion);
      return configuredAreas.length > 0 ? { source: name, areas: configuredAreas, traceability, validation, impactRanking, referenceExpansion, errors: [] } : { ...defaultMemoryConfig(), traceability, validation, impactRanking, referenceExpansion, source: name, errors: [] };
    } catch (error) {
      return { ...defaultMemoryConfig(), source: name, errors: [{ file: name, code: 'MEMORY_CONFIG_INVALID_JSON', message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}\nFix: repair ${name} so it is valid JSON, or regenerate the default config with \`dotdotgod config init <root> --force\` if you want to reset it.` }] };
    }
  }
  return defaultMemoryConfig();
}

function serializableMemoryArea(area) {
  return {
    id: area.id,
    label: area.label,
    paths: [...(area.paths ?? [])],
    excludePaths: [...(area.excludePaths ?? [])],
    scope: area.scope,
    freshness: area.freshness,
    role: area.role,
    priority: area.priority,
    includeBodiesByDefault: area.includeBodiesByDefault !== false,
  };
}

export function defaultDotdotgodConfigData() {
  const config = defaultMemoryConfig();
  return {
    memory: {
      areas: (config.areas ?? []).map(serializableMemoryArea),
    },
    traceability: cloneTraceabilityPolicy(config.traceability),
    validation: cloneValidationPolicy(config.validation),
    impactRanking: cloneImpactRankingPolicy(config.impactRanking),
    referenceExpansion: { fuzzy: { lowSignal: { add: [], remove: [] } } },
  };
}

export function defaultDotdotgodConfigText() {
  return `${JSON.stringify(defaultDotdotgodConfigData(), null, 2)}\n`;
}

export function memoryConfigSummary(config) {
  return {
    source: config.source ?? 'default',
    areas: (config.areas ?? []).map((area) => ({
      id: area.id,
      label: area.label,
      paths: area.paths,
      excludePaths: area.excludePaths ?? [],
      scope: area.scope,
      freshness: area.freshness,
      role: area.role,
      priority: area.priority,
      includeBodiesByDefault: area.includeBodiesByDefault !== false,
    })),
    traceability: cloneTraceabilityPolicy(config.traceability ?? DEFAULT_TRACEABILITY_POLICY),
    validation: cloneValidationPolicy(config.validation ?? DEFAULT_VALIDATION_POLICY),
    impactRanking: cloneImpactRankingPolicy(config.impactRanking ?? DEFAULT_IMPACT_RANKING_POLICY),
    referenceExpansion: cloneReferenceExpansionPolicy(config.referenceExpansion),
  };
}

