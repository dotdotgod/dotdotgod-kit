import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rel } from '../common/paths.mjs';
import { isKebabCase } from '../docs/markdown.mjs';

const MEMORY_CONFIG_FILE = 'dotdotgod.config.json';
const MEMORY_SCOPES = new Set(['shared', 'local']);
const MEMORY_FRESHNESS = new Set(['fresh', 'stale']);
export const DEFAULT_TRACEABILITY_KEYS = [
  { key: 'implementedBy', label: 'Implemented by', description: 'Files that implement the behavior.', target: 'path', relation: 'implemented_by', weight: 4 },
  { key: 'verifiedBy', label: 'Verified by', description: 'Tests or maintained verification documents.', target: 'path', relation: 'verified_by', weight: 4 },
  { key: 'relatedDocs', label: 'Related docs', description: 'Documents needed to interpret the behavior.', target: 'path', relation: 'related_doc', weight: 3 },
  { key: 'verificationCommands', label: 'Verification commands', description: 'Project-local verification commands.', target: 'command', relation: 'verification_command', weight: 3 },
];
export const DEFAULT_TRACEABILITY_POLICY = {
  required: ['docs/spec/**'],
  exclude: ['**/README.md'],
  keys: DEFAULT_TRACEABILITY_KEYS,
};
export const DEFAULT_VALIDATION_POLICY = {
  markdown: {
    maxLines: 200,
    maxChars: 10000,
    exclude: [],
    filename: {
      warnNumberedSeries: true,
      allow: [],
    },
  },
};
export const DEFAULT_LOAD_POLICY = {
  pinnedPaths: [],
  pinnedBodies: [],
  documentationSummary: {
    exclude: ['docs/plan', 'docs/archive'],
  },
};
export const DEFAULT_PLAN_MODE_POLICY = {
  writablePaths: ['docs/plan/**', 'docs/archive/**'],
};
export const DEFAULT_IMPACT_RANKING_POLICY = {
  connectionCap: 80,
  memoryCap: 20,
  ppr: { damping: 0.85, iterations: 20, tolerance: 0.000001, reference: 0.4 },
  relationWeights: {
    links_to: 2,
    routes_to: 2,
    belongs_to_area: 2,
    vector_similarity: 2,
    includes_resource: 1,
    defines_contract: 2,
  },
  semantic: { enabled: true, threshold: 0.5, topKPerFile: 5 },
};
export const SEMANTIC_RELATIONS = new Set(['vector_similarity']);
const TRACEABILITY_TARGETS = new Set(['path', 'command']);
const TRACEABILITY_RESERVED_KEYS = new Set(['kind', 'contracts', 'id', 'title', 'sections']);
export const BUILT_IN_GRAPH_RELATIONS = new Set([
  'belongs_to_area', 'includes_resource', 'defines_contract', 'contains_heading', 'links_to', 'routes_to',
  'declares_package', 'declares_script', 'declares_bin', 'depends_on', 'vector_similarity',
]);
const TRACEABILITY_RESERVED_RELATIONS = BUILT_IN_GRAPH_RELATIONS;
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
  { id: 'docs', label: 'Project Documentation', paths: ['docs/**'], scope: 'shared', freshness: 'fresh', role: 'project-documentation', priority: 60, includeBodiesByDefault: true },
];

function cloneClarifyGuidance(clarify) {
  if (!clarify || typeof clarify !== 'object' || Array.isArray(clarify)) return undefined;
  return {
    ...(Array.isArray(clarify.audience) ? { audience: [...clarify.audience] } : {}),
    ...(typeof clarify.documentType === 'string' ? { documentType: clarify.documentType } : {}),
    ...(typeof clarify.clarityGoal === 'string' ? { clarityGoal: clarify.clarityGoal } : {}),
    ...(Array.isArray(clarify.editRules) ? { editRules: [...clarify.editRules] } : {}),
  };
}

function withOptionalAreaMetadata(target, area) {
  const description = typeof area.description === 'string' ? area.description.trim() : '';
  const clarify = cloneClarifyGuidance(area.clarify);
  return {
    ...target,
    ...(description ? { description } : {}),
    ...(clarify && Object.keys(clarify).length > 0 ? { clarify } : {}),
  };
}

function cloneArea(area) {
  return withOptionalAreaMetadata({
    ...area,
    paths: [...(area.paths ?? [])],
    excludePaths: [...(area.excludePaths ?? [])],
  }, area);
}

