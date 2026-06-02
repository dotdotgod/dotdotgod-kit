import * as path from "node:path";
import { parseJsonWithRepair } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { askFirstRequest } from "./questions.ts";
import {
  buildStageAuthoringMessage,
  buildStageHandoffMessage,
  buildStageResumeMessage,
  buildStageRetryMessage,
  getPlanGeneratorStageEnvironment,
  PLAN_GENERATOR_HELP,
  PLAN_GENERATOR_MAX_BREAKER,
  PLAN_GENERATOR_STAGE_ENVIRONMENTS,
  STAGE_01_ID,
  type PlanGeneratorStageCheckpointContext,
  type PlanGeneratorStageEnvironment,
} from "./stage-contract.ts";
import { createPlanGeneratorStore, initPlanGeneratorStore, type PlanGeneratorStore } from "./store.ts";
import {
  createPlanStageCheckpointViaCli,
  createStageValidationEvidence,
  ensureInitialReadme,
  formatStageValidationEvidence,
  hasUnresolvedUserDecisionBlocker,
  readStageCheckpointContext,
  resolveCollisionFreeTaskPath,
  resolveExistingPlanGeneratorResumeTarget,
  type ExistingPlanGeneratorResumeTarget,
  type PlanGeneratorStageCheckpointResult,
  type PlanGeneratorStageValidationEvidence,
  type PlanGeneratorTaskPath,
} from "./plan-files.ts";
import {
  activatePlanGeneratorWorkflow,
  clearDotdotgodWorkflowState,
  isPlanGeneratorWorkflowActive,
  restoreDotdotgodWorkflowState,
} from "../shared/workflow-coordination.ts";
import { authCreate, createTextUserMessage } from "./utils.ts";

interface StageEvaluation {
  status: "pass" | "blocked" | "retry";
  message?: string | undefined;
  stageContext?: string | undefined;
  stage01Context?: string | undefined;
}

function setPlanGeneratorModeStatus(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(
    "plan-mode",
    ctx.ui.theme.fg("warning", "⏸ generate plan"),
  );
}

function setPlanGeneratorProgressStatus(ctx: ExtensionContext, label: string): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", label));
}

function getPlanModeFallbackStatus(ctx: ExtensionContext): string | undefined {
  const entries = typeof ctx.sessionManager?.getBranch === "function"
    ? ctx.sessionManager.getBranch()
    : [];
  for (const entry of [...entries].reverse()) {
    const candidate = entry as {
      type?: unknown;
      customType?: unknown;
      data?: unknown;
      message?: { role?: unknown; customType?: unknown; details?: unknown };
    };
    const value = candidate.type === "custom" && candidate.customType === "plan-mode"
      ? candidate.data
      : candidate.type === "message" &&
          candidate.message?.role === "custom" &&
          candidate.message.customType === "plan-mode"
        ? candidate.message.details
        : undefined;
    if (!value || typeof value !== "object") continue;
    const state = value as {
      mode?: { mode?: unknown };
      execution?: { todos?: Array<{ completed?: unknown }> };
    };
    const mode = state.mode?.mode;
    if (mode === "executing") {
      const todos = Array.isArray(state.execution?.todos) ? state.execution.todos : [];
      if (todos.length > 0) {
        const completed = todos.filter((todo) => todo.completed === true).length;
        return ctx.ui.theme.fg("accent", `📋 ${completed}/${todos.length}`);
      }
    }
    if (mode === "planning" || mode === "reviewing" || mode === "executing") {
      return ctx.ui.theme.fg("warning", "⏸ plan");
    }
    if (mode === "off") return undefined;
  }
  return undefined;
}

function clearPlanGeneratorModeStatus(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("plan-mode", getPlanModeFallbackStatus(ctx));
}

function relativePlanPath(ctx: ExtensionCommandContext, readmePath: string): string {
  return path.relative(ctx.cwd, readmePath).split(path.sep).join("/");
}

function textFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const value = message as { content?: unknown; text?: unknown };
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  if (!Array.isArray(value.content)) return "";
  return value.content
    .map((content) => {
      if (!content || typeof content !== "object") return "";
      const part = content as { type?: unknown; text?: unknown };
      return part.type === "text" && typeof part.text === "string"
        ? part.text
        : "";
    })
    .filter(Boolean)
    .join("\n");
}

function latestAssistantText(messages: unknown[]): string {
  for (const message of [...messages].reverse()) {
    if (
      message &&
      typeof message === "object" &&
      (message as { role?: unknown }).role === "assistant"
    ) {
      const text = textFromMessage(message);
      if (text) return text;
    }
  }
  return "";
}

function latestUserTextFromSession(ctx: ExtensionContext): string {
  const sessionManager = ctx.sessionManager as {
    getEntries?: () => unknown[];
    getBranch?: () => unknown[];
  };
  const entries = typeof sessionManager.getEntries === "function"
    ? sessionManager.getEntries()
    : typeof sessionManager.getBranch === "function"
      ? sessionManager.getBranch()
      : [];
  for (const entry of [...entries].reverse()) {
    const candidate = entry as { type?: unknown; message?: unknown };
    if (candidate.type !== "message") continue;
    const message = candidate.message as { role?: unknown } | undefined;
    if (message?.role !== "user") continue;
    const text = textFromMessage(message);
    if (text.trim()) return text.trim();
  }
  return "";
}

function isPlanGeneratorStopInput(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return (
    normalized === "stop" ||
    normalized === "cancel" ||
    normalized === "abandon" ||
    normalized === "/plan-generator --stop" ||
    normalized === "/plan-generator stop" ||
    normalized === "/plan-generator cancel"
  );
}

function isPlanGeneratorStopOrSwitchInput(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return (
    isPlanGeneratorStopInput(input) ||
    (normalized.startsWith("/plan-generator") &&
      normalized !== "/plan-generator")
  );
}

function assistantRequestsUserInput(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    "please confirm",
    "please choose",
    "which option",
    "need your input",
    "need user input",
    "cannot continue without",
    "사용자 입력",
    "판단해",
    "판단해 주세요",
    "확정해",
    "확정해 주세요",
    "선택해",
    "선택해 주세요",
    "알려주세요",
    "어느 쪽",
  ].some((marker) => normalized.includes(marker));
}

function normalizeStageEvaluation(
  value: StageEvaluation | undefined,
): StageEvaluation | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (!["pass", "blocked", "retry"].includes(value.status)) return undefined;
  const stageContext =
    typeof value.stageContext === "string"
      ? value.stageContext
      : typeof value.stage01Context === "string"
        ? value.stage01Context
        : undefined;
  return {
    status: value.status,
    message: typeof value.message === "string" ? value.message : undefined,
    stageContext,
  };
}

async function evaluateStage(
  ctx: ExtensionContext,
  stage: PlanGeneratorStageEnvironment,
  requestContext: string,
  assistantText: string,
  validationEvidence?: PlanGeneratorStageValidationEvidence | undefined,
): Promise<StageEvaluation | undefined> {
  if (!stage.evaluationPrompt) return undefined;
  const result = await authCreate(ctx, {
    systemPrompt: stage.evaluationPrompt,
    messages: [
      createTextUserMessage(`Plan path or request context:\n${requestContext}\n\nStage validation evidence:\n${validationEvidence ? formatStageValidationEvidence(validationEvidence) : "not checked"}\n\nLatest assistant response:\n${assistantText}`),
    ],
  });
  if (!result) return undefined;
  return normalizeStageEvaluation(parseJsonWithRepair<StageEvaluation>(result));
}

async function evaluateStage01(
  ctx: ExtensionContext,
  requestContext: string,
  assistantText: string,
): Promise<StageEvaluation | undefined> {
  return evaluateStage(
    ctx,
    PLAN_GENERATOR_STAGE_ENVIRONMENTS[STAGE_01_ID],
    requestContext,
    assistantText,
  );
}

