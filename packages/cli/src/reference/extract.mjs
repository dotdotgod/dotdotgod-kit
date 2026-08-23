import { basename, dirname, extname } from 'node:path';
import { cloneReferenceExpansionPolicy, defaultMemoryConfig, normalizeLowSignalTerm } from '../memory/config.mjs';

export const DEFAULT_REFERENCE_LIMIT = 5;

export function extractBracketReferences(prompt = '') {
  const refs = [];
  const seen = new Set();
  for (const match of String(prompt).matchAll(/\[\[([^\]]+)\]\]/g)) {
    const raw = match[1].trim();
    if (!raw) continue;
    const target = raw.split('|')[0].trim();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    refs.push({ raw: match[0], target, label: raw.includes('|') ? raw.split('|').slice(1).join('|').trim() : undefined });
  }
  return refs;
}

function fuzzyLowSignalSet(policy = defaultMemoryConfig().referenceExpansion) {
  return new Set(cloneReferenceExpansionPolicy(policy).fuzzy.lowSignal.terms);
}

function fuzzyPhraseAllowed(value = '', lowSignalTerms = fuzzyLowSignalSet()) {
  const normalized = normalizeLowSignalTerm(value);
  if (normalized.length < 3) return false;
  if (lowSignalTerms.has(normalized)) return false;
  return /[a-z0-9가-힣]/i.test(normalized);
}

function fuzzyTokenKey(value = '') {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeReferenceAlias(value = '') {
  return String(value)
    .trim()
    .replace(/^\[\[/, '')
    .replace(/\]\]$/, '')
    .split('|')[0]
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[^a-z0-9/#.]/g, '');
}

export function referencePathForNode(node) {
  if (node?.path) return node.path;
  if (typeof node?.id === 'string' && node.id.startsWith('file:')) return node.id.slice(5);
  if (typeof node?.id === 'string' && node.id.startsWith('heading:')) return node.id.slice(8).split('#')[0];
  return '';
}

export function isArchiveBodyPath(path = '', memoryConfig) {
  const area = memoryConfig?.areas?.find((candidate) => candidate.id === 'archive-body' || candidate.role === 'historical-memory-body');
  if (!area) return path.startsWith('docs/archive/') && path !== 'docs/archive/README.md';
  const normalize = (value) => value.replace(/\/\*\*$/, '');
  return (area.paths ?? []).some((pattern) => path === normalize(pattern) || path.startsWith(`${normalize(pattern)}/`))
    && !(area.excludePaths ?? []).some((excluded) => path === excluded);
}

function aliasEntriesForPath(path = '') {
  const entries = [];
  const base = basename(path);
  const ext = extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const withoutMd = path.replace(/\.md$/i, '');
  const parts = withoutMd.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) entries.push({ alias: parts.slice(i).join('/'), kind: 'path-suffix' });
  if (base === 'README.md') {
    const dir = dirname(path).replace(/\\/g, '/');
    entries.push({ alias: basename(dir), kind: 'path' });
  }
  for (const alias of [path, withoutMd, base, stem]) entries.push({ alias, kind: 'path' });
  return entries.filter((entry) => entry.alias);
}

export function referenceCandidateAliases(node) {
  const path = referencePathForNode(node);
  const entries = [];
  if (node.type === 'file' && path) entries.push(...aliasEntriesForPath(path));
  if (node.type === 'heading') {
    const fileStem = path ? basename(path, extname(path)) : '';
    const anchor = typeof node.id === 'string' && node.id.includes('#') ? node.id.split('#').pop() : '';
    for (const alias of [node.title, anchor, fileStem && node.title ? `${fileStem}#${node.title}` : '', fileStem && anchor ? `${fileStem}#${anchor}` : '', path && node.title ? `${path}#${node.title}` : '', path && anchor ? `${path}#${anchor}` : '']) entries.push({ alias, kind: 'heading' });
  }
  return entries.filter((entry) => entry.alias);
}

export function extractFuzzyReferences(prompt = '', index = null, options = {}) {
  const text = String(prompt ?? '');
  const masked = text.replace(/\[\[[^\]\n]+\]\]/g, ' ');
  const seen = new Set((options.existingTargets ?? []).map((value) => fuzzyTokenKey(value)));
  const lowSignalTerms = fuzzyLowSignalSet(options.referenceExpansion ?? options.memoryConfig?.referenceExpansion ?? index?.memoryConfig?.referenceExpansion);
  const refs = [];
  const add = (target, reason, confidence = 'medium') => {
    const clean = String(target ?? '').trim().replace(/^['"`]+|['"`]+$/g, '').replace(/\s+/g, ' ');
    if (!fuzzyPhraseAllowed(clean, lowSignalTerms)) return;
    const key = fuzzyTokenKey(clean);
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ raw: clean, target: clean, source: 'fuzzy', confidence, reasons: [reason] });
  };

  for (const match of masked.matchAll(/(?:^|\s)([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?:#[A-Za-z0-9 _-]+)?|[A-Z0-9]{3,})(?=$|\s|[.,:;!?])/g)) add(match[1], 'uppercase_identifier', 'high');
  for (const match of masked.matchAll(/(?:^|\s)((?:\.?\/?(?:docs|packages|src|test|spec|arch|plan|archive)\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+(?:\.md)?(?:#[A-Za-z0-9 _-]+)?)(?=$|\s|[.,:;!?])/g)) add(match[1].replace(/^\.\//, ''), 'path_like', 'high');
  for (const match of masked.matchAll(/[`"']([^`"'\n]{4,80})[`"']/g)) add(match[1], 'quoted_phrase', 'medium');

  const graph = index?.graph ?? null;
  if (graph) {
    const lower = ` ${masked.toLowerCase().replace(/[^a-z0-9가-힣/#._-]+/gi, ' ')} `;
    const aliasByKey = new Map();
    for (const node of graph.nodes ?? []) {
      if (!['file', 'heading'].includes(node.type)) continue;
      const path = referencePathForNode(node);
      if (options.includeArchive !== true && isArchiveBodyPath(path, options.memoryConfig ?? index?.memoryConfig)) continue;
      for (const entry of referenceCandidateAliases(node)) {
        const alias = String(entry.alias ?? '').replace(/\.md$/i, '').replace(/[_-]+/g, ' ').trim();
        if (!fuzzyPhraseAllowed(alias, lowSignalTerms)) continue;
        const words = alias.split(/[\s/]+/).filter(Boolean);
        if (words.length > 3 || words.some((word) => lowSignalTerms.has(normalizeLowSignalTerm(word)))) continue;
        const key = fuzzyTokenKey(alias);
        const previous = aliasByKey.get(key);
        const priority = Number(node.retrievalPriority ?? node.retrieval?.priority ?? 30);
        if (!previous || priority > previous.priority) aliasByKey.set(key, { alias, priority });
      }
    }
    for (const { alias } of [...aliasByKey.values()].sort((a, b) => b.priority - a.priority || b.alias.length - a.alias.length)) {
      const escaped = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s_-]+');
      const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
      if (pattern.test(lower)) add(alias, 'known_alias', 'medium');
      if (refs.length >= (options.maxFuzzyRefs ?? 5)) break;
    }
  }
  return refs.slice(0, options.maxFuzzyRefs ?? 5);
}
