import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { commandUsage } from '../cli/usage.mjs';
import { isKebabCase, isUpperSnakeMarkdown, removeCodeBlocks } from '../docs/markdown.mjs';

export const PLAN_STAGE_DIRECTORIES = [
  '01-intake',
  '02-context-load',
  '03-discovery',
  '04-decomposition',
  '05-decision-queue',
  '06-approval',
  '07-execution-slices',
  '08-verify-replan-close',
];

export const PLAN_INTERNAL_WORKSPACE = '.dotdotgod-plan';
export const PLAN_INTERNAL_STAGE_DIRECTORIES = [
  ...PLAN_STAGE_DIRECTORIES,
  '09-subagent-workstreams',
];

export const PLAN_REQUIRED_HEADERS = {
  '01-intake': ['Request Summary', 'Goal', 'Scope', 'Non-goals', 'Constraints', 'Assumptions'],
  '02-context-load': ['Memory Reads', 'Impact Candidates', 'Related Files'],
  '03-discovery': ['Findings', 'Risks', 'Open Questions'],
  '04-decomposition': ['Milestones', 'Atomic Tasks', 'Role / Area Workstreams'],
  '05-decision-queue': ['Discussion Queue'],
  '06-approval': ['Approval State'],
  '07-execution-slices': ['Execution Slices'],
  '08-verify-replan-close': ['Verification Evidence', 'Replanning Triggers', 'Progress Log', 'Resume Point'],
  '09-subagent-workstreams': ['Subagent Workstreams', 'Split Plan Files', 'Todo Contract'],
};

const PLACEHOLDER_RE = /^(?:[-*\s_`]*(?:tbd|todo|n\/a|placeholder|none)[.!?\s_`]*)+$/i;
const SLICE_FILE_RE = /^SLICE_\d{2}\.md$/;
const BLOCKER_LABELS = new Map([
  ['missing-plan', 'Plan file does not exist'],
  ['invalid-plan-path', 'Plan file must be docs/plan/<task-slug>/README.md'],
  ['invalid-task-slug', 'Plan task directory must be kebab-case'],
  ['empty-plan', 'Plan README is empty'],
  ['missing-stage', 'Missing required stage directory'],
  ['missing-internal-stage', 'Missing internal stage file'],
  ['missing-stage-readme', 'Missing stage README.md'],
  ['invalid-markdown-name', 'Invalid Markdown file name'],
  ['missing-section', 'Missing required section'],
  ['empty-section', 'Required section has no content'],
  ['placeholder-section', 'Required section only contains placeholder content'],
  ['pending-workstream', 'Required workstream is pending'],
  ['unresolved-discussion', 'Discussion Queue has unresolved items'],
  ['unresolved-assumption', 'Assumptions contain unresolved items'],
  ['missing-atomic-acceptance', 'Atomic Tasks must define acceptance criteria'],
  ['missing-atomic-verification', 'Atomic Tasks must define verification'],
]);