async function waitForPlanGeneratorUserDecision(options: {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  store: PlanGeneratorStore;
  state: ReturnType<PlanGeneratorStore["getState"]>;
  stage: PlanGeneratorStageEnvironment;
  message: string;
}): Promise<void> {
  options.store.updateState({
    status: "input-waiting",
    message: options.message,
    waitingMessage: options.message,
  });
  activatePlanGeneratorWorkflow(options.pi, {
    planPath: options.state.currentPlan,
    stage: options.state.currentStage,
    reason: options.message,
  });
  setPlanGeneratorModeStatus(options.ctx);
  if (options.ctx.hasUI) {
    options.ctx.ui.notify(`${options.stage.title} is waiting for user input.`, "warning");
  }
  await options.pi.sendUserMessage(
    `The current /plan-generator ${options.stage.title} cannot advance because the durable plan contains an unresolved user decision. Ask the user a concrete question with clear options, then wait for their answer before updating the same stage.\n\n${options.message}`,
    { deliverAs: "followUp" },
  );
}

async function createNextContext(
  ctx: ExtensionContext,
  stage: PlanGeneratorStageEnvironment,
  stageContext: string,
): Promise<string | undefined> {
  if (!stage.nextContextPrompt) return stageContext;
  return authCreate(ctx, {
    systemPrompt: stage.nextContextPrompt,
    messages: [createTextUserMessage(stageContext)],
  });
}

type PlanStageCheckpointCreator = (
  ctx: ExtensionCommandContext | ExtensionContext,
  stage: PlanGeneratorStageEnvironment,
  planPath: string,
) => PlanGeneratorStageCheckpointResult | Promise<PlanGeneratorStageCheckpointResult>;

const defaultPlanStageCheckpointCreator: PlanStageCheckpointCreator = (ctx, stage, planPath) =>
  createPlanStageCheckpointViaCli((ctx as { cwd: string }).cwd, stage.id, planPath);

async function createStageCheckpointOrThrow(
  ctx: ExtensionCommandContext | ExtensionContext,
  stage: PlanGeneratorStageEnvironment,
  planPath: string,
  createCheckpoint: PlanStageCheckpointCreator,
): Promise<void> {
  const result = await createCheckpoint(ctx, stage, planPath);
  if (result.ok) return;
  throw new Error(result.error ?? `Could not create ${stage.title} checkpoint.`);
}

function checkpointContextFor(
  ctx: ExtensionCommandContext | ExtensionContext,
  planPath: string,
  stage: PlanGeneratorStageEnvironment,
) {
  return readStageCheckpointContext({
    cwd: (ctx as { cwd: string }).cwd,
    currentPlan: planPath,
    stage,
  });
}

