export type PlanGeneratorStageId =
  | "01-intake"
  | "02-context-load"
  | "03-discovery"
  | "04-plan"
  | "05-workstream-handoff";

export interface PlanGeneratorStageEnvironment {
  id: PlanGeneratorStageId;
  title: string;
  nextStage?: PlanGeneratorStageId | undefined;
  checkpointFileName: string;
  requiredSections: readonly string[];
  constructionChecklist: readonly string[];
  authoringPrompt: string;
  retryPrompt: string;
  evaluationPrompt: string;
  nextContextPrompt?: string | undefined;
  handoffPrompt: string;
}

export interface PlanGeneratorStageCheckpointContext {
  path: string;
  content?: string | undefined;
  truncated?: boolean | undefined;
  unavailable?: string | undefined;
}

export const PLAN_GENERATOR_HELP = `Usage:
/plan-generator
/plan-generator <request>
/plan-generator docs/plan/<task>/README.md
/plan-generator --help`;

export const STAGE_01_ID: PlanGeneratorStageId = "01-intake";
export const STAGE_02_ID: PlanGeneratorStageId = "02-context-load";
export const STAGE_03_ID: PlanGeneratorStageId = "03-discovery";
export const NEXT_STAGE_ID: PlanGeneratorStageId = STAGE_02_ID;

export const PLAN_GENERATOR_MAX_BREAKER = 5;

export const PLAN_GENERATOR_PLAN_SPLIT_INSTRUCTION = `When the implementation design has multiple independent parts, split the durable plan into task-local support markdown files under docs/plan/<task>/.
Keep README.md as the overview/index, and link each support file with a one-line purpose.
Use support files for implementation-part detail such as CLI changes, extension/runtime changes, tests, docs, migration, or rollout.
Do not put final user-facing plan content only in .dotdotgod-plan/.`;

export const STAGE_04_IMPLEMENTATION_DESIGN_INSTRUCTION = `Stage 04 must be an implementation design, not a generic project plan.
For each atomic task, include concrete code touchpoints: files, functions/types/classes/commands, expected control flow, state/data changes, edge cases, tests, and completion criteria.
Atomic Tasks and Edge Cases must be handoff-ready: a different agent should be able to implement the same work without this chat history and without guessing omitted decisions.
If exact code cannot be determined, record the specific discovery gap and the next read needed.`;

export const STAGE_04_HANDOFF_READY_EVALUATION_RULES = `Stage 04 pass/fail quality bar:
- Atomic Tasks must be specific enough to assign immediately, with no missing implementation decisions or vague verbs such as "update logic" without named code touchpoints.
- Edge Cases must cover failure paths, empty/missing data, invalid user input, interrupted/resumed state, idempotency/retry behavior, and integration boundaries when relevant.
- Mark retry when Atomic Tasks or Edge Cases are too generic, omit likely failure paths, omit tests, or require the next implementer to infer hidden context.
- Mark blocked only when the missing detail requires user input or unavailable project context; otherwise request retry with the missing concrete details.`;

export const STAGE_01_AUTHORING_PROMPT = `You are authoring /plan-generator Stage 01: intake.

Create the initial planning context for the user's durable plan request. Focus only on Stage 01.

Include:
- the user's request in your own words;
- the intended durable plan goal;
- likely target areas or files when inferable;
- unknowns or risks;
- a concise Stage 01 context summary that can guide the next planning stage.

${PLAN_GENERATOR_PLAN_SPLIT_INSTRUCTION}
Do not edit source code. Do not advance beyond Stage 01.`;

export const STAGE_01_RETRY_PROMPT = `Rewrite the /plan-generator Stage 01 intake context.

Use the Stage 01 requirements below and repair the previous response. Keep the result concise, specific, and suitable for deriving the next planning context.`;

export const STAGE_01_EVALUATION_PROMPT = `Evaluate whether the latest assistant response completed /plan-generator Stage 01 intake.

Return only JSON shaped as:
{
  "status": "pass" | "blocked" | "retry",
  "message": "short explanation",
  "stageContext": "concise completed stage context when status is pass"
}

Rules:
- pass: the response has enough request summary, goal, target-area hints, unknowns/risks, and context to continue.
- blocked: user input or project context is missing and the assistant cannot safely continue without it.
- retry: the assistant can repair the Stage 01 response by trying again without asking the user.
- Do not include markdown fences or prose outside JSON.`;

