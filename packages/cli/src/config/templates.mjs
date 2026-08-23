import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defaultDotdotgodConfigData, validateMemoryConfigData } from '../memory/config.mjs';
import { isKebabCase } from '../docs/markdown.mjs';

export const DEFAULT_TEMPLATE_NAME = 'software';
export const BUILT_IN_TEMPLATE_NAMES = ['software', 'research', 'case-and-evidence', 'publication', 'portfolio', 'policy'];

const BUILT_IN_TEMPLATE_SCAFFOLDS = {
  software: [],
  research: [
    ['docs/research/README.md', 'Research', 'Use this area for research notes, sources, and findings.'],
    ['docs/record/README.md', 'Research Records', 'Use this area for dated measurements, experiments, and execution records.'],
    ['docs/report/README.md', 'Reports', 'Use this area for research diagnoses, analyses, results, and performance reports.'],
    ['outputs', null, null],
  ],
  'case-and-evidence': [
    ['docs/case/README.md', 'Case Records', 'Use this area for canonical case facts, questions, and decisions.'],
    ['docs/evidence/README.md', 'Evidence', 'Use this area for factual, legal, and other supporting evidence.'],
    ['docs/outputs/README.md', 'Case Outputs', 'Use this area for maintained case outputs.'],
  ],
  publication: [
    ['docs/outline/README.md', 'Publication Outline', 'Use this area for publication structure and outlines.'],
    ['docs/chapters/README.md', 'Chapter Plans', 'Use this area for chapter plans and direction.'],
    ['docs/claims/README.md', 'Claims', 'Use this area for maintained claims and their support.'],
    ['docs/research/README.md', 'Research Sources', 'Use this area for research sources and supporting notes.'],
    ['book', null, null],
  ],
  portfolio: [
    ['docs/strategy/README.md', 'Portfolio Strategy', 'Use this area for portfolio strategy and risk rules.'],
    ['docs/positions/README.md', 'Position Theses', 'Use this area for position theses and investment conclusions.'],
    ['docs/journal/README.md', 'Decision Journal', 'Use this area for dated investment decisions and reviews.'],
    ['docs/report/README.md', 'Market Research', 'Use this area for maintained market research and analysis.'],
    ['data', null, null],
  ],
  policy: [
    ['docs/policy/README.md', 'Policy Documents', 'Use this area for integrated policy proposals and outputs.'],
    ['docs/sections/README.md', 'Policy Sections', 'Use this area for source policy sections.'],
    ['docs/evidence/README.md', 'Policy Evidence', 'Use this area for evidence supporting policy proposals.'],
    ['docs/outputs/README.md', 'Submission Outputs', 'Use this area for maintained policy submission outputs.'],
  ],
};

export function builtInTemplateScaffold(name, { documentationRoot = 'docs' } = {}) {
  const entries = BUILT_IN_TEMPLATE_SCAFFOLDS[name];
  if (!entries) return null;
  return entries.map(([path, heading, description]) => ({
    path: path.replace(/^docs(?=\/|$)/, documentationRoot),
    type: heading ? 'file' : 'directory',
    ...(heading ? { content: `# ${heading}\n\n${description}` } : {}),
  }));
}

function area(id, label, paths, role, priority, includeBodiesByDefault = true, extra = {}) {
  return { id, label, paths, excludePaths: [], scope: 'shared', freshness: 'fresh', role, priority, includeBodiesByDefault, ...extra };
}

function localAreas() {
  return [
    { ...area('active-plan', 'Active Plans', ['docs/plan/**'], 'active-task-intent', 95), scope: 'local' },
    { ...area('archive-map', 'Archive Map', ['docs/archive/README.md'], 'historical-memory-map', 65), scope: 'local', freshness: 'stale' },
    { ...area('archive-body', 'Archive Body', ['docs/archive/**'], 'historical-memory-body', 20, false), excludePaths: ['docs/archive/README.md'], scope: 'local', freshness: 'stale' },
  ];
}

function baseAreas() {
  return [
    area('rules', 'Agent Rules', ['AGENTS.md'], 'agent-working-rules', 100),
    area('agent-entrypoint', 'Agent Entrypoints', ['CLAUDE.md', 'CODEX.md'], 'agent-specific-entrypoint', 85),
    area('project-overview', 'Project Overview', ['README.md'], 'project-map', 85),
    area('docs-index', 'Docs Index', ['docs/README.md'], 'documentation-routing-map', 90),
  ];
}

function traceability(required, keys) {
  return { required, exclude: ['**/README.md'], keys };
}