async function startExistingGeneratorTask(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  target: ExistingPlanGeneratorResumeTarget,
  store = createPlanGeneratorStore(pi),
  createCheckpoint: PlanStageCheckpointCreator = defaultPlanStageCheckpointCreator,
): Promise<void> {
  if (target.message) {
    store.updateState({
      currentPlan: undefined,
      currentStage: undefined,
      status: "blocked",
      breaker: 0,
      message: target.message,
    });
    clearDotdotgodWorkflowState(pi, "blocked", target.message);
    clearPlanGeneratorModeStatus(ctx);
    if (ctx.hasUI) ctx.ui.notify(target.message, "warning");
    return;
  }

  if (target.completed) {
    const message = `Plan generator checkpoints appear complete: ${target.currentPlan}`;
    store.updateState({
      currentPlan: target.currentPlan,
      currentStage: undefined,
      status: "pass",
      breaker: 0,
      message,
      originalRequest: target.currentPlan,
      waitingMessage: undefined,
      latestUserInput: undefined,
      lastResumedUserInput: undefined,
    });
    clearDotdotgodWorkflowState(pi, "completed", message);
    clearPlanGeneratorModeStatus(ctx);
    if (ctx.hasUI) ctx.ui.notify(message, "info");
    return;
  }

  const stage = PLAN_GENERATOR_STAGE_ENVIRONMENTS[target.stageId];
  store.updateState({
    currentPlan: target.currentPlan,
    currentStage: stage.id,
    status: "active",
    breaker: 0,
    message: target.currentPlan,
    originalRequest: target.currentPlan,
    waitingMessage: undefined,
    latestUserInput: undefined,
    lastResumedUserInput: undefined,
  });
  activatePlanGeneratorWorkflow(pi, {
    planPath: target.currentPlan,
    stage: stage.id,
    reason: `Resuming /plan-generator from ${target.currentPlan}.`,
  });
  setPlanGeneratorProgressStatus(ctx, target.hasCheckpoint ? "⏳ resuming plan stage" : "⏳ creating stage checkpoint");

  if (!target.hasCheckpoint) {
    try {
      await createStageCheckpointOrThrow(ctx, stage, target.currentPlan, createCheckpoint);
    } catch (error) {
      const message = error instanceof Error
        ? `Could not resume /plan-generator: ${error.message}`
        : "Could not resume /plan-generator.";
      store.updateState({
        currentPlan: target.currentPlan,
        currentStage: stage.id,
        status: "blocked",
        breaker: 0,
        message,
      });
      clearDotdotgodWorkflowState(pi, "blocked", message);
      clearPlanGeneratorModeStatus(ctx);
      if (ctx.hasUI) ctx.ui.notify(message, "warning");
      throw error;
    }
  }

  store.updateState({
    currentPlan: target.currentPlan,
    currentStage: stage.id,
    status: "active",
    breaker: 0,
    message: target.currentPlan,
    originalRequest: target.currentPlan,
    waitingMessage: undefined,
    latestUserInput: undefined,
    lastResumedUserInput: undefined,
  });
  activatePlanGeneratorWorkflow(pi, {
    planPath: target.currentPlan,
    stage: stage.id,
    reason: `Resuming /plan-generator from ${target.currentPlan}.`,
  });
  setPlanGeneratorModeStatus(ctx);
  const checkpointContext = checkpointContextFor(ctx, target.currentPlan, stage);
  const message = target.hasCheckpoint
    ? buildStageResumeMessage(
        stage,
        target.currentPlan,
        "Resuming existing /plan-generator plan from checkpoint.",
        "Continue from explicit /plan-generator path resume.",
        checkpointContext,
      )
    : buildStageAuthoringMessage(stage, target.currentPlan, checkpointContext);
  await pi.sendUserMessage(message, { deliverAs: "followUp" });
  if (ctx.hasUI) {
    ctx.ui.notify(
      `Resumed /plan-generator task ${target.currentPlan}.`,
      "info",
    );
  }
}