function normalizeHeading(value) {
  return String(value ?? '').trim().toLowerCase().replace(/`/g, '').replace(/[\s/_-]+/g, ' ');
}

function projectRelative(root, file) {
  return relative(root, file).replace(/\\/g, '/');
}

function buildBlockerRepairPrompt(blocker) {
  const target = [blocker.path, blocker.stage, blocker.section ? `## ${blocker.section}` : undefined].filter(Boolean).join(' / ');
  const location = target ? ` in ${target}` : '';
  return `Update the active plan artifact${location} to resolve this blocker: ${blocker.message}`;
}

function addBlocker(blockers, code, message, details = {}) {
  const blocker = { code, message: message ?? BLOCKER_LABELS.get(code) ?? code, ...details };
  blockers.push({ ...blocker, prompt: buildBlockerRepairPrompt(blocker) });
}

function parseHeadedSections(content) {
  const sections = [];
  const lines = removeCodeBlocks(content).split(/\r?\n/);
  let current;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (match) {
      if (current) sections.push(current);
      current = { level: match[1].length, title: match[2].trim(), contentLines: [], line: index + 1 };
    } else if (current) {
      current.contentLines.push(lines[index]);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function contentHasValue(content) {
  const stripped = content
    .split(/\r?\n/)
    .filter((line) => !/^\s*<!--/.test(line))
    .join('\n')
    .trim();
  return stripped.length > 0;
}

function isPlaceholderContent(content) {
  const stripped = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*+]\s+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return Boolean(stripped) && PLACEHOLDER_RE.test(stripped);
}

function readMarkdownFiles(stageDir) {
  if (!existsSync(stageDir)) return [];
  return readdirSync(stageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(stageDir, entry.name));
}

function internalWorkspaceDir(taskDir) {
  return join(taskDir, PLAN_INTERNAL_WORKSPACE);
}

export function internalStageFileName(stageName) {
  const match = /^(\d{2})-(.+)$/.exec(stageName);
  if (!match) return `${String(stageName).replace(/-/g, '_').toUpperCase()}.md`;
  return `${match[1]}_${match[2].replace(/-/g, '_').toUpperCase()}.md`;
}

function internalStageFile(taskDir, stageName) {
  return join(internalWorkspaceDir(taskDir), internalStageFileName(stageName));
}

function hasInternalWorkspace(taskDir) {
  const workspace = internalWorkspaceDir(taskDir);
  return existsSync(workspace) && statSync(workspace).isDirectory();
}

function discoverDurablePlanMarkdownFiles(taskDir) {
  const results = [];
  function walk(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === PLAN_INTERNAL_WORKSPACE || entry.isSymbolicLink()) continue;
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) results.push(entryPath);
    }
  }
  walk(taskDir);
  return results.sort((left, right) => {
    if (basename(left) === 'README.md' && dirname(left) === taskDir) return -1;
    if (basename(right) === 'README.md' && dirname(right) === taskDir) return 1;
    return left.localeCompare(right);
  });
}

function readInternalStageState(taskDir, stageName) {
  const file = internalStageFile(taskDir, stageName);
  if (!existsSync(file)) return undefined;
  const content = readFileSync(file, 'utf8');
  return { file, content };
}

function validateInternalStageState(root, taskDir, stageName, blockers) {
  const state = readInternalStageState(taskDir, stageName);
  if (!state) return;
  const stage = contentMatch(state.content, /^Stage:\s*(\S+)\s*$/m);
  const status = contentMatch(state.content, /^Status:\s*(created|blocked|completed)\s*$/m);
  const updated = contentMatch(state.content, /^Updated:\s*(\S+)\s*$/m);
  const rel = projectRelative(root, state.file);
  const looksLikeGeneratorState = /^Stage:\s*\S+\s*$/m.test(state.content) || /^Status:\s*\S+\s*$/m.test(state.content) || /^Updated:\s*\S+\s*$/m.test(state.content);
  if (!looksLikeGeneratorState) return;
  if (stage && stage !== stageName) addBlocker(blockers, 'missing-internal-stage', `Internal stage file has wrong Stage field: ${rel}`, { path: rel, stage: stageName });
  if (!stage) addBlocker(blockers, 'missing-internal-stage', `Internal stage file is missing Stage: ${rel}`, { path: rel, stage: stageName });
  if (!status) addBlocker(blockers, 'missing-internal-stage', `Internal stage file is missing valid Status: ${rel}`, { path: rel, stage: stageName });
  if (!updated) addBlocker(blockers, 'missing-internal-stage', `Internal stage file is missing Updated: ${rel}`, { path: rel, stage: stageName });
}

function contentMatch(content, pattern) {
  return pattern.exec(content)?.[1];
}

function findSection(files, header) {
  const wanted = normalizeHeading(header);
  let fallback;
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const section of parseHeadedSections(content)) {
      if (section.level < 2 || normalizeHeading(section.title) !== wanted) continue;
      const found = { file, section, content: section.contentLines.join('\n') };
      const isTaskReadme = basename(file) === 'README.md';
      if (isTaskReadme || contentHasValue(found.content)) return found;
      fallback ??= found;
    }
  }
  return fallback;
}