const keys = {
  software: [
    ['implementedBy', 'Implemented by', 'Files that implement the behavior.', 'path', 'implemented_by', 4],
    ['verifiedBy', 'Verified by', 'Tests or maintained verification documents.', 'path', 'verified_by', 4],
    ['relatedDocs', 'Related docs', 'Documents needed to interpret the behavior.', 'path', 'related_doc', 3],
    ['designDecisions', 'Design decisions', 'Maintained architecture or design decision documents that constrain the behavior.', 'path', 'design_decision', 3],
  ],
  research: [
    ['informedBy', 'Informed by', 'Research sources or prior findings that justify the direction.', 'path', 'informed_by', 4],
    ['assumptionsDefinedIn', 'Assumptions defined in', 'Documents defining assumptions that bound the claim.', 'path', 'assumptions_defined_in', 4],
    ['evaluatedBy', 'Evaluated by', 'Evaluation protocols or measurement methods.', 'path', 'evaluated_by', 4],
    ['evidenceRecordedIn', 'Evidence recorded in', 'Dated experiment, dataset, or validation records.', 'path', 'evidence_recorded_in', 4],
  ],
  case: [
    ['basedOn', 'Based on', 'Canonical case records, evidence, or grounds supporting the document.', 'path', 'based_on', 4],
    ['relatedDocs', 'Related docs', 'Documents needed to interpret the record.', 'path', 'related_doc', 2],
  ],
  publication: [
    ['developedIn', 'Developed in', 'Outlines or manuscript drafts that develop this design.', 'path', 'developed_in', 4],
    ['supportedBy', 'Supported by', 'Research notes and sources supporting the claims.', 'path', 'supported_by', 4],
    ['framedBy', 'Framed by', 'Documents defining purpose, scope, or conceptual boundaries.', 'path', 'framed_by', 3],
  ],
  portfolio: [
    ['supportedBy', 'Supported by', 'Data or research supporting the investment conclusion.', 'path', 'supported_by', 4],
    ['recordedIn', 'Recorded in', 'Ledgers, snapshots, or journals recording the decision.', 'path', 'recorded_in', 4],
    ['informs', 'Informs', 'Strategies, theses, or risk rules using this conclusion.', 'path', 'informs_decision', 3],
  ],
  policy: [
    ['supportedBy', 'Supported by', 'Evidence, source sections, or research supporting the proposal.', 'path', 'supported_by', 4],
    ['integratedInto', 'Integrated into', 'Integrated proposals or briefs that use this policy section.', 'path', 'integrated_into', 4],
    ['relatedDocs', 'Related docs', 'Documents needed to interpret the policy.', 'path', 'related_doc', 2],
  ],
};

function definitions(values) {
  return values.map(([key, label, description, target, relation, weight]) => ({ key, label, description, target, relation, weight }));
}

function withPolicy(areas, required, definitionsList) {
  const config = defaultDotdotgodConfigData();
  config.memory.areas = [...baseAreas(), ...areas, ...localAreas(), area('docs', 'Project Documentation', ['docs/**'], 'project-documentation', 60)];
  config.traceability = traceability(required, definitions(definitionsList));
  return config;
}

function rebaseBuiltIn(value, root) {
  if (Array.isArray(value)) return value.map(item => rebaseBuiltIn(item, root));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rebaseBuiltIn(item, root)]));
  return typeof value === 'string' ? value.replace(/^docs(?=\/|$)/, root) : value;
}