async function startNewGeneratorTask(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  request: string,
  store = createPlanGeneratorStore(pi),
  createCheckpoint: PlanStageCheckpointCreator = defaultPlanStageCheckpointCreator,
): Promise<void> {
  store.updateState({
    currentPlan: undefined,
    currentStage: undefined,
    status: "active",
    breaker: 0,
    message: request,
    originalRequest: request,
    waitingMessage: undefined,
    latestUserInput: undefined,
    lastResumedUserInput: undefined,
  });
  activatePlanGeneratorWorkflow(pi, {
    reason: request,
  });
  setPlanGeneratorProgressStatus(ctx, "⏳ generating plan slug");

  let task: PlanGeneratorTaskPath;
  try {
    task = await resolveCollisionFreeTaskPath(ctx, request);
    setPlanGeneratorProgressStatus(ctx, "⏳ creating plan files");
    ensureInitialReadme(task, request);
  } catch (error) {
    const message = error instanceof Error
      ? `Could not start /plan-generator: ${error.message}`
      : "Could not start /plan-generator.";
    store.updateState({
      currentPlan: undefined,
      currentStage: undefined,
      status: "blocked",
      breaker: 0,
      message,
    });
    clearDotdotgodWorkflowState(pi, "blocked", message);
    clearPlanGeneratorModeStatus(ctx);
    if (ctx.hasUI) ctx.ui.notify(message, "warning");
    throw error;
  }

  const currentPlan = relativePlanPath(ctx, task.readmePath);
  try {
    setPlanGeneratorProgressStatus(ctx, "⏳ creating stage checkpoint");
    await createStageCheckpointOrThrow(
      ctx,
      PLAN_GENERATOR_STAGE_ENVIRONMENTS[STAGE_01_ID],
      currentPlan,
      createCheckpoint,
    );
  } catch (error) {
    const message = error instanceof Error
      ? `Could not start /plan-generator: ${error.message}`
      : "Could not start /plan-generator.";
    store.updateState({
      currentPlan,
      currentStage: STAGE_01_ID,
      status: "blocked",
      breaker: 0,
      message,
    });
    clearDotdotgodWorkflowState(pi, "blocked", message);
    clearPlanGeneratorModeStatus(ctx);
    if (ctx.hasUI) ctx.ui.notify(message, "warning");
    throw error;
  }

  store.updateState({
    currentPlan,
    currentStage: STAGE_01_ID,
    status: "active",
    breaker: 0,
    message: request,
    originalRequest: request,
    waitingMessage: undefined,
    latestUserInput: undefined,
    lastResumedUserInput: undefined,
  });
  activatePlanGeneratorWorkflow(pi, {
    planPath: currentPlan,
    stage: STAGE_01_ID,
    reason: request,
  });
  setPlanGeneratorModeStatus(ctx);
  const checkpointContext = checkpointContextFor(
    ctx,
    currentPlan,
    PLAN_GENERATOR_STAGE_ENVIRONMENTS[STAGE_01_ID],
  );
  await pi.sendUserMessage(
    buildStageAuthoringMessage(
      PLAN_GENERATOR_STAGE_ENVIRONMENTS[STAGE_01_ID],
      request,
      checkpointContext,
    ),
    { deliverAs: "followUp" },
  );

  if (ctx.hasUI) {
    ctx.ui.notify(
      `Started /plan-generator task docs/plan/${task.taskSlug}.`,
      "info",
    );
  }

}

async function pausePlanGeneratorTask(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext | ExtensionContext,
  store: PlanGeneratorStore,
  reason = "Paused /plan-generator. Send the next message to resume this stage.",
): Promise<boolean> {
  const state = store.getState();
  if (!state.currentPlan || !state.currentStage || !["active", "input-waiting"].includes(state.status)) {
    return false;
  }
  store.updateState({
    status: "input-waiting",
    message: reason,
    waitingMessage: reason,
    latestUserInput: undefined,
    lastResumedUserInput: undefined,
  });
  activatePlanGeneratorWorkflow(pi, {
    planPath: state.currentPlan,
    stage: state.currentStage,
    reason,
  });
  setPlanGeneratorModeStatus(ctx);
  if (ctx.hasUI) ctx.ui.notify(reason, "warning");
  return true;
}

async function stopPlanGeneratorTask(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext | ExtensionContext,
  store: PlanGeneratorStore,
  reason = "Stopped by user.",
): Promise<void> {
  store.updateState({
    currentStage: undefined,
    status: "stopped",
    message: reason,
    breaker: 0,
  });
  clearDotdotgodWorkflowState(pi, "stopped", reason);
  clearPlanGeneratorModeStatus(ctx);
  if (ctx.hasUI) ctx.ui.notify("Stopped /plan-generator.", "info");
}

async function runPlanGeneratorCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  args: string,
  store = createPlanGeneratorStore(pi),
  createCheckpoint: PlanStageCheckpointCreator = defaultPlanStageCheckpointCreator,
): Promise<void> {
  const request = args.trim();
  if (["--stop", "stop", "cancel"].includes(request)) {
    await stopPlanGeneratorTask(pi, ctx, store);
    return;
  }
  if (!request && await pausePlanGeneratorTask(pi, ctx, store)) {
    return;
  }
  if (request === "--help" || request === "-h") {
    if (ctx.hasUI) ctx.ui.notify(PLAN_GENERATOR_HELP, "info");
    return;
  }
  const existingTarget = resolveExistingPlanGeneratorResumeTarget(ctx.cwd, request);
  if (existingTarget) {
    await startExistingGeneratorTask(pi, ctx, existingTarget, store, createCheckpoint);
    return;
  }

  const initialRequest = request || (await askFirstRequest(ctx));

  if (!initialRequest) {
    if (ctx.hasUI) {
      ctx.ui.notify("What durable plan should /plan-generator create?", "info");
    }
    return;
  }

  await startNewGeneratorTask(pi, ctx, initialRequest, store, createCheckpoint);
}