function cloneTraceabilityKey(definition) {
  return { key: definition.key, label: definition.label, description: definition.description, target: definition.target, relation: definition.relation, weight: definition.weight };
}

export function cloneTraceabilityPolicy(policy = DEFAULT_TRACEABILITY_POLICY) {
  return {
    required: [...(policy.required ?? [])],
    exclude: [...(policy.exclude ?? [])],
    keys: (policy.keys ?? DEFAULT_TRACEABILITY_KEYS).map(cloneTraceabilityKey),
  };
}

export function traceabilityRelationWeights(policy = DEFAULT_TRACEABILITY_POLICY) {
  return Object.fromEntries((policy.keys ?? DEFAULT_TRACEABILITY_KEYS).map((definition) => [definition.relation, definition.weight]));
}

export function cloneValidationPolicy(policy = DEFAULT_VALIDATION_POLICY) {
  const filename = policy.markdown?.filename;
  return {
    markdown: {
      maxLines: policy.markdown?.maxLines ?? DEFAULT_VALIDATION_POLICY.markdown.maxLines,
      maxChars: policy.markdown?.maxChars ?? DEFAULT_VALIDATION_POLICY.markdown.maxChars,
      exclude: [...(policy.markdown?.exclude ?? [])],
      filename: filename
        ? { warnNumberedSeries: filename.warnNumberedSeries ?? true, allow: [...(filename.allow ?? [])] }
        : { ...DEFAULT_VALIDATION_POLICY.markdown.filename, allow: [] },
    },
  };
}

export function cloneImpactRankingPolicy(policy = DEFAULT_IMPACT_RANKING_POLICY) {
  return {
    connectionCap: DEFAULT_IMPACT_RANKING_POLICY.connectionCap,
    memoryCap: DEFAULT_IMPACT_RANKING_POLICY.memoryCap,
    ppr: { ...DEFAULT_IMPACT_RANKING_POLICY.ppr },
    relationWeights: { ...DEFAULT_IMPACT_RANKING_POLICY.relationWeights },
    semantic: { ...DEFAULT_IMPACT_RANKING_POLICY.semantic, ...(policy.semantic ?? {}) },
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
  const candidate = raw && typeof raw === 'object' && !Array.isArray(raw)
    && raw.semantic && typeof raw.semantic === 'object' && !Array.isArray(raw.semantic)
    ? raw.semantic
    : {};
  const semantic = {
    ...(typeof candidate.enabled === 'boolean' ? { enabled: candidate.enabled } : {}),
    ...(isFiniteNumberInRange(candidate.threshold, 0, 1) ? { threshold: candidate.threshold } : {}),
    ...(Number.isInteger(candidate.topKPerFile) && candidate.topKPerFile >= 0 && candidate.topKPerFile <= 20 ? { topKPerFile: candidate.topKPerFile } : {}),
  };
  return cloneImpactRankingPolicy({ semantic });
}

export function cloneLoadPolicy(policy = DEFAULT_LOAD_POLICY) {
  return {
    pinnedPaths: [...(policy.pinnedPaths ?? [])],
    pinnedBodies: [...(policy.pinnedBodies ?? [])],
    documentationSummary: {
      exclude: [...(policy.documentationSummary?.exclude ?? DEFAULT_LOAD_POLICY.documentationSummary.exclude)],
    },
  };
}

export function clonePlanModePolicy(policy = DEFAULT_PLAN_MODE_POLICY) {
  return { writablePaths: [...(policy.writablePaths ?? DEFAULT_PLAN_MODE_POLICY.writablePaths)] };
}

export function defaultMemoryConfig() {
  return { source: 'default', areas: DEFAULT_MEMORY_AREAS.map(cloneArea), traceability: cloneTraceabilityPolicy(), validation: cloneValidationPolicy(), impactRanking: cloneImpactRankingPolicy(), referenceExpansion: cloneReferenceExpansionPolicy(), load: cloneLoadPolicy(), planMode: clonePlanModePolicy() };
}

export function normalizePathPattern(value = '') {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$|^\/+/, '');
}

export function isValidPathPattern(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = normalizePathPattern(value);
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') return false;
  if (normalized.includes('*') && !(normalized.endsWith('/**') || normalized.startsWith('**/'))) return false;
  return true;
}