function validateMarkdownNames(root, stageName, stageDir, blockers) {
  for (const file of readMarkdownFiles(stageDir)) {
    const name = basename(file);
    const valid = stageName === '07-execution-slices' && SLICE_FILE_RE.test(name) ? true : isUpperSnakeMarkdown(name);
    if (!valid) {
      addBlocker(blockers, 'invalid-markdown-name', `Invalid Markdown file name: ${projectRelative(root, file)}`, { path: projectRelative(root, file) });
    }
  }
}

function sectionContains(content, words) {
  const normalized = content.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

function hasPendingRequiredWorkstream(content) {
  return content.split(/\r?\n/).some((line) => {
    const normalized = line.toLowerCase();
    if (!normalized.includes('pending')) return false;
    return /\byes\b|\brequired\b/.test(normalized);
  });
}

function hasUnresolvedDiscussion(content) {
  return content.split(/\r?\n/).some((line) => {
    const normalized = line.toLowerCase();
    if (/^\s*-\s*\[\s\]/.test(line)) return true;
    return /status\s*:\s*(open|research[-_ ]requested|plan[-_ ]revision[-_ ]requested|unresolved|pending)/.test(normalized);
  });
}

function hasUnresolvedAssumption(content) {
  return content.split(/\r?\n/).some((line) => {
    const normalized = line.toLowerCase();
    if (/^\s*-\s*\[\s\]/.test(line)) return true;
    return /\b(unresolved|pending|unknown|needs user|needs confirmation)\b/.test(normalized);
  });
}

export function buildPlanValidationRepairPrompt(result) {
  if (result.ok) return undefined;
  const lines = [
    `Refine the active plan artifact so \`dotdotgod plan validate ${result.planPath} --json\` passes.`,
    'Address every blocker below by editing the active plan files, preserving user decisions and marking unresolved questions in the Discussion Queue instead of guessing.',
    '',
    'Blockers:',
  ];
  for (const blocker of result.blockers) {
    const location = [blocker.path, blocker.stage, blocker.section ? `## ${blocker.section}` : undefined].filter(Boolean).join(' / ');
    lines.push(`- ${blocker.code}${location ? ` (${location})` : ''}: ${blocker.message}`);
  }
  lines.push('', 'After edits, rerun the plan validation command and summarize remaining blockers if any.');
  return lines.join('\n');
}

function withPlanValidationRepairPrompt(result) {
  if (result.ok) return result;
  return { ...result, repairPrompt: buildPlanValidationRepairPrompt(result) };
}

function buildPlanValidationNextStagePrompt(planPath, stage, stagePath) {
  return [
    `Continue Plan Mode stage advancement for ${planPath}.`,
    `Current stage: ${stage}.`,
    `Make ${planPath} satisfy the current stage's durable README requirements first. Use ${stagePath} only as an optional checkpoint/workflow note for this stage; do not make numbered checkpoint creation the goal and do not create later checkpoint files yet.`,
    stage === '09-subagent-workstreams' ? 'For this stage, ensure the durable README or split UPPER_SNAKE_CASE workstream plan files expose numbered `Plan:` sections so Pi can extract todos during execution.' : undefined,
    `After completing this stage, stop and rerun \`dotdotgod plan validate ${planPath} --stage ${stage} --json\`.`,
  ].filter(Boolean).join('\n\n');
}

function buildNextStageDetails(root, taskDir, relPlanPath, stageName) {
  const stagePath = projectRelative(root, internalStageFile(taskDir, stageName));
  return {
    stage: stageName,
    path: stagePath,
    prompt: buildPlanValidationNextStagePrompt(relPlanPath, stageName, stagePath),
  };
}

export function resolvePlanValidationStage(stageValue) {
  const value = String(stageValue ?? '').trim();
  if (!value) return undefined;
  const matches = PLAN_INTERNAL_STAGE_DIRECTORIES.filter((stage) => stage === value || stage.startsWith(value));
  return matches.length === 1 ? matches[0] : undefined;
}

function buildPlanValidationSummary(selectedStage, stagesForFullValidation = PLAN_STAGE_DIRECTORIES) {
  const stages = selectedStage ? [selectedStage] : stagesForFullValidation;
  return {
    stages: { total: stages.length, present: 0, valid: 0, ...(selectedStage ? { selected: selectedStage } : {}) },
    requiredSections: { total: stages.flatMap((stage) => PLAN_REQUIRED_HEADERS[stage] ?? []).length, present: 0, valid: 0 },
    splitFiles: { detected: false },
  };
}

export function validatePlanArtifact(planPath, options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const absolutePlanPath = isAbsolute(planPath) ? planPath : resolve(root, planPath);
  const selectedStage = resolvePlanValidationStage(options.stage);
  const blockers = [];
  const warnings = [];

  if (!existsSync(absolutePlanPath)) {
    addBlocker(blockers, 'missing-plan', `Plan file does not exist: ${projectRelative(root, absolutePlanPath)}`, { path: projectRelative(root, absolutePlanPath) });
    return withPlanValidationRepairPrompt({ ok: false, planPath: projectRelative(root, absolutePlanPath), blockers, warnings, summary: buildPlanValidationSummary(selectedStage) });
  }

  const taskDir = dirname(absolutePlanPath);
  const taskSlug = basename(taskDir);
  const expectedPrefix = `docs/plan/${taskSlug}/README.md`;
  const relPlanPath = projectRelative(root, absolutePlanPath);
  if (relPlanPath !== expectedPrefix) {
    addBlocker(blockers, 'invalid-plan-path', `Plan file must be docs/plan/<task-slug>/README.md: ${relPlanPath}`, { path: relPlanPath });
  }
  if (!isKebabCase(taskSlug)) {
    addBlocker(blockers, 'invalid-task-slug', `Plan task directory must be kebab-case: ${taskSlug}`, { path: projectRelative(root, taskDir) });
  }
  if (!contentHasValue(readFileSync(absolutePlanPath, 'utf8'))) {
    addBlocker(blockers, 'empty-plan', `Plan README is empty: ${relPlanPath}`, { path: relPlanPath });
  }

  const stagesForFullValidation = PLAN_INTERNAL_STAGE_DIRECTORIES;
  const summary = buildPlanValidationSummary(selectedStage, stagesForFullValidation);
  const stagesToValidate = selectedStage ? [selectedStage] : stagesForFullValidation;
  const durableFiles = discoverDurablePlanMarkdownFiles(taskDir);
  if (durableFiles.length > 1) summary.splitFiles.detected = true;
  for (const stageName of stagesToValidate) {
    validateInternalStageState(root, taskDir, stageName, blockers);
    const files = durableFiles.length > 0 ? durableFiles : [absolutePlanPath];
    const stageReadme = absolutePlanPath;
    summary.stages.present += 1;
    let stageValid = true;
    for (const header of PLAN_REQUIRED_HEADERS[stageName]) {
      const found = findSection(files, header);
      if (!found) {
        stageValid = false;
        addBlocker(blockers, 'missing-section', `Missing required section: ## ${header}`, { path: projectRelative(root, stageReadme), stage: stageName, section: header });
        continue;
      }
      summary.requiredSections.present += 1;
      const relFound = projectRelative(root, found.file);
      if (!contentHasValue(found.content)) {
        stageValid = false;
        addBlocker(blockers, 'empty-section', `Required section has no content: ## ${header}`, { path: relFound, stage: stageName, section: header });
        continue;
      }
      if (isPlaceholderContent(found.content)) {
        stageValid = false;
        addBlocker(blockers, 'placeholder-section', `Required section only contains placeholder content: ## ${header}`, { path: relFound, stage: stageName, section: header });
        continue;
      }
      summary.requiredSections.valid += 1;

      if (header === 'Atomic Tasks') {
        if (!sectionContains(found.content, ['acceptance'])) {
          stageValid = false;
          addBlocker(blockers, 'missing-atomic-acceptance', 'Atomic Tasks must define acceptance criteria.', { path: relFound, stage: stageName, section: header });
        }
        if (!sectionContains(found.content, ['verification', 'verify'])) {
          stageValid = false;
          addBlocker(blockers, 'missing-atomic-verification', 'Atomic Tasks must define verification.', { path: relFound, stage: stageName, section: header });
        }
      }
      if (header === 'Role / Area Workstreams' && hasPendingRequiredWorkstream(found.content)) {
        stageValid = false;
        addBlocker(blockers, 'pending-workstream', 'Required role/area workstream is pending.', { path: relFound, stage: stageName, section: header });
      }
      if (header === 'Discussion Queue' && hasUnresolvedDiscussion(found.content)) {
        stageValid = false;
        addBlocker(blockers, 'unresolved-discussion', 'Discussion Queue has unresolved items.', { path: relFound, stage: stageName, section: header });
      }
      if (header === 'Assumptions' && hasUnresolvedAssumption(found.content)) {
        stageValid = false;
        addBlocker(blockers, 'unresolved-assumption', 'Assumptions contain unresolved items.', { path: relFound, stage: stageName, section: header });
      }
    }
    if (stageValid) summary.stages.valid += 1;
  }

  const result = { ok: blockers.length === 0, planPath: relPlanPath, blockers, warnings, summary, ...(selectedStage ? { stage: selectedStage } : {}) };
  if (result.ok && selectedStage) {
    const stageIndex = PLAN_INTERNAL_STAGE_DIRECTORIES.indexOf(selectedStage);
    const nextStageName = stageIndex >= 0 ? PLAN_INTERNAL_STAGE_DIRECTORIES[stageIndex + 1] : undefined;
    if (nextStageName) result.nextStage = buildNextStageDetails(root, taskDir, relPlanPath, nextStageName);
  }
  return withPlanValidationRepairPrompt(result);
}

export function formatPlanValidationText(result) {
  const stageSuffix = result.stage ? ` (${result.stage})` : '';
  if (result.ok) {
    const lines = [`✅ Plan validation passed: ${result.planPath}${stageSuffix}`, `Stages: ${result.summary.stages.valid}/${result.summary.stages.total}`, `Required sections: ${result.summary.requiredSections.valid}/${result.summary.requiredSections.total}`];
    if (result.nextStage?.prompt) lines.push('', 'Next stage:', result.nextStage.prompt);
    return lines.join('\n');
  }
  const lines = [`❌ Plan validation failed: ${result.planPath}${stageSuffix}`, '', 'Blockers:'];
  for (const blocker of result.blockers) {
    lines.push(`- ${blocker.message}`);
  }
  if (result.repairPrompt) {
    lines.push('', 'Agent prompt:', result.repairPrompt);
  }
  lines.push('', 'Next:', '- refine the plan before execution');
  return lines.join('\n');
}

export function runPlan(args) {
  const [subcommand, planPath, ...rest] = args;
  if (subcommand !== 'validate') {
    console.error(`Unknown plan command: ${subcommand ?? ''}`.trim());
    console.error(commandUsage('plan'));
    process.exit(2);
  }
  if (!planPath || planPath.startsWith('-')) {
    console.error('Missing plan path.');
    console.error(commandUsage('plan validate'));
    process.exit(2);
  }
  const json = rest.includes('--json');
  let stage;
  let stageProvided = false;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') continue;
    if (arg === '--stage') {
      stageProvided = true;
      stage = rest[index + 1];
      if (!stage || stage.startsWith('-')) {
        console.error('Missing plan validation stage.');
        console.error(commandUsage('plan validate'));
        process.exit(2);
      }
      index += 1;
      continue;
    }
    console.error(`Unknown plan validate option: ${arg}`);
    console.error(commandUsage('plan validate'));
    process.exit(2);
  }
  if (stageProvided && !resolvePlanValidationStage(stage)) {
    console.error(`Invalid plan validation stage: ${stage}`);
    console.error(commandUsage('plan validate'));
    process.exit(2);
  }
  const result = validatePlanArtifact(planPath, { stage });
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(formatPlanValidationText(result));
  process.exit(result.ok ? 0 : 1);
}