async function resumePlanGeneratorFromUserInput(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  store: PlanGeneratorStore,
  latestUserInput = latestUserTextFromSession(ctx),
): Promise<boolean> {
  const state = store.getState();
  const stage = getPlanGeneratorStageEnvironment(state.currentStage);
  const userInput = latestUserInput.trim();
  if (
    state.status !== "input-waiting" ||
    !state.currentPlan ||
    !stage ||
    !userInput ||
    state.lastResumedUserInput === userInput
  ) {
    return false;
  }
  if (isPlanGeneratorStopOrSwitchInput(userInput)) {
    if (isPlanGeneratorStopInput(userInput)) {
      await stopPlanGeneratorTask(pi, ctx, store, "Stopped by user input.");
    }
    return false;
  }

  const requestContext = state.originalRequest ?? state.currentPlan;
  const waitingMessage = state.waitingMessage ?? state.message ?? `${stage.title} is waiting for user input.`;
  store.updateState({
    status: "active",
    message: requestContext,
    latestUserInput: userInput,
    lastResumedUserInput: userInput,
    breaker: 0,
  });
  activatePlanGeneratorWorkflow(pi, {
    planPath: state.currentPlan,
    stage: state.currentStage,
    reason: `Resuming ${stage.title} after user input.`,
  });
  setPlanGeneratorModeStatus(ctx);
  await pi.sendUserMessage(
    buildStageResumeMessage(
      stage,
      requestContext,
      waitingMessage,
      userInput,
      checkpointContextFor(ctx, state.currentPlan, stage),
    ),
    { deliverAs: "followUp" },
  );
  return true;
}

