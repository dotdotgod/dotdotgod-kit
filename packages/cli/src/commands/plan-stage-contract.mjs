export const PLAN_STAGE_DIRECTORIES = [
  '01-intake',
  '02-context-load',
  '03-discovery',
  '04-plan',
];

export const PLAN_INTERNAL_WORKSPACE = '.dotdotgod-plan';

export const PLAN_INTERNAL_STAGE_DIRECTORIES = [
  ...PLAN_STAGE_DIRECTORIES,
  '05-workstream-handoff',
];

export const PLAN_REQUIRED_HEADERS = {
  '01-intake': ['Request Summary', 'Goal', 'Scope', 'Non-goals', 'Constraints', 'Assumptions'],
  '02-context-load': ['Memory Reads', 'Impact Candidates', 'Related Files'],
  '03-discovery': ['Findings', 'Risks', 'Open Questions'],
  '04-plan': ['Milestones', 'Atomic Tasks', 'Validation Plan', 'Resume Point'],
  '05-workstream-handoff': ['Workstream Handoff', 'Todo Contract'],
};

export const PLAN_CONSTRUCTION_CHECKLISTS = {
  '01-intake': ['Requirements', 'Constraints', 'Failure paths', 'Data shape', 'Verification', 'Integration impact'],
  '02-context-load': ['Memory reads', 'Impact candidates', 'Related files', 'Boundary risk'],
  '03-discovery': ['Findings', 'Risks', 'Open questions', 'Extension points'],
  '04-plan': ['Milestones', 'Atomic tasks', 'Validation plan', 'Resume point'],
  '05-workstream-handoff': ['Handoffs', 'Do-not rules', 'Focused verification', 'Chat-independent context'],
};

export const PLAN_BLOCKER_LABELS = new Map([
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
  ['missing-construction-checklist', 'Missing construction checklist'],
  ['missing-checklist-item', 'Missing construction checklist item'],
  ['malformed-checklist-item', 'Malformed construction checklist item'],
  ['open-checklist-item', 'Construction checklist item is open'],
  ['placeholder-checklist-item', 'Construction checklist item only contains placeholder content'],
]);

export function buildPlanValidationNextStagePrompt(planPath, stage, stagePath) {
  return [
    `Continue Plan Mode stage advancement for ${planPath}.`,
    `Current stage: ${stage}.`,
    `Make ${planPath} satisfy the current stage's durable README requirements first. Use ${stagePath} only as an optional checkpoint/workflow note for this stage; do not make numbered checkpoint creation the goal and do not create later checkpoint files yet.`,
    stage === '05-workstream-handoff' ? 'For this stage, ensure the durable README or split UPPER_SNAKE_CASE workstream plan files expose numbered `Plan:` sections so Pi can extract todos during execution. For small plans, explicitly state that no split is needed.' : undefined,
    `After completing this stage, stop and rerun \`dotdotgod plan validate ${planPath} --stage ${stage} --json\`.`,
  ].filter(Boolean).join('\n\n');
}