export const STAGE_02_AUTHORING_PROMPT = `You are authoring /plan-generator Stage 02: context load.

Use the current stage state context as workflow context, then update the durable plan artifact under docs/plan/<task>/.

Include durable plan content for:
- Memory Reads;
- Impact Candidates;
- Related Files;
- Stage 02 construction checklist evidence for Memory reads, Impact candidates, Related files, and Boundary risk.

The .dotdotgod-plan/02_CONTEXT_LOAD.md file is internal stage state context, not the final user-facing plan.
${PLAN_GENERATOR_PLAN_SPLIT_INSTRUCTION}
Do not edit source code. Do not advance beyond Stage 02.`;

export const STAGE_02_RETRY_PROMPT = `Repair the /plan-generator Stage 02 context-load update.

Use the Stage 02 requirements below and the previous evaluation. Update the durable plan artifact, not just the internal .dotdotgod-plan state context.`;

export const STAGE_02_EVALUATION_PROMPT = `Evaluate whether the latest assistant response completed /plan-generator Stage 02: context load.

Return only JSON shaped as:
{
  "status": "pass" | "blocked" | "retry",
  "message": "short explanation",
  "stageContext": "concise completed Stage 02 context when status is pass"
}

Rules:
- pass: the durable plan artifact has enough Memory Reads, Impact Candidates, Related Files, and Stage 02 construction checklist evidence to continue to Stage 03 discovery.
- blocked: user input or project context is missing and the assistant cannot safely continue without it.
- retry: the assistant can repair the Stage 02 response by trying again without asking the user.
- Treat .dotdotgod-plan/02_CONTEXT_LOAD.md as stage state context, not the final durable plan artifact.
- Do not include markdown fences or prose outside JSON.`;

export const STAGE_03_AUTHORING_PROMPT = `You are authoring /plan-generator Stage 03: discovery.

Use the current stage state context as workflow context, then update the durable plan artifact under docs/plan/<task>/.

Include durable plan content for:
- Findings;
- Risks;
- Open Questions;
- Stage 03 construction checklist evidence for Findings, Risks, Open questions, and Extension points.

Stage 03 must record actual findings from inspected code/docs, not only a list of files to inspect.

The .dotdotgod-plan/03_DISCOVERY.md file is internal stage state context, not the final user-facing plan.
${PLAN_GENERATOR_PLAN_SPLIT_INSTRUCTION}
Do not edit source code. Do not advance beyond Stage 03.`;

export const STAGE_03_RETRY_PROMPT = `Repair the /plan-generator Stage 03 discovery update.

Use the Stage 03 requirements below and the previous evaluation. Update the durable plan artifact, not just the internal .dotdotgod-plan state context.`;

export const STAGE_03_EVALUATION_PROMPT = `Evaluate whether the latest assistant response completed /plan-generator Stage 03: discovery.

Return only JSON shaped as:
{
  "status": "pass" | "blocked" | "retry",
  "message": "short explanation",
  "stageContext": "concise completed Stage 03 context when status is pass"
}

Rules:
- pass: the durable plan artifact has enough Findings, Risks, Open Questions, and Stage 03 construction checklist evidence.
- blocked: user input or project context is missing and the assistant cannot safely continue without it.
- retry: the assistant can repair the Stage 03 response by trying again without asking the user.
- Treat .dotdotgod-plan/03_DISCOVERY.md as stage state context, not the final durable plan artifact.
- Do not include markdown fences or prose outside JSON.`;

export const STAGE_NEXT_CONTEXT_PROMPT = `Create the next planning context from the completed /plan-generator stage context.

Return plain text only. The next context should prepare the agent to update the next stage state context and durable plan files, including likely sections, validation expectations, unresolved questions, and whether implementation-part support files should be split under docs/plan/<task>/. Do not execute source/config changes.`;

export const NEXT_CONTEXT_PROMPT = STAGE_NEXT_CONTEXT_PROMPT;

const PLAN_FILE_HANDOFF_PROMPT = `Write or update the durable plan files for {{planPath}}.

Current completed stage: {{stageTitle}}
Next stage: {{nextStage}}

Use this completed stage context:
{{stageContext}}

Use this next planning context:
{{nextContext}}

Treat docs/plan/<task>/.dotdotgod-plan/NN_STAGE_NAME.md files as internal stage state context. Use them as workflow context and validation evidence, but write final plan content to README.md or task-local support markdown files outside .dotdotgod-plan/.

${PLAN_GENERATOR_PLAN_SPLIT_INSTRUCTION}

Write or update the matching next stage state context file when applicable. Keep this as planning work only; do not execute source/config changes. After updating the plan files, stop and report the plan path.`;