export function matchPathPattern(path, pattern) {
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
  const excluded = (area.excludePaths ?? []).some((pattern) => matchPathPattern(path, pattern));
  if (excluded) return false;
  return (area.paths ?? []).some((pattern) => matchPathPattern(path, pattern));
}

export function resolveMemoryArea(path = '', config = defaultMemoryConfig()) {
  return (config.areas ?? []).find((area) => areaMatchesPath(area, path));
}

export function memoryAreaForPath(path = '', config = defaultMemoryConfig()) {
  return resolveMemoryArea(path, config)?.id;
}

function normalizeTraceabilityPolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return cloneTraceabilityPolicy();
  return {
    required: Array.isArray(raw.required) ? raw.required.map(normalizePathPattern) : [],
    exclude: Array.isArray(raw.exclude) ? raw.exclude.map(normalizePathPattern) : [],
    keys: (raw.keys === undefined ? DEFAULT_TRACEABILITY_KEYS : raw.keys).map(cloneTraceabilityKey),
  };
}

function normalizeValidationPolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return cloneValidationPolicy();
  const markdown = raw.markdown && typeof raw.markdown === 'object' && !Array.isArray(raw.markdown) ? raw.markdown : {};
  const filename = markdown.filename && typeof markdown.filename === 'object' && !Array.isArray(markdown.filename) ? markdown.filename : undefined;
  return cloneValidationPolicy({
    markdown: {
      maxLines: Number.isInteger(markdown.maxLines) ? markdown.maxLines : DEFAULT_VALIDATION_POLICY.markdown.maxLines,
      maxChars: Number.isInteger(markdown.maxChars) ? markdown.maxChars : DEFAULT_VALIDATION_POLICY.markdown.maxChars,
      exclude: Array.isArray(markdown.exclude) ? markdown.exclude.map(normalizePathPattern) : [],
      filename: filename ? {
        warnNumberedSeries: typeof filename.warnNumberedSeries === 'boolean' ? filename.warnNumberedSeries : true,
        allow: Array.isArray(filename.allow) ? filename.allow.map(normalizePathPattern) : [],
      } : undefined,
    },
  });
}

export function isSecretLikePathPattern(value = '') {
  const normalized = normalizePathPattern(value);
  return /(^|\/)(\.env|\.npmrc|\.pypirc|id_rsa|id_dsa|id_ed25519|credentials?|secrets?)(\.|\/|$)/i.test(normalized);
}

function normalizePlanModePolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clonePlanModePolicy();
  const writablePaths = raw.writablePaths === undefined
    ? DEFAULT_PLAN_MODE_POLICY.writablePaths
    : [...new Set((Array.isArray(raw.writablePaths) ? raw.writablePaths : []).map(normalizePathPattern))];
  return clonePlanModePolicy({ writablePaths });
}

function normalizeLoadPolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return cloneLoadPolicy();
  const normalize = (values) => (Array.isArray(values) ? [...new Set(values.map(normalizePathPattern))] : []);
  return cloneLoadPolicy({
    pinnedPaths: [],
    pinnedBodies: [],
    documentationSummary: {
      exclude: raw.documentationSummary?.exclude === undefined
        ? DEFAULT_LOAD_POLICY.documentationSummary.exclude
        : normalize(raw.documentationSummary.exclude),
    },
  });
}

export function isMarkdownSizeExcluded(path = '', config = defaultMemoryConfig()) {
  const policy = config.validation ?? DEFAULT_VALIDATION_POLICY;
  return (policy.markdown?.exclude ?? []).some((pattern) => matchPathPattern(path, pattern));
}

export function requiresTraceability(path = '', config = defaultMemoryConfig()) {
  const policy = config.traceability ?? DEFAULT_TRACEABILITY_POLICY;
  const excluded = (policy.exclude ?? []).some((pattern) => matchPathPattern(path, pattern));
  if (excluded) return false;
  return (policy.required ?? []).some((pattern) => matchPathPattern(path, pattern));
}

function normalizeMemoryArea(raw) {
  return withOptionalAreaMetadata({
    id: raw.id,
    label: raw.label ?? raw.id,
    paths: Array.isArray(raw.paths) ? raw.paths.map(normalizePathPattern) : [],
    excludePaths: Array.isArray(raw.excludePaths) ? raw.excludePaths.map(normalizePathPattern) : [],
    scope: raw.scope,
    freshness: raw.freshness,
    role: raw.role ?? raw.id,
    priority: typeof raw.priority === 'number' ? raw.priority : 30,
    includeBodiesByDefault: raw.includeBodiesByDefault !== false,
  }, raw);
}

function isFiniteNumberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
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
      if (traceability.keys !== undefined && !Array.isArray(traceability.keys)) add('TRACEABILITY_CONFIG_INVALID_KEYS', 'traceability.keys', 'Expected an array of traceability key definitions.');
      else if (Array.isArray(traceability.keys)) {
        const keys = new Set();
        const labels = new Set();
        const relations = new Set();
        for (const [index, definition] of traceability.keys.entries()) {
          const prefix = `traceability.keys[${index}]`;
          if (!definition || typeof definition !== 'object' || Array.isArray(definition)) { add('TRACEABILITY_CONFIG_INVALID_KEY', prefix, 'Expected an object.'); continue; }
          const allowed = new Set(['key', 'label', 'description', 'target', 'relation', 'weight']);
          if (Object.keys(definition).some((key) => !allowed.has(key))) add('TRACEABILITY_CONFIG_INVALID_KEY', prefix, 'Contains unsupported fields.');
          if (typeof definition.key !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(definition.key) || TRACEABILITY_RESERVED_KEYS.has(definition.key) || keys.has(definition.key)) add('TRACEABILITY_CONFIG_INVALID_KEY', `${prefix}.key`, 'Expected a unique non-reserved identifier.'); else keys.add(definition.key);
          const trimmedLabel = typeof definition.label === 'string' ? definition.label.trim() : '';
          const normalizedLabel = trimmedLabel.toLocaleLowerCase();
          if (!normalizedLabel || /[\u0000-\u001f\u007f]/.test(trimmedLabel) || labels.has(normalizedLabel)) add('TRACEABILITY_CONFIG_INVALID_LABEL', `${prefix}.label`, 'Expected a unique single-line non-empty label after trimming and case normalization.'); else labels.add(normalizedLabel);
          if (typeof definition.description !== 'string' || !definition.description.trim()) add('TRACEABILITY_CONFIG_INVALID_DESCRIPTION', `${prefix}.description`, 'Expected a non-empty description.');
          if (!TRACEABILITY_TARGETS.has(definition.target)) add('TRACEABILITY_CONFIG_INVALID_TARGET', `${prefix}.target`, 'Expected "path" or "command".');
          if (typeof definition.relation !== 'string' || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(definition.relation) || TRACEABILITY_RESERVED_RELATIONS.has(definition.relation) || relations.has(definition.relation)) add('TRACEABILITY_CONFIG_INVALID_RELATION', `${prefix}.relation`, 'Expected a unique canonical snake_case relation not reserved by the graph.'); else relations.add(definition.relation);
          if (!isFiniteNumberInRange(definition.weight, 0, 20)) add('TRACEABILITY_CONFIG_INVALID_WEIGHT', `${prefix}.weight`, 'Expected a finite number from 0 to 20.');
        }
      }
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
        if (markdown.filename !== undefined) {
          const fn = markdown.filename;
          if (!fn || typeof fn !== 'object' || Array.isArray(fn)) {
            add('VALIDATION_CONFIG_INVALID_FILENAME', 'validation.markdown.filename', 'Expected an object.');
          } else {
            if (fn.warnNumberedSeries !== undefined && typeof fn.warnNumberedSeries !== 'boolean') add('VALIDATION_CONFIG_INVALID_FILENAME', 'validation.markdown.filename.warnNumberedSeries', 'Expected a boolean.');
            if (fn.allow !== undefined && !Array.isArray(fn.allow)) add('VALIDATION_CONFIG_INVALID_FILENAME_ALLOW', 'validation.markdown.filename.allow', 'Expected an array of path strings.');
            else if (Array.isArray(fn.allow) && fn.allow.some((value) => !isValidPathPattern(value))) add('VALIDATION_CONFIG_INVALID_FILENAME_ALLOW', 'validation.markdown.filename.allow', 'Expected path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
          }
        }
      }
    }
  }
  const load = data.load;
  if (load !== undefined) {
    if (!load || typeof load !== 'object' || Array.isArray(load)) {
      add('LOAD_CONFIG_INVALID', 'load', 'Expected an object.');
    } else {
      if (load.documentationSummary !== undefined) {
        const summary = load.documentationSummary;
        if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
          add('LOAD_CONFIG_INVALID_DOCUMENTATION_SUMMARY', 'load.documentationSummary', 'Expected an object.');
        } else if (summary.exclude !== undefined) {
          if (!Array.isArray(summary.exclude)) add('LOAD_CONFIG_INVALID_DOCUMENTATION_SUMMARY_EXCLUDE', 'load.documentationSummary.exclude', 'Expected an array of path strings.');
          else if (summary.exclude.some((value) => !isValidPathPattern(value) || (typeof value === 'string' && value.trim().startsWith('/')))) add('LOAD_CONFIG_INVALID_DOCUMENTATION_SUMMARY_EXCLUDE', 'load.documentationSummary.exclude', 'Expected repository-relative path strings using exact paths, /** subtree patterns, or **/suffix patterns.');
        }
      }
    }
  }
  const planMode = data.planMode;
  if (planMode !== undefined) {
    if (!planMode || typeof planMode !== 'object' || Array.isArray(planMode)) {
      add('PLAN_MODE_CONFIG_INVALID', 'planMode', 'Expected an object.');
    } else if (planMode.writablePaths !== undefined) {
      const paths = planMode.writablePaths;
      if (!Array.isArray(paths)) add('PLAN_MODE_CONFIG_INVALID_WRITABLE_PATHS', 'planMode.writablePaths', 'Expected an array of documentation path strings.');
      else if (paths.some((value) => !isValidPathPattern(value) || typeof value !== 'string' || value.trim().startsWith('/') || (!normalizePathPattern(value).startsWith('docs/') && normalizePathPattern(value) !== 'docs') || normalizePathPattern(value).startsWith('docs/.') || isSecretLikePathPattern(value))) add('PLAN_MODE_CONFIG_INVALID_WRITABLE_PATHS', 'planMode.writablePaths', 'Expected safe repository-relative paths under docs/ using exact paths or /** subtree patterns.');
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
    if (area.description !== undefined && (typeof area.description !== 'string' || !area.description.trim())) add('MEMORY_CONFIG_INVALID_DESCRIPTION', `${prefix}.description`, 'Expected a non-empty string.');
    if (area.clarify !== undefined) {
      const clarify = area.clarify;
      if (!clarify || typeof clarify !== 'object' || Array.isArray(clarify)) {
        add('MEMORY_CONFIG_INVALID_CLARIFY', `${prefix}.clarify`, 'Expected an object.');
      } else {
        if (clarify.audience !== undefined && (!Array.isArray(clarify.audience) || clarify.audience.some((value) => typeof value !== 'string' || !value.trim()))) add('MEMORY_CONFIG_INVALID_CLARIFY_AUDIENCE', `${prefix}.clarify.audience`, 'Expected an array of non-empty strings.');
        if (clarify.documentType !== undefined && (typeof clarify.documentType !== 'string' || !clarify.documentType.trim())) add('MEMORY_CONFIG_INVALID_CLARIFY_DOCUMENT_TYPE', `${prefix}.clarify.documentType`, 'Expected a non-empty string.');
        if (clarify.clarityGoal !== undefined && (typeof clarify.clarityGoal !== 'string' || !clarify.clarityGoal.trim())) add('MEMORY_CONFIG_INVALID_CLARITY_GOAL', `${prefix}.clarify.clarityGoal`, 'Expected a non-empty string.');
        if (clarify.editRules !== undefined && (!Array.isArray(clarify.editRules) || clarify.editRules.some((value) => typeof value !== 'string' || !value.trim()))) add('MEMORY_CONFIG_INVALID_CLARIFY_EDIT_RULES', `${prefix}.clarify.editRules`, 'Expected an array of non-empty strings.');
      }
    }
    for (const pattern of area.paths ?? []) {
      if (exactIncluded.has(pattern) && !(area.excludePaths ?? []).includes(pattern)) add('MEMORY_CONFIG_OVERLAP', `${prefix}.paths`, `Path pattern also appears in ${exactIncluded.get(pattern)}: ${pattern}`);
      else exactIncluded.set(pattern, `${prefix}.paths`);
    }
  }
  return errors;
}

