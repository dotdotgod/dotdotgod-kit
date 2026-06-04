import { existsSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { rel } from '../common/paths.mjs';
import { defaultMemoryConfig, resolveMemoryArea } from '../memory/config.mjs';

function isSecretIndexPath(path) {
  return /(^|\/)(\.env|\.npmrc|\.pypirc|id_rsa|id_dsa|id_ed25519|credentials|secrets?)(\.|\/|$)/i.test(path);
}

const TRACEABILITY_PATH_FIELDS = ['implementedBy', 'verifiedBy', 'relatedDocs'];
const TRACEABILITY_COMMAND_FIELDS = ['verificationCommands'];
const CONTRACT_ALLOWED_FIELDS = new Set(['id', 'title', 'sections', ...TRACEABILITY_PATH_FIELDS, ...TRACEABILITY_COMMAND_FIELDS]);
export const TRACEABILITY_LINKS_START = '<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->';
export const TRACEABILITY_LINKS_END = '<!-- dotdotgod:traceability-links:end -->';

export function traceabilityExample() {
  return 'Expected dotdotgod traceability block:\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/..."],\n  "verifiedBy": ["packages/..."],\n  "relatedDocs": ["docs/..."],\n  "verificationCommands": ["pnpm ..."],\n  "contracts": [{\n    "id": "FEATURE-BEHAVIOR-001",\n    "title": "Focused behavior contract",\n    "sections": ["Focused Behavior"],\n    "implementedBy": ["packages/..."],\n    "verifiedBy": ["packages/..."],\n    "relatedDocs": ["docs/..."],\n    "verificationCommands": ["pnpm ..."]\n  }]\n}\n```\n\nProperty guidance:\n- kind: use "spec" for behavior specs.\n- implementedBy: source/config/script files that implement this spec\'s behavior.\n- verifiedBy: test files or verification docs that check this behavior.\n- relatedDocs: docs with relevant architecture, test strategy, or product context.\n- verificationCommands: commands an agent can run to verify this behavior.\n- contracts: optional focused behavior contracts; each contract requires non-empty id and title, may include sections as navigation hints, and may include the same path and command fields. Unknown contract fields are validation errors.';
}

function lineForOffset(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

export function extractDotdotgodTraceabilityBlocks(content) {
  const blocks = [];
  const re = /^(`{3,}|~{3,})[ \t]*([^\n]*)\n([\s\S]*?)\n\1[ \t]*$/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    const info = match[2].trim().toLowerCase().split(/\s+/);
    if (!info.includes('json') || !info.includes('dotdotgod')) continue;
    const raw = match[3].trim();
    const line = lineForOffset(content, match.index);
    try {
      blocks.push({ data: JSON.parse(raw), raw, line, index: match.index, end: re.lastIndex });
    } catch (error) {
      blocks.push({ error: error instanceof Error ? error.message : String(error), raw, line, index: match.index, end: re.lastIndex });
    }
  }
  return blocks;
}

export function isLocalRelativeTraceabilityPath(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return false;
  if (value.startsWith('/') || value.startsWith('~') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  if (value.split('/').includes('..')) return false;
  return !isSecretIndexPath(value);
}

function traceabilityFieldError(file, code, field, message, line = null) {
  return { file, line, code, message: `${field ? `Field "${field}": ` : ''}${message}\nFix: update the traceability block so it matches the expected schema and points to existing project files or commands.\n\n${traceabilityExample()}` };
}

export function validateTraceabilityPlacement(content, root, file) {
  const headings = [...content.matchAll(/^##\s+(.+)$/gm)];
  const lastHeading = headings.at(-1)?.[1]?.trim();
  if (lastHeading !== 'Traceability') {
    return [traceabilityFieldError(rel(root, file), 'TRACEABILITY_PLACEMENT', null, 'Traceability must be the final section in behavior specs.')];
  }
  return [];
}

function allMarkerIndexes(content, marker) {
  const indexes = [];
  let index = content.indexOf(marker);
  while (index !== -1) {
    indexes.push(index);
    index = content.indexOf(marker, index + marker.length);
  }
  return indexes;
}

export function findTraceabilityLinksRegion(content) {
  const starts = allMarkerIndexes(content, TRACEABILITY_LINKS_START);
  const ends = allMarkerIndexes(content, TRACEABILITY_LINKS_END);
  if (starts.length === 0 && ends.length === 0) return { status: 'missing' };
  if (starts.length !== 1 || ends.length !== 1) return { status: 'invalid', code: 'TRACEABILITY_LINKS_MARKER_COUNT', message: 'Traceability links region must contain exactly one start marker and one end marker.' };
  const start = starts[0];
  const end = ends[0];
  if (start > end) return { status: 'invalid', code: 'TRACEABILITY_LINKS_MARKER_ORDER', message: 'Traceability links start marker must appear before the end marker.' };
  return { status: 'present', start, end: end + TRACEABILITY_LINKS_END.length };
}

export function validateTraceabilityLinksRegion(content, root, file) {
  const region = findTraceabilityLinksRegion(content);
  if (region.status !== 'invalid') return [];
  return [traceabilityFieldError(rel(root, file), region.code, null, region.message)];
}

export function stripTraceabilityLinksRegion(content) {
  const ranges = [];
  const region = findTraceabilityLinksRegion(content);
  if (region.status === 'present') ranges.push({ start: region.start, end: region.end });
  for (const block of extractDotdotgodTraceabilityBlocks(content)) ranges.push({ start: block.index, end: block.end });
  if (ranges.length === 0) return content;
  return ranges
    .sort((a, b) => b.start - a.start)
    .reduce((next, range) => `${next.slice(0, range.start)}${next.slice(range.end)}`, content);
}

function markdownLinkPath(root, file, target) {
  const fromDir = dirname(file);
  const absoluteTarget = resolve(root, target);
  let link = relative(fromDir, absoluteTarget).split('\\').join('/');
  if (!link.startsWith('.') && !link.startsWith('/')) link = link || basename(target);
  return link;
}

function escapeMarkdownText(value) {
  return String(value).replace(/([\\[\\]])/g, '\\$1');
}

function escapeCodeSpan(value) {
  return String(value).replace(/`/g, '\\`');
}

function labelForTraceabilityPath(path) {
  return path;
}

function renderPathList(title, paths, root, file) {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const lines = [`- ${title}:`];
  for (const target of paths) lines.push(`  - [${escapeMarkdownText(labelForTraceabilityPath(target))}](${markdownLinkPath(root, file, target)})`);
  return lines;
}

function renderCommandList(commands) {
  if (!Array.isArray(commands) || commands.length === 0) return [];
  return ['- Verification commands:', ...commands.map((command) => `  - \`${escapeCodeSpan(command)}\``)];
}

function renderContractList(contracts) {
  if (!Array.isArray(contracts) || contracts.length === 0) return [];
  const lines = ['- Contracts:'];
  for (const contract of contracts) {
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) continue;
    const id = typeof contract.id === 'string' ? contract.id : '<missing-id>';
    const title = typeof contract.title === 'string' ? contract.title : '<missing-title>';
    const details = [];
    if (Array.isArray(contract.sections) && contract.sections.length > 0) details.push(`sections: ${contract.sections.length}`);
    for (const [field, label] of [['implementedBy', 'impl'], ['verifiedBy', 'verify'], ['relatedDocs', 'docs'], ['verificationCommands', 'commands']]) {
      if (Array.isArray(contract[field]) && contract[field].length > 0) details.push(`${label}: ${contract[field].length}`);
    }
    lines.push(`  - \`${escapeCodeSpan(id)}\` — ${escapeMarkdownText(title)}${details.length > 0 ? ` (${details.join(', ')})` : ''}`);
  }
  return lines;
}

export function renderTraceabilityLinks(data, root, file) {
  const body = [
    '### Traceability Links',
    '',
    ...renderPathList('Implemented by', data?.implementedBy, root, file),
    ...renderPathList('Verified by', data?.verifiedBy, root, file),
    ...renderPathList('Related docs', data?.relatedDocs, root, file),
    ...renderCommandList(data?.verificationCommands),
    ...renderContractList(data?.contracts),
  ];
  return `${TRACEABILITY_LINKS_START}\n<!-- generated: do not edit manually -->\n\n${body.join('\n')}\n\n${TRACEABILITY_LINKS_END}`;
}

export function renderCompactTraceabilityBlock(data) {
  return `\`\`\`json dotdotgod\n${JSON.stringify(data)}\n\`\`\``;
}

export function syncTraceabilityLinksInContent(content, data, root, file) {
  const region = findTraceabilityLinksRegion(content);
  if (region.status === 'invalid') return { ok: false, changed: false, errors: validateTraceabilityLinksRegion(content, root, file) };
  const generated = renderTraceabilityLinks(data, root, file);
  const blocks = extractDotdotgodTraceabilityBlocks(content).filter((block) => !block.error);
  if (blocks.length === 0) return { ok: false, changed: false, errors: [traceabilityFieldError(rel(root, file), 'TRACEABILITY_LINKS_MISSING_BLOCK', null, 'Cannot generate traceability links without a valid `json dotdotgod` block.')] };
  const block = blocks.at(-1);
  const compactBlock = renderCompactTraceabilityBlock(data);
  let next = `${content.slice(0, block.index)}${compactBlock}${content.slice(block.end)}`;
  const adjustedRegion = region.status === 'present' && region.start > block.index
    ? { start: region.start - (block.end - block.index) + compactBlock.length, end: region.end - (block.end - block.index) + compactBlock.length }
    : region;
  if (adjustedRegion.status === 'present') {
    next = `${next.slice(0, adjustedRegion.start)}${generated}${next.slice(adjustedRegion.end)}`;
    return { ok: true, changed: next !== content, content: next };
  }
  const refreshedBlocks = extractDotdotgodTraceabilityBlocks(next).filter((item) => !item.error);
  const refreshedBlock = refreshedBlocks.at(-1);
  const prefix = next.slice(0, refreshedBlock.index).replace(/[ \t]*$/u, '');
  const suffix = next.slice(refreshedBlock.index);
  next = `${prefix}\n\n${generated}\n\n${suffix}`;
  return { ok: true, changed: next !== content, content: next };
}

function validateTraceabilityPathArray(data, field, add, root, config, { required = true, displayField = field } = {}) {
  if (data[field] === undefined && !required) return;
  if (!Array.isArray(data[field])) {
    add('TRACEABILITY_INVALID_FIELD', displayField, 'must be an array of local relative paths.');
    return;
  }
  for (const value of data[field]) {
    if (!isLocalRelativeTraceabilityPath(value)) {
      add('TRACEABILITY_INVALID_PATH', displayField, `invalid local relative path: ${JSON.stringify(value)}.`);
      continue;
    }
    const area = resolveMemoryArea(value, config);
    if (area?.scope === 'local') {
      add('TRACEABILITY_LOCAL_MEMORY_TARGET', displayField, `target points to local memory area "${area.id}": ${value}. Traceability must point to shared durable files, not active plans or archive memory.`);
      continue;
    }
    if (!existsSync(resolve(root, value))) add('TRACEABILITY_MISSING_TARGET', displayField, `target does not exist: ${value}.`);
  }
}

function validateTraceabilityCommandArray(data, field, add, { required = true, displayField = field } = {}) {
  if (data[field] === undefined && !required) return;
  if (!Array.isArray(data[field])) {
    add('TRACEABILITY_INVALID_FIELD', displayField, 'must be an array of executable project-local command strings.');
    return;
  }
  for (const value of data[field]) if (typeof value !== 'string' || value.trim().length === 0) add('TRACEABILITY_INVALID_COMMAND', displayField, `invalid command: ${JSON.stringify(value)}.`);
}

function validateTraceabilityContracts(data, root, add, config) {
  if (data.contracts === undefined) return;
  if (!Array.isArray(data.contracts)) {
    add('TRACEABILITY_INVALID_FIELD', 'contracts', 'must be an array of focused contract objects.');
    return;
  }
  const ids = new Set();
  for (const [index, contract] of data.contracts.entries()) {
    const base = `contracts[${index}]`;
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
      add('TRACEABILITY_INVALID_FIELD', base, 'must be an object with non-empty id and title fields.');
      continue;
    }
    for (const field of Object.keys(contract)) {
      if (!CONTRACT_ALLOWED_FIELDS.has(field)) add('TRACEABILITY_INVALID_FIELD', `${base}.${field}`, 'is not a supported contract field.');
    }
    if (typeof contract.id !== 'string' || contract.id.trim().length === 0) {
      add('TRACEABILITY_INVALID_FIELD', `${base}.id`, 'must be a non-empty stable contract ID string.');
    } else if (ids.has(contract.id)) {
      add('TRACEABILITY_INVALID_FIELD', `${base}.id`, `duplicates contract id ${JSON.stringify(contract.id)} in this traceability block.`);
    } else {
      ids.add(contract.id);
    }
    if (typeof contract.title !== 'string' || contract.title.trim().length === 0) add('TRACEABILITY_INVALID_FIELD', `${base}.title`, 'must be a non-empty human-readable contract title.');
    if (contract.sections !== undefined) {
      if (!Array.isArray(contract.sections)) add('TRACEABILITY_INVALID_FIELD', `${base}.sections`, 'must be an array of same-file heading titles.');
      else for (const [sectionIndex, section] of contract.sections.entries()) {
        if (typeof section !== 'string' || section.trim().length === 0) add('TRACEABILITY_INVALID_FIELD', `${base}.sections[${sectionIndex}]`, 'must be a non-empty heading title string.');
      }
    }
    for (const field of TRACEABILITY_PATH_FIELDS) validateTraceabilityPathArray(contract, field, add, root, config, { required: false, displayField: `${base}.${field}` });
    for (const field of TRACEABILITY_COMMAND_FIELDS) validateTraceabilityCommandArray(contract, field, add, { required: false, displayField: `${base}.${field}` });
  }
}

export function validateTraceabilityBlock(data, root, file, line = null, config = defaultMemoryConfig()) {
  const errors = [];
  const add = (code, field, message) => errors.push(traceabilityFieldError(rel(root, file), code, field, message, line));
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    add('TRACEABILITY_INVALID_JSON', null, 'Traceability block must be a JSON object.');
    return errors;
  }
  if (data.kind !== 'spec') add('TRACEABILITY_INVALID_KIND', 'kind', 'must be "spec" for behavior specs.');
  for (const field of TRACEABILITY_PATH_FIELDS) validateTraceabilityPathArray(data, field, add, root, config);
  for (const field of TRACEABILITY_COMMAND_FIELDS) validateTraceabilityCommandArray(data, field, add);
  validateTraceabilityContracts(data, root, add, config);
  return errors;
}