function buildGenericAuthoringPrompt(options: {
  title: string;
  checkpointFileName: string;
  requiredSections: readonly string[];
  constructionChecklist: readonly string[];
}): string {
  return `You are authoring /plan-generator ${options.title}.

Use the current stage state context as workflow context, then update the durable plan artifact under docs/plan/<task>/.

Include durable plan content for:
${options.requiredSections.map((section) => `- ${section};`).join("\n")}
- construction checklist evidence for ${options.constructionChecklist.join(", ")}.

The .dotdotgod-plan/${options.checkpointFileName} file is internal stage state context, not the final user-facing plan.
${PLAN_GENERATOR_PLAN_SPLIT_INSTRUCTION}
Do not edit source code. Do not advance beyond this stage.`;
}

function buildGenericRetryPrompt(title: string): string {
  return `Repair the /plan-generator ${title} update.

Use the stage requirements below and the previous evaluation. Update the durable plan artifact, not just the internal .dotdotgod-plan state context.`;
}

function buildGenericEvaluationPrompt(options: {
  title: string;
  requiredSections: readonly string[];
  nextStage?: PlanGeneratorStageId | undefined;
}): string {
  return `Evaluate whether the latest assistant response completed /plan-generator ${options.title}.

Return only JSON shaped as:
{
  "status": "pass" | "blocked" | "retry",
  "message": "short explanation",
  "stageContext": "concise completed stage context when status is pass"
}

Rules:
- pass: the durable plan artifact has enough ${options.requiredSections.join(", ")} content${options.nextStage ? " to continue to the next stage" : " to complete the staged plan"}.
- blocked: user input or project context is missing and the assistant cannot safely continue without it.
- retry: the assistant can repair this stage by trying again without asking the user.
- Treat .dotdotgod-plan files as stage state context, not the final durable plan artifact.
- Do not include markdown fences or prose outside JSON.`;
}

export const PLAN_GENERATOR_STAGE_ENVIRONMENTS: Record<
  PlanGeneratorStageId,
  PlanGeneratorStageEnvironment
