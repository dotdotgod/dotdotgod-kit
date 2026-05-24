import { extractDotdotgodTraceabilityBlocks, validateTraceabilityBlock } from '../docs/traceability.mjs';
import { requiresTraceability } from '../memory/config.mjs';

export function summarizeTraceability({ content = '', root = '.', file = '', config } = {}) {
  const blocks = extractDotdotgodTraceabilityBlocks(content);
  if (blocks.some((block) => block.error)) {
    return { state: 'invalid', details: blocks.filter((block) => block.error).map((block) => `Invalid JSON at line ${block.line}: ${block.error}`), errors: [{ code: 'TRELLO_TRACEABILITY_INVALID', message: 'Malformed json dotdotgod traceability block.' }] };
  }
  if (blocks.length === 0) {
    const required = requiresTraceability(file, config);
    return { state: required ? 'missing' : 'not_required', details: [], errors: required ? [{ code: 'TRELLO_TRACEABILITY_MISSING', message: 'Missing required json dotdotgod traceability block.' }] : [] };
  }
  const errors = blocks.flatMap((block) => validateTraceabilityBlock(block.data, root, file, block.line, config));
  if (errors.length > 0) return { state: 'invalid', details: errors.map((error) => `${error.code}: ${error.message.split('\n')[0]}`), errors: [{ code: 'TRELLO_TRACEABILITY_INVALID', message: 'Invalid json dotdotgod traceability block.' }] };
  const latest = blocks.at(-1).data;
  const details = [];
  if (Array.isArray(latest.implementedBy) && latest.implementedBy.length > 0) details.push(`implementedBy: ${latest.implementedBy.length}`);
  if (Array.isArray(latest.verifiedBy) && latest.verifiedBy.length > 0) details.push(`verifiedBy: ${latest.verifiedBy.length}`);
  if (Array.isArray(latest.relatedDocs) && latest.relatedDocs.length > 0) details.push(`relatedDocs: ${latest.relatedDocs.length}`);
  return { state: 'present', details, errors: [] };
}

function stripFrontmatter(content = '') {
  return String(content).replace(/^---\n[\s\S]*?\n---\n?/u, '');
}

function stripCodeBlocks(content = '') {
  return String(content).replace(/```[\s\S]*?```/gu, '');
}

function compactText(value = '', maxLength = 280) {
  const compact = String(value).replace(/\s+/gu, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

export function summarizeMarkdownPreview({ content = '', file = '' } = {}) {
  const body = stripCodeBlocks(stripFrontmatter(content));
  const lines = body.split(/\r?\n/u).map((line) => line.trim());
  const title = lines.find((line) => /^#\s+\S/u.test(line))?.replace(/^#\s+/u, '').trim() || file.split('/').at(-1)?.replace(/\.md$/u, '') || '';
  const summary = compactText(lines.find((line) => line && !line.startsWith('#') && !line.startsWith('<!--') && !line.startsWith('- ') && !line.startsWith('|')) ?? '');
  return { title: compactText(title, 120), summary };
}

export function buildLinkedDocsData({ file, content = '', githubUrl, trelloUrl, syncStatus, traceability, repositoryKey } = {}) {
  const preview = summarizeMarkdownPreview({ content, file });
  return {
    docsPath: file,
    githubUrl,
    trelloUrl,
    syncStatus,
    repositoryKey,
    repositoryLabel: String(repositoryKey ?? '').split('/').filter(Boolean).at(-1) || '',
    title: preview.title,
    summary: preview.summary,
    traceabilityState: traceability?.state ?? 'not_required',
    traceabilityDetails: [...(traceability?.details ?? [])],
  };
}