export function readMemoryConfig(root = '.') {
  const path = join(root, MEMORY_CONFIG_FILE);
  if (!existsSync(path)) return defaultMemoryConfig();
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const errors = validateMemoryConfigData(data, root, MEMORY_CONFIG_FILE);
    if (errors.length > 0) return { ...defaultMemoryConfig(), source: MEMORY_CONFIG_FILE, errors };
    const configuredAreas = data.memory?.areas?.map(normalizeMemoryArea) ?? [];
    const traceability = data.traceability === undefined ? cloneTraceabilityPolicy() : normalizeTraceabilityPolicy(data.traceability);
    const validation = data.validation === undefined ? cloneValidationPolicy() : normalizeValidationPolicy(data.validation);
    const impactRanking = normalizeImpactRankingPolicy(data.impactRanking);
    const referenceExpansion = normalizeReferenceExpansionPolicy(data.referenceExpansion);
    const load = normalizeLoadPolicy(data.load);
    const planMode = normalizePlanModePolicy(data.planMode);
    return configuredAreas.length > 0 ? { source: MEMORY_CONFIG_FILE, areas: configuredAreas, traceability, validation, impactRanking, referenceExpansion, load, planMode, errors: [] } : { ...defaultMemoryConfig(), traceability, validation, impactRanking, referenceExpansion, load, planMode, source: MEMORY_CONFIG_FILE, errors: [] };
  } catch (error) {
    return { ...defaultMemoryConfig(), source: MEMORY_CONFIG_FILE, errors: [{ file: MEMORY_CONFIG_FILE, code: 'MEMORY_CONFIG_INVALID_JSON', message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}\nFix: repair ${MEMORY_CONFIG_FILE} so it is valid JSON, or remove it before regenerating the default config with \`dotdotgod config init <root>\`.` }] };
  }
}