> = {
  "01-intake": {
    id: "01-intake",
    title: "Stage 01: intake",
    nextStage: "02-context-load",
    checkpointFileName: "01_INTAKE.md",
    requiredSections: [
      "Request Summary",
      "Goal",
      "Scope",
      "Non-goals",
      "Constraints",
      "Assumptions",
    ],
    constructionChecklist: [
      "Requirements",
      "Constraints",
      "Failure paths",
      "Data shape",
      "Verification",
      "Integration impact",
    ],
    authoringPrompt: STAGE_01_AUTHORING_PROMPT,
    retryPrompt: STAGE_01_RETRY_PROMPT,
    evaluationPrompt: STAGE_01_EVALUATION_PROMPT,
    nextContextPrompt: STAGE_NEXT_CONTEXT_PROMPT,
    handoffPrompt: PLAN_FILE_HANDOFF_PROMPT,
  },
  "02-context-load": {
    id: "02-context-load",
    title: "Stage 02: context load",
    nextStage: "03-discovery",
    checkpointFileName: "02_CONTEXT_LOAD.md",
    requiredSections: ["Memory Reads", "Impact Candidates", "Related Files"],
    constructionChecklist: [
      "Memory reads",
      "Impact candidates",
      "Related files",
      "Boundary risk",
    ],
    authoringPrompt: STAGE_02_AUTHORING_PROMPT,
    retryPrompt: STAGE_02_RETRY_PROMPT,
    evaluationPrompt: STAGE_02_EVALUATION_PROMPT,
    nextContextPrompt: STAGE_NEXT_CONTEXT_PROMPT,
    handoffPrompt: PLAN_FILE_HANDOFF_PROMPT,
  },
  "03-discovery": {
    id: "03-discovery",
    title: "Stage 03: discovery",
    nextStage: "04-plan",
    checkpointFileName: "03_DISCOVERY.md",
    requiredSections: ["Findings", "Risks", "Open Questions"],
    constructionChecklist: [
      "Findings",
      "Risks",
      "Open questions",
      "Extension points",
    ],
    authoringPrompt: STAGE_03_AUTHORING_PROMPT,
    retryPrompt: STAGE_03_RETRY_PROMPT,
    evaluationPrompt: STAGE_03_EVALUATION_PROMPT,
    nextContextPrompt: STAGE_NEXT_CONTEXT_PROMPT,
    handoffPrompt: PLAN_FILE_HANDOFF_PROMPT,
  },
  "04-plan": {
    id: "04-plan",
    title: "Stage 04: plan",
    nextStage: "05-workstream-handoff",
    checkpointFileName: "04_PLAN.md",
    requiredSections: [
      "Implementation Design",
      "Code Touchpoints",
      "Data/State Flow",
      "Edge Cases",
      "Atomic Tasks",
      "Test Design",
      "Validation Plan",
      "Resume Point",
    ],
    constructionChecklist: [
      "Implementation design",
      "Code touchpoints",
      "Data/state flow",
      "Edge cases",
      "Atomic tasks",
      "Test design",
      "Validation plan",
      "Resume point",
    ],
    authoringPrompt: `You are authoring /plan-generator Stage 04: plan.

Use the current stage state context as workflow context, then update the durable plan artifact under docs/plan/<task>/.

${STAGE_04_IMPLEMENTATION_DESIGN_INSTRUCTION}

Include durable plan content for:
- Implementation Design;
- Code Touchpoints;
- Data/State Flow;
- Edge Cases;
- Atomic Tasks;
- Test Design;
- Validation Plan;
- Resume Point;
- construction checklist evidence for Implementation design, Code touchpoints, Data/state flow, Edge cases, Atomic tasks, Test design, Validation plan, and Resume point.

The .dotdotgod-plan/04_PLAN.md file is internal stage state context, not the final user-facing plan.
${PLAN_GENERATOR_PLAN_SPLIT_INSTRUCTION}
Do not edit source code. Do not advance beyond Stage 04.`,
    retryPrompt: `${buildGenericRetryPrompt("Stage 04: plan")}

${STAGE_04_IMPLEMENTATION_DESIGN_INSTRUCTION}`,
    evaluationPrompt: `${buildGenericEvaluationPrompt({
      title: "Stage 04: plan",
      requiredSections: [
        "Implementation Design",
        "Code Touchpoints",
        "Data/State Flow",
        "Edge Cases",
        "Atomic Tasks",
        "Test Design",
        "Validation Plan",
        "Resume Point",
      ],
      nextStage: "05-workstream-handoff",
    })}
${STAGE_04_HANDOFF_READY_EVALUATION_RULES}
- pass also requires atomic tasks to name concrete code touchpoints, expected control/state flow, edge cases, tests, and completion criteria.`,
    nextContextPrompt: STAGE_NEXT_CONTEXT_PROMPT,
    handoffPrompt: PLAN_FILE_HANDOFF_PROMPT,
  },
  "05-workstream-handoff": {
    id: "05-workstream-handoff",
    title: "Stage 05: workstream handoff",
    checkpointFileName: "05_WORKSTREAM_HANDOFF.md",
    requiredSections: ["Workstream Handoff", "Todo Contract"],
    constructionChecklist: [
      "Handoffs",
      "Do-not rules",
      "Focused verification",
      "Chat-independent context",
    ],
    authoringPrompt: `${buildGenericAuthoringPrompt({
      title: "Stage 05: workstream handoff",
      checkpointFileName: "05_WORKSTREAM_HANDOFF.md",
      requiredSections: ["Workstream Handoff", "Todo Contract"],
      constructionChecklist: [
        "Handoffs",
        "Do-not rules",
        "Focused verification",
        "Chat-independent context",
      ],
    })}

For small plans that do not need split workstreams, explicitly state that no split is needed and keep the Todo Contract as the implementation handoff contract.`,
    retryPrompt: buildGenericRetryPrompt("Stage 05: workstream handoff"),
    evaluationPrompt: buildGenericEvaluationPrompt({
      title: "Stage 05: workstream handoff",
      requiredSections: ["Workstream Handoff", "Todo Contract"],
    }),
    handoffPrompt: PLAN_FILE_HANDOFF_PROMPT,
  },
};

