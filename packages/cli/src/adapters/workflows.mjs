import { readFileSync } from 'node:fs';
import { adapterError } from './errors.mjs';

const WORKFLOW_NAMES = new Set(['load', 'init', 'plan', 'impact', 'doc-clarify']);

export function readWorkflow(name) {
  if (!WORKFLOW_NAMES.has(name)) throw adapterError('INVALID_ARGUMENT');
  return readFileSync(new URL(`../../assets/workflows/${name}.md`, import.meta.url), 'utf8');
}