async function handlePlanGeneratorAgentEnd(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  messages: unknown[],
  store: PlanGeneratorStore,
  createCheckpoint: PlanStageCheckpointCreator = defaultPlanStageCheckpointCreator,
): Promise<void> {
  if (!isPlanGeneratorWorkflowActive()) return;
  const state = store.getState();
  const stage = getPlanGeneratorStageEnvironment(state.currentStage);
  if (!state.currentPlan || !stage || state.status !== "active") return;

  if (state.breaker >= PLAN_GENERATOR_MAX_BREAKER) {
    const message = `Stopped /plan-generator after too many ${stage.title} retries.`;
    store.updateState({
      currentStage: undefined,
      status: "blocked",
      message,
      breaker: 0,
    });
    clearDotdotgodWorkflowState(pi, "blocked", message);
    clearPlanGeneratorModeStatus(ctx);
    if (ctx.hasUI) {
      ctx.ui.notify(
        `Stopped /plan-generator after too many ${stage.title} retries.`,
        "warning",
      );
    }
    return;
  }

  const requestContext = state.originalRequest ?? state.message ?? state.currentPlan;
  const assistantText = latestAssistantText(messages);
  const validationEvidence = stage.id === STAGE_01_ID
    ? undefined
    : createStageValidationEvidence({
        cwd: (ctx as { cwd: string }).cwd,
        currentPlan: state.currentPlan,
        stage,
      });
  const evaluation = await evaluateStage(ctx, stage, requestContext, assistantText, validationEvidence);

  if (hasUnresolvedUserDecisionBlocker(validationEvidence)) {
    const blockers = validationEvidence?.blockers
      .filter((blocker) => blocker.startsWith("Unresolved user decision in "))
      .join("\n");
    await waitForPlanGeneratorUserDecision({
      pi,
      ctx,
      store,
      state,
      stage,
      message: `Unresolved user decision detected. Please choose before /plan-generator continues.\n${blockers}`,
    });
    return;
  }

  if (!evaluation || evaluation.status === "retry") {
    if (assistantRequestsUserInput(assistantText)) {
      const message = evaluation?.message ?? assistantText;
      store.updateState({
        status: "input-waiting",
        message,
        waitingMessage: message,
      });
      activatePlanGeneratorWorkflow(pi, {
        planPath: state.currentPlan,
        stage: state.currentStage,
        reason: message,
      });
      setPlanGeneratorModeStatus(ctx);
      if (ctx.hasUI) {
        ctx.ui.notify(`${stage.title} is waiting for user input.`, "warning");
      }
      return;
    }

    const message = evaluation?.message ?? `${stage.title} needs repair.`;
    store.updateState({
      status: "active",
      message,
      breaker: state.breaker + 1,
    });
    await pi.sendUserMessage(
      buildStageRetryMessage(
        stage,
        requestContext,
        message,
        checkpointContextFor(ctx, state.currentPlan, stage),
      ),
      { deliverAs: "followUp" },
    );
    return;
  }

  if (evaluation.status === "blocked") {
    const message = evaluation.message ?? assistantText;
    store.updateState({
      status: "input-waiting",
      message,
      waitingMessage: message,
    });
    activatePlanGeneratorWorkflow(pi, {
      planPath: state.currentPlan,
      stage: state.currentStage,
      reason: message,
    });
    setPlanGeneratorModeStatus(ctx);
    if (ctx.hasUI) {
      ctx.ui.notify(evaluation.message ?? `${stage.title} is waiting for user input.`, "warning");
    }
    return;
  }

  if (validationEvidence && !validationEvidence.ok) {
    const message = `Stage validation did not pass.\n${formatStageValidationEvidence(validationEvidence)}`;
    store.updateState({
      status: "active",
      message,
      breaker: state.breaker + 1,
    });
    await pi.sendUserMessage(
      buildStageRetryMessage(
        stage,
        requestContext,
        message,
        checkpointContextFor(ctx, state.currentPlan, stage),
      ),
      { deliverAs: "followUp" },
    );
    return;
  }

  const stageContext = evaluation.stageContext ?? assistantText;
  const nextContext = await createNextContext(ctx, stage, stageContext);
  if (!nextContext) {
    const message = "Could not create the next planning context.";
    store.updateState({
      status: "active",
      message,
      breaker: state.breaker + 1,
    });
    await pi.sendUserMessage(
      buildStageRetryMessage(
        stage,
        requestContext,
        message,
        checkpointContextFor(ctx, state.currentPlan, stage),
      ),
      { deliverAs: "followUp" },
    );
    return;
  }

  let nextCheckpointContext: PlanGeneratorStageCheckpointContext | undefined;
  if (stage.nextStage) {
    const nextStage = getPlanGeneratorStageEnvironment(stage.nextStage);
    if (!nextStage) {
      const message = `Unknown next /plan-generator stage: ${stage.nextStage}`;
      store.updateState({ status: "blocked", message, breaker: 0 });
      clearDotdotgodWorkflowState(pi, "blocked", message);
      clearPlanGeneratorModeStatus(ctx);
      if (ctx.hasUI) ctx.ui.notify(message, "warning");
      return;
    }
    try {
      setPlanGeneratorProgressStatus(ctx, "⏳ creating stage checkpoint");
      await createStageCheckpointOrThrow(ctx, nextStage, state.currentPlan, createCheckpoint);
      nextCheckpointContext = checkpointContextFor(ctx, state.currentPlan, nextStage);
    } catch (error) {
      const message = error instanceof Error
        ? `Could not create next /plan-generator checkpoint: ${error.message}`
        : "Could not create next /plan-generator checkpoint.";
      store.updateState({
        status: "active",
        message,
        breaker: state.breaker + 1,
      });
      setPlanGeneratorModeStatus(ctx);
      if (ctx.hasUI) ctx.ui.notify(message, "warning");
      await pi.sendUserMessage(
        buildStageRetryMessage(
          stage,
          requestContext,
          message,
          checkpointContextFor(ctx, state.currentPlan, stage),
        ),
        { deliverAs: "followUp" },
      );
      return;
    }
  }

  store.updateState({
    currentStage: stage.nextStage,
    status: stage.nextStage ? "active" : "pass",
    message: `${stage.title} passed; ${stage.nextStage ? "next stage handoff queued" : "stage sequence complete"}.`,
    breaker: 0,
  });
  if (stage.nextStage) {
    activatePlanGeneratorWorkflow(pi, {
      planPath: state.currentPlan,
      stage: stage.nextStage,
      reason: `${stage.title} passed.`,
    });
    setPlanGeneratorModeStatus(ctx);
    await pi.sendUserMessage(
      buildStageHandoffMessage({
        stage,
        planPath: state.currentPlan,
        stageContext,
        nextContext,
        nextCheckpointContext,
      }),
      { deliverAs: "followUp" },
    );
  } else {
    clearDotdotgodWorkflowState(pi, "completed", "Plan generator stage sequence complete.");
    clearPlanGeneratorModeStatus(ctx);
  }
}