function rawBuiltInTemplateData(name) {
  if (name === 'software') return defaultDotdotgodConfigData();
  if (name === 'research') return withPolicy([
    area('spec', 'Research Specifications', ['docs/spec/**'], 'research-contract', 85),
    area('architecture', 'Architecture', ['docs/arch/**'], 'architecture-rationale', 82),
    area('test', 'Verification', ['docs/test/**'], 'test-strategy', 78),
    area('research', 'Research Notes', ['docs/research/**'], 'research-diary', 70),
    area('record', 'Research Records', ['docs/record/**'], 'research-record', 68),
    { ...area('report', 'Reports', ['docs/report/**'], 'report-background', 60), freshness: 'stale' },
    { ...area('artifacts', 'Generated Artifacts', ['outputs/**'], 'artifact-body', 10, false), scope: 'local', freshness: 'stale' },
  ], ['docs/spec/**', 'docs/report/**'], keys.research);
  if (name === 'case-and-evidence') return withPolicy([
    area('case', 'Case Record', ['docs/case/**'], 'case-truth-and-open-questions', 85),
    area('evidence', 'Evidence and Grounds', ['docs/evidence/**'], 'factual-and-legal-support', 80),
    area('outputs', 'Case Outputs', ['docs/outputs/**'], 'case-outputs', 75),
  ], ['docs/case/**', 'docs/outputs/**'], keys.case);
  if (name === 'publication') return withPolicy([
    area('brief', 'Publication Brief', ['docs/BOOK_BRIEF.md'], 'publication-direction', 100),
    area('outline', 'Publication Outline', ['docs/outline/**'], 'narrative-structure', 95),
    area('chapters', 'Chapter Plans', ['docs/chapters/**'], 'chapter-direction', 90),
    area('claims', 'Claims', ['docs/claims/**'], 'claim-registry', 90),
    area('manuscript', 'Manuscript', ['book/**'], 'manuscript', 95),
    area('research', 'Research Sources', ['docs/research/**'], 'evidence-library', 80),
  ], ['docs/chapters/**'], keys.publication);
  if (name === 'portfolio') return withPolicy([
    area('strategy', 'Portfolio Strategy', ['docs/strategy/**'], 'portfolio-strategy', 95),
    area('positions', 'Position Theses', ['docs/positions/**'], 'position-thesis', 95),
    area('ledger', 'Trading Ledger', ['data/**'], 'trading-facts', 90, false, { excludePaths: ['data/raw/**'] }),
    area('journal', 'Decision Journal', ['docs/journal/**'], 'decision-journal', 80),
    { ...area('research', 'Research', ['docs/report/**'], 'market-research', 50), freshness: 'stale' },
  ], ['docs/strategy/**', 'docs/positions/**'], keys.portfolio);
  if (name === 'policy') return withPolicy([
    area('policy', 'Policy Documents', ['docs/policy/**'], 'policy-output', 95),
    area('sections', 'Policy Sections', ['docs/sections/**'], 'policy-source-sections', 90),
    area('evidence', 'Policy Evidence', ['docs/evidence/**', 'docs/report/**'], 'policy-evidence', 80),
    area('outputs', 'Submission Outputs', ['docs/outputs/**'], 'policy-submission-output', 75),
  ], ['docs/sections/**', 'docs/outputs/**'], keys.policy);
  return null;
}

export function builtInTemplateData(name, { documentationRoot = 'docs' } = {}) {
  const data = rawBuiltInTemplateData(name);
  return data ? rebaseBuiltIn(data, documentationRoot) : null;
}

export function builtInTemplateText(name, options) {
  const data = builtInTemplateData(name, options);
  return data ? `${JSON.stringify(data, null, 2)}\n` : null;
}

export function dotdotgodHome() {
  return join(homedir(), '.dotdotgod');
}

function templateError(code, message, path = null) {
  return { ok: false, error: { code, message, ...(path ? { path } : {}) } };
}

export function resolveInitializationTemplate(explicitName = null, home = dotdotgodHome()) {
  let name = explicitName;
  let selectedBy = explicitName ? 'explicit' : 'default';
  const globalPath = join(home, 'config.json');
  if (!name && existsSync(globalPath)) {
    let globalConfig;
    try {
      globalConfig = JSON.parse(readFileSync(globalPath, 'utf8'));
    } catch (error) {
      return templateError('GLOBAL_CONFIG_INVALID_JSON', `Invalid global config JSON: ${error instanceof Error ? error.message : String(error)}`, globalPath);
    }
    if (!globalConfig || typeof globalConfig !== 'object' || Array.isArray(globalConfig)) {
      return templateError('GLOBAL_CONFIG_INVALID', 'Global config must be a JSON object.', globalPath);
    }
    if (globalConfig.defaultTemplate !== undefined && !isKebabCase(globalConfig.defaultTemplate)) {
      return templateError('GLOBAL_CONFIG_INVALID_DEFAULT_TEMPLATE', 'Global config defaultTemplate must be a kebab-case string.', globalPath);
    }
    if (globalConfig.defaultTemplate) {
      name = globalConfig.defaultTemplate;
      selectedBy = 'global';
    }
  }
  name ??= DEFAULT_TEMPLATE_NAME;
  if (!isKebabCase(name)) return templateError('TEMPLATE_INVALID_NAME', `Template name must be kebab-case: ${name}`);

  const customPath = join(home, 'templates', `${name}.json`);
  if (existsSync(customPath)) {
    let data;
    try {
      data = JSON.parse(readFileSync(customPath, 'utf8'));
    } catch (error) {
      return templateError('TEMPLATE_INVALID_JSON', `Invalid template JSON: ${error instanceof Error ? error.message : String(error)}`, customPath);
    }
    const errors = validateMemoryConfigData(data, '.', customPath);
    if (errors.length > 0) return { ok: false, error: { code: 'TEMPLATE_INVALID', message: `Custom template is invalid: ${name}`, path: customPath, errors } };
    return { ok: true, name, source: 'custom', selectedBy, path: customPath, data, text: `${JSON.stringify(data, null, 2)}\n` };
  }

  const data = builtInTemplateData(name);
  if (!data) return templateError('TEMPLATE_NOT_FOUND', `Template not found: ${name}`);
  return { ok: true, name, source: 'bundled', selectedBy, path: null, data, text: `${JSON.stringify(data, null, 2)}\n` };
}