function serializableMemoryArea(area) {
  return withOptionalAreaMetadata({
    id: area.id,
    label: area.label,
    paths: [...(area.paths ?? [])],
    excludePaths: [...(area.excludePaths ?? [])],
    scope: area.scope,
    freshness: area.freshness,
    role: area.role,
    priority: area.priority,
    includeBodiesByDefault: area.includeBodiesByDefault !== false,
  }, area);
}

export function defaultDotdotgodConfigData() {
  const config = defaultMemoryConfig();
  return {
    memory: {
      areas: (config.areas ?? []).map(serializableMemoryArea),
    },
    traceability: cloneTraceabilityPolicy(config.traceability),
    validation: cloneValidationPolicy(config.validation),
    impactRanking: { semantic: { ...config.impactRanking.semantic } },
    referenceExpansion: { fuzzy: { lowSignal: { add: [], remove: [] } } },
    load: cloneLoadPolicy(config.load),
    planMode: clonePlanModePolicy(config.planMode),
  };
}

export function defaultDotdotgodConfigText() {
  return `${JSON.stringify(defaultDotdotgodConfigData(), null, 2)}\n`;
}

export function memoryConfigSummary(config) {
  return {
    source: config.source ?? 'default',
    areas: (config.areas ?? []).map((area) => withOptionalAreaMetadata({
      id: area.id,
      label: area.label,
      paths: [...(area.paths ?? [])],
      excludePaths: [...(area.excludePaths ?? [])],
      scope: area.scope,
      freshness: area.freshness,
      role: area.role,
      priority: area.priority,
      includeBodiesByDefault: area.includeBodiesByDefault !== false,
    }, area)),
    traceability: cloneTraceabilityPolicy(config.traceability ?? DEFAULT_TRACEABILITY_POLICY),
    validation: cloneValidationPolicy(config.validation ?? DEFAULT_VALIDATION_POLICY),
    impactRanking: {
      fixed: {
        connectionCap: DEFAULT_IMPACT_RANKING_POLICY.connectionCap,
        memoryCap: DEFAULT_IMPACT_RANKING_POLICY.memoryCap,
        ppr: { ...DEFAULT_IMPACT_RANKING_POLICY.ppr },
        relationWeights: { ...DEFAULT_IMPACT_RANKING_POLICY.relationWeights },
      },
      semantic: { ...cloneImpactRankingPolicy(config.impactRanking ?? DEFAULT_IMPACT_RANKING_POLICY).semantic },
    },
    referenceExpansion: cloneReferenceExpansionPolicy(config.referenceExpansion),
    load: cloneLoadPolicy(config.load),
    planMode: clonePlanModePolicy(config.planMode),
  };
}