function restorePlanGeneratorWorkflowFromStore(
  pi: ExtensionAPI,
  store: PlanGeneratorStore,
): boolean {
  if (isPlanGeneratorWorkflowActive()) return false;
  const state = store.getState();
  if (
    !["active", "input-waiting"].includes(state.status) ||
    !state.currentPlan ||
    !state.currentStage
  ) {
    return false;
  }
  activatePlanGeneratorWorkflow(pi, {
    planPath: state.currentPlan,
    stage: state.currentStage,
    reason: "Restored /plan-generator workflow from session state.",
  });
  return true;
}

function restorePlanGeneratorWorkflowSession(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  store: PlanGeneratorStore,
): void {
  restoreDotdotgodWorkflowState(ctx.sessionManager.getBranch());
  restorePlanGeneratorWorkflowFromStore(pi, store);
  if (isPlanGeneratorWorkflowActive()) setPlanGeneratorModeStatus(ctx);
}

function registerPlanGeneratorInterruptHandler(
  pi: ExtensionAPI,
  store: PlanGeneratorStore,
): void {
  const interruptAwareApi = pi as ExtensionAPI & {
    on(
      event: "interrupt",
      handler: (event: { reason?: unknown }, ctx: ExtensionContext) => Promise<void> | void,
    ): void;
  };
  interruptAwareApi.on("interrupt", async (_event, ctx) => {
    await pausePlanGeneratorTask(
      pi,
      ctx,
      store,
      "Paused /plan-generator by interrupt. Send the next message to resume this stage.",
    );
  });
}

export default function planGeneratorExtension(pi: ExtensionAPI): void {
  const store = createPlanGeneratorStore(pi);
  initPlanGeneratorStore(pi, store);
  registerPlanGeneratorInterruptHandler(pi, store);

  pi.on("session_start", async (_event, ctx) => {
    restorePlanGeneratorWorkflowSession(pi, ctx, store);
  });
  pi.on("session_tree", async (_event, ctx) => {
    restorePlanGeneratorWorkflowSession(pi, ctx, store);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    restorePlanGeneratorWorkflowSession(pi, ctx, store);
    await resumePlanGeneratorFromUserInput(pi, ctx, store);
  });

  pi.on("agent_end", async (event, ctx) => {
    await handlePlanGeneratorAgentEnd(pi, ctx, event.messages, store);
  });

  pi.registerCommand("plan-generator", {
    description: "Create durable dotdotgod staged plans",
    handler: async (args, ctx) => runPlanGeneratorCommand(pi, ctx, args, store),
  });
}

export {
  clearPlanGeneratorModeStatus,
  defaultPlanStageCheckpointCreator,
  evaluateStage,
  evaluateStage01,
  handlePlanGeneratorAgentEnd,
  latestAssistantText,
  pausePlanGeneratorTask,
  registerPlanGeneratorInterruptHandler,
  resumePlanGeneratorFromUserInput,
  runPlanGeneratorCommand,
  restorePlanGeneratorWorkflowFromStore,
  restorePlanGeneratorWorkflowSession,
  setPlanGeneratorModeStatus,
  startNewGeneratorTask,
  stopPlanGeneratorTask,
};