export function getPlanGeneratorStageEnvironment(
  stageId: PlanGeneratorStageId | undefined,
): PlanGeneratorStageEnvironment | undefined {
  return stageId ? PLAN_GENERATOR_STAGE_ENVIRONMENTS[stageId] : undefined;
}

function renderCheckpointContext(
  title: string,
  checkpointContext: PlanGeneratorStageCheckpointContext | undefined,
): string {
  if (!checkpointContext) return "";
  const content = checkpointContext.unavailable
    ? `Unavailable: ${checkpointContext.unavailable}`
    : `${checkpointContext.content ?? ""}${checkpointContext.truncated ? "\n[checkpoint content truncated]" : ""}`;
  return `

${title}:
Path: ${checkpointContext.path}
Content:
${content}`;
}

export function buildStageAuthoringMessage(
  stage: PlanGeneratorStageEnvironment,
  request: string,
  checkpointContext?: PlanGeneratorStageCheckpointContext | undefined,
): string {
  return `${stage.authoringPrompt}${renderCheckpointContext("Current stage checkpoint context", checkpointContext)}

User request:
${request}`;
}

export function buildStageRetryMessage(
  stage: PlanGeneratorStageEnvironment,
  request: string,
  previousMessage: string,
  checkpointContext?: PlanGeneratorStageCheckpointContext | undefined,
): string {
  return `${stage.retryPrompt}

Stage requirements:
${stage.authoringPrompt}${renderCheckpointContext("Current stage checkpoint context", checkpointContext)}

Required durable sections:
${stage.requiredSections.map((section) => `- ${section}`).join("\n")}

Construction checklist:
${stage.constructionChecklist.map((item) => `- ${item}`).join("\n")}

Plan path or request context:
${request}

Previous evaluation:
${previousMessage}`;
}

export function buildStageResumeMessage(
  stage: PlanGeneratorStageEnvironment,
  request: string,
  waitingMessage: string,
  latestUserInput: string,
  checkpointContext?: PlanGeneratorStageCheckpointContext | undefined,
): string {
  return `${stage.retryPrompt}

Resume the same /plan-generator stage after follow-up user input. Do not advance stages unless this stage now satisfies validation.

Stage requirements:
${stage.authoringPrompt}${renderCheckpointContext("Current stage checkpoint context", checkpointContext)}

Required durable sections:
${stage.requiredSections.map((section) => `- ${section}`).join("\n")}

Construction checklist:
${stage.constructionChecklist.map((item) => `- ${item}`).join("\n")}

Plan path or request context:
${request}

Previous blocker or input request:
${waitingMessage}

Latest user input:
${latestUserInput}`;
}

export function buildStageHandoffMessage(options: {
  stage: PlanGeneratorStageEnvironment;
  planPath: string;
  stageContext: string;
  nextContext: string;
  nextCheckpointContext?: PlanGeneratorStageCheckpointContext | undefined;
}): string {
  const nextStage = options.stage.nextStage
    ? PLAN_GENERATOR_STAGE_ENVIRONMENTS[options.stage.nextStage].title
    : "none";
  return options.stage.handoffPrompt
    .replaceAll("{{planPath}}", options.planPath)
    .replaceAll("{{stageTitle}}", options.stage.title)
    .replaceAll("{{nextStage}}", nextStage)
    .replaceAll("{{stageContext}}", options.stageContext)
    .replaceAll("{{nextContext}}", `${options.nextContext}${renderCheckpointContext("Next stage checkpoint context", options.nextCheckpointContext)}`);
}

export function buildStage01AuthoringMessage(request: string): string {
  return buildStageAuthoringMessage(
    PLAN_GENERATOR_STAGE_ENVIRONMENTS[STAGE_01_ID],
    request,
  );
}

export function buildStage01RetryMessage(request: string, previousMessage: string): string {
  return buildStageRetryMessage(
    PLAN_GENERATOR_STAGE_ENVIRONMENTS[STAGE_01_ID],
    request,
    previousMessage,
  );
}

export function buildPlanFileHandoffMessage(options: {
  planPath: string;
  stage01Context: string;
  nextContext: string;
}): string {
  return buildStageHandoffMessage({
    stage: PLAN_GENERATOR_STAGE_ENVIRONMENTS[STAGE_01_ID],
    planPath: options.planPath,
    stageContext: options.stage01Context,
    nextContext: options.nextContext,
  });
}
