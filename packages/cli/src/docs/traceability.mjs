import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { rel } from '../common/paths.mjs';

function isSecretIndexPath(path) {
  return /(^|\/)(\.env|\.npmrc|\.pypirc|id_rsa|id_dsa|id_ed25519|credentials|secrets?)(\.|\/|$)/i.test(path);
}

const TRACEABILITY_PATH_FIELDS = ['implementedBy', 'verifiedBy', 'relatedDocs'];
const TRACEABILITY_COMMAND_FIELDS = ['verificationCommands'];

export function traceabilityExample() {
  return 'Expected dotdotgod traceability block:\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/..."],\n  "verifiedBy": ["packages/..."],\n  "relatedDocs": ["docs/..."],\n  "verificationCommands": ["pnpm ..."]\n}\n```\n\nProperty guidance:\n- kind: use "spec" for behavior specs.\n- implementedBy: source/config/script files that implement this spec\'s behavior.\n- verifiedBy: test files or verification docs that check this behavior.\n- relatedDocs: docs with relevant architecture, test strategy, or product context.\n- verificationCommands: commands an agent can run to verify this behavior.';
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
      blocks.push({ data: JSON.parse(raw), raw, line });
    } catch (error) {
      blocks.push({ error: error instanceof Error ? error.message : String(error), raw, line });
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

export function validateTraceabilityBlock(data, root, file, line = null) {
  const errors = [];
  const add = (code, field, message) => errors.push(traceabilityFieldError(rel(root, file), code, field, message, line));
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    add('TRACEABILITY_INVALID_JSON', null, 'Traceability block must be a JSON object.');
    return errors;
  }
  if (data.kind !== 'spec') add('TRACEABILITY_INVALID_KIND', 'kind', 'must be "spec" for behavior specs.');
  for (const field of TRACEABILITY_PATH_FIELDS) {
    if (!Array.isArray(data[field])) {
      add('TRACEABILITY_INVALID_FIELD', field, 'must be an array of local relative paths.');
      continue;
    }
    for (const value of data[field]) {
      if (!isLocalRelativeTraceabilityPath(value)) {
        add('TRACEABILITY_INVALID_PATH', field, `invalid local relative path: ${JSON.stringify(value)}.`);
        continue;
      }
      if (!existsSync(resolve(root, value))) add('TRACEABILITY_MISSING_TARGET', field, `target does not exist: ${value}.`);
    }
  }
  for (const field of TRACEABILITY_COMMAND_FIELDS) {
    if (!Array.isArray(data[field])) {
      add('TRACEABILITY_INVALID_FIELD', field, 'must be an array of executable project-local command strings.');
      continue;
    }
    for (const value of data[field]) if (typeof value !== 'string' || value.trim().length === 0) add('TRACEABILITY_INVALID_COMMAND', field, `invalid command: ${JSON.stringify(value)}.`);
  }
  return errors;
}

