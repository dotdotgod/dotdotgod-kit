/**
 * Customized Plan Mode Extension
 *
 * Planning-only exploration and document management without filesystem-area ACLs.
 */

import { relative, resolve } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { createLocalBashOperations, createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { stageAdmission } from "./policy/admission.ts";
import { PolicyRuntime } from "./policy/runtime.ts";
import { approveCommand, approvePath, ensureProjectPolicy } from "./policy/ui.ts";
import { authorizeExecution } from "./policy/execution.ts";
import { resolveInvocation, type ExecutionInput } from "./policy/invocation.ts";
import { ChildManager } from "./children/manager.ts";
import { parseHcCommand, type HcCommand } from "./children/hc-command.ts";
import { tokenizeShellCommand } from "./tools.ts";
import { ImpactState, impactReminder } from "@dotdotgod/cli/impact";
import { isMcpTool, mcpTool } from "../shared/mcp.ts";
import { buildDecisionWizardFollowUp } from "./decision-wizard.ts";
import { describePendingPlanDecisions } from "./controllers/decision-wizard.ts";
import { recordContextMetric } from "../context-metrics/utils.js";
import { composeActiveTools } from "../shared/active-tools.js";
import { ContextOrchestrationController } from "./controllers/context-orchestration.js";
import { ContextShapingController, type ContextShapingSnapshot } from "./controllers/context-shaping.js";
import { ExecutionEvidenceController } from "./controllers/execution-evidence.ts";
import { canSendNonUiStatus, ExecutionFlowController } from "./controllers/execution-flow.js";
import { ExecutionProgressController, type ExecutionProgressSnapshot } from "./controllers/execution-progress.js";
import { ModeLifecycleController, type ModeLifecycleSnapshot } from "./controllers/mode-lifecycle.js";
import { PlanArtifactController, isValidTouchedPlanPath, validatePlanPath, type PlanArtifactSnapshot } from "./controllers/plan-artifact.js";
import { extractExecutionSignals, type ExecutionNoticeKind, type ExecutionReplanTrigger } from "./execution-evidence.ts";
import { formatExecutionNotice, formatPlanModeStatus, formatPlanReviewFailureNotice } from "./presentation.ts";
import { loadReviewSnapshot, ReviewGateController } from "./controllers/review-gates.js";
import { NORMAL_MODE_TOOLS } from "./runtime/constants.js";
import {
  collectGitChangedPaths,
  runDotdotgodCli,
} from "./runtime/dotdotgod-cli.js";
import {
  getMessageText,
  isAssistantMessage,
  truncateText,
} from "./runtime/messages.js";
import {
  ARCHIVE_DIRECTORY,
  configureDocumentationPaths,
  DOCUMENTATION_ROOT,
  getToolPath,
  isActivePlanMarkdownPath,
  normalizeToolPath,
  PLAN_DIRECTORY,
} from "./runtime/paths.js";
import {
  buildPlanModeRequestFraming,
  selectLatestPlanningRequest,
} from "./context.js";
import {
  normalizeImpactPath,
  shouldTrackImpactPath,
  type PendingImpactItem,
} from "./impact.js";
import {
  getCurrentPlanReadmePath,
  planModeFollowUpDeliveryOptions,
} from "./plans.js";
import {
  buildPlanModeContextPrompt,
  buildPlanExecutionContextPrompt,
  buildPlanReplanHandoffBlock,
  resolvePlanModeTools,
  shouldPromptForPlanChoice,
  shouldShapePlanningContextOnAgentStart,
} from "./prompts.js";
import {
  normalizePlanCommandRequest,
} from "./tools.js";

export default function planModeExtension(pi: ExtensionAPI): void {
  const modeLifecycle = new ModeLifecycleController();
  const planArtifact = new PlanArtifactController();
  const contextShaping = new ContextShapingController();
  const impactState = (ctx: ExtensionContext) => new ImpactState(ctx.cwd, ctx.sessionManager.getSessionId());
  const executionProgress = new ExecutionProgressController();
  const executionEvidence = new ExecutionEvidenceController();
  const executionSummary = () => executionEvidence.projectUxSummary(modeLifecycle.mode, planArtifact.currentPlanPath, executionProgress.todos);
  const policy = new PolicyRuntime();
  const children = new ChildManager(pi, policy);
  const pendingAdmissions = new Map<string, ReturnType<typeof stageAdmission>>();
  const pendingHc = new Map<string,{request:HcCommand;generation:number;command:string}>();
  // Pin planning execution to the same environment/context that approvals inspect.
  const bashDefinition=createBashToolDefinition(process.cwd());
  pi.registerTool({...bashDefinition,execute:async(id,args,signal,update,ctx)=>{
    const managed=pendingHc.get(id);
    if(managed){
      pendingHc.delete(id);policy.refresh(ctx.cwd);
      if(!modeLifecycle.restrictsMutation||managed.generation!==policy.generation||managed.command!==args.command)throw new Error("Plan mode: hc approval context changed.");
      const output=await children.execute(managed.request,ctx,signal);
      return {content:[{type:"text" as const,text:output}],details:undefined};
    }
    const admit = pendingAdmissions.get(id);
    pendingAdmissions.delete(id);
    const frozenEnv = admit ? await admit(args.command,ctx.cwd,ctx.sessionManager.getSessionId(),signal) : undefined;
    if (modeLifecycle.restrictsMutation && !admit) throw new Error("Plan mode: missing command admission.");
    const settings=pi.getSettings() as {shellPath?:string;shellCommandPrefix?:string};
    const options=modeLifecycle.restrictsMutation
      ? {exposeSessionEnvironment:false,spawnHook:(value:{command:string;cwd:string;env:NodeJS.ProcessEnv})=>({...value,env:frozenEnv ?? {...process.env}})}
      : {...(settings.shellPath?{shellPath:settings.shellPath}:{}),...(settings.shellCommandPrefix?{commandPrefix:settings.shellCommandPrefix}:{})};
    return createBashToolDefinition(ctx.cwd,options).execute(id,args,signal,update,ctx);
  }});

  function getContextDebugFlag(name: string): string | boolean | undefined {
    const value = pi.getFlag(name);
    if (value !== undefined) return value;
    if (name !== "dd-context-debug" && name !== "dd-context-debug-output") return undefined;

    // load-project owns these flags; Pi scopes getFlag to the registering extension.
    const booleanFlag = name === "dd-context-debug";
    const option = `--${name}`;
    const prefix = `${option}=`;
    const argv = process.argv.slice(2);
    let fallback: string | boolean | undefined;
    for (const [i, arg] of argv.entries()) {
      if (arg === "--") break;
      if (arg.startsWith(prefix)) {
        const inlineValue = arg.slice(prefix.length);
        fallback = booleanFlag ? inlineValue === "true" : inlineValue;
      } else if (arg === option) {
        const next = argv[i + 1];
        if (booleanFlag) fallback = next !== "false";
        else fallback = next !== undefined && !next.startsWith("-") ? next : undefined;
      }
    }
    return fallback;
  }

  function refreshPlanModePolicy(cwd: string): void {
    const result = runDotdotgodCli(cwd, ["config", cwd, "--json"]);
    const data = result.data as { config?: { documentation?: { root?: unknown } } } | undefined;
    const documentationRoot = data?.config?.documentation?.root;
    configureDocumentationPaths(typeof documentationRoot === "string" ? documentationRoot : "docs");
  }
  const contextOrchestration = new ContextOrchestrationController(
    modeLifecycle,
    planArtifact,
    contextShaping,
    {
      getFlag: getContextDebugFlag,
      persistState: () => persistState(),
    },
  );
  const reviewGates = new ReviewGateController();
  const executionFlow = new ExecutionFlowController(
    modeLifecycle,
    planArtifact,
    contextShaping,
    executionProgress,
    executionEvidence,
    {
      getFlag: getContextDebugFlag,
      appendEntry: (customType, data) => pi.appendEntry(customType, data),
      sendUserMessage: (message, options) => pi.sendUserMessage(message, options),
      setNormalTools: () => setOwnedActiveTools(NORMAL_MODE_TOOLS),
      setPlanningTools: () => syncPlanModeTools(),
      sendStatus: (content) => sendExecutionStatus(content),
      updateStatus: (ctx) => updateStatus(ctx),
      persistState: (completed) => persistState(completed),
      escalateToPlanning: (ctx, trigger) => escalateToPlanning(ctx, trigger),
    },
  );

  pi.registerFlag("dd-plan", {
    description: "Start in plan mode (safe exploration plus configured documentation-plan updates)",
    type: "boolean",
    default: false,
  });
  pi.registerFlag("plan-extra-tools", {
    description:
      "Comma-separated extra tool names to allow in Plan Mode when those tools are installed",
    type: "string",
    default: "",
  });

  function updateStatus(ctx: ExtensionContext): void {
    const status = formatPlanModeStatus(executionSummary());
    ctx.ui.setStatus("plan-mode", status && (ctx.hasUI ? ctx.ui.theme.fg(status.color, status.text) : status.text));
  }

  function sendExecutionStatus(content: string): void {
    pi.sendMessage({ customType: "plan-mode-execution-status", content, display: true }, { triggerTurn: false });
  }

  function showExecutionNotice(ctx: ExtensionContext, kind: ExecutionNoticeKind): void {
    const notice = formatExecutionNotice(kind, executionSummary());
    if (ctx.hasUI) ctx.ui.notify(notice.message, notice.level);
    else if (canSendNonUiStatus(ctx)) sendExecutionStatus(notice.message);
  }

  function updateImpactStatus(ctx: ExtensionContext): void {
    // Clear any legacy display, including after session restoration.
    ctx.ui.setStatus("impact-check", undefined);
    ctx.ui.setWidget("impact-check", undefined);
  }

  function trackPendingImpact(
    ctx: ExtensionContext,
    path: string,
  ): void {
    const normalized = normalizeImpactPath(ctx.cwd, path);
    if (!normalized || !shouldTrackImpactPath(normalized)) return;
    impactState(ctx).mark([path]);
    updateImpactStatus(ctx);
  }

  function buildPendingImpactReminder(ctx: ExtensionContext): string | undefined {
    return impactReminder(impactState(ctx).status());
  }

  function getPlanModeOwnedTools(): string[] {
    const availableTools = pi.getAllTools().map((tool) => tool.name);
    return [...new Set([...NORMAL_MODE_TOOLS, ...resolvePlanModeTools(undefined, availableTools)])];
  }

  function setOwnedActiveTools(desiredOwned: readonly string[]): string[] {
    const activeTools = composeActiveTools(
      pi.getActiveTools(),
      getPlanModeOwnedTools(),
      desiredOwned,
    );
    pi.setActiveTools(activeTools);
    return activeTools;
  }

  function clearExecutionAuthority(): void {
    executionFlow.cancelPendingHandoff();
    pendingAdmissions.clear();
    pendingHc.clear();
    executionEvidence.clearVolatileRunState();
  }

  async function revokeChildren(ctx: ExtensionContext, reason: string): Promise<boolean> {
    try {
      await children.revokeAll(reason);
      return true;
    } catch {
      if (ctx.hasUI) ctx.ui.notify("Could not revoke all managed children. Plan Mode remains restricted.", "warning");
      return false;
    }
  }

  async function escalateToPlanning(ctx: ExtensionContext, trigger?: ExecutionReplanTrigger): Promise<void> {
    modeLifecycle.escalateToPlanning(getPlanModeTools());
    modeLifecycle.activeTools = setOwnedActiveTools(modeLifecycle.activeTools);
    clearExecutionAuthority();
    planArtifact.pendingReviewPath = undefined;
    planArtifact.suppressChoiceForInlineRequest = false;
    contextShaping.fullPromptInjected = false;
    executionEvidence.replanTrigger = trigger;
    policy.clear();
    refreshPlanModePolicy(ctx.cwd);
    policy.refresh(ctx.cwd);
    updateStatus(ctx);
    // Revoke even if the planning checkpoint could not be written.
    try { persistState(); }
    finally { await revokeChildren(ctx, "Parent returned to planning"); }
  }

  async function setPlanModeEnabled(ctx: ExtensionContext, enabled: boolean): Promise<boolean> {
    modeLifecycle.enablePlanning(getPlanModeTools());
    modeLifecycle.activeTools = setOwnedActiveTools(modeLifecycle.activeTools);
    clearExecutionAuthority();
    policy.clear();
    const generation = modeLifecycle.currentGeneration;
    const revoked = await revokeChildren(ctx, "Parent mode changed");
    if (modeLifecycle.currentGeneration !== generation) return false;
    if (!revoked) {
      updateStatus(ctx);
      persistState();
      return false;
    }
    executionProgress.clear();
    executionEvidence.clear();
    planArtifact.resetForFreshPlanning();
    if (enabled) {
      refreshPlanModePolicy(ctx.cwd);
      policy.refresh(ctx.cwd);
      contextShaping.resetForPlanning();
      recordContextMetric(ctx, getContextDebugFlag, "plan-mode:enabled", {
        entryCount: ctx.sessionManager.getBranch().length,
        tools: modeLifecycle.activeTools,
      });
    } else {
      modeLifecycle.disable();
      contextShaping.clearQueuedWork();
      setOwnedActiveTools(NORMAL_MODE_TOOLS);
    }
    updateStatus(ctx);
    persistState();
    ctx.ui.notify(enabled
      ? `Plan mode enabled. Tools: ${modeLifecycle.activeTools.join(", ")}`
      : "Plan mode disabled. Full access restored.");
    return true;
  }

  function getPlanModeTools(): string[] {
    const availableTools = pi.getAllTools().map((tool) => tool.name);
    return resolvePlanModeTools(pi.getFlag("plan-extra-tools"), availableTools);
  }

  function syncPlanModeTools(): void {
    if (!modeLifecycle.planningEnabled || modeLifecycle.executing) return;
    modeLifecycle.activeTools = setOwnedActiveTools(getPlanModeTools());
  }

  function persistState(completed?: true): void {
    const evidence = completed ? undefined : executionEvidence.snapshot();
    pi.appendEntry("plan-mode", {
      version: 2,
      mode: modeLifecycle.snapshot(),
      artifact: planArtifact.snapshot(),
      context: contextShaping.snapshot(),
      execution: completed ? { todos: [] } : executionProgress.snapshot(),
      ...(evidence && { executionEvidence: evidence }),
    });
  }

  pi.registerCommand("impact-check", {
    description: "Run dotdotgod graph impact for pending and git-changed files",
    handler: async (_args, ctx) => {
      const paths = [...new Set([...impactState(ctx).snapshot().map(item => item.path), ...collectGitChangedPaths(ctx.cwd)])];
      if (paths.length === 0) {
        ctx.ui.notify(
          "No source/config files need dotdotgod impact checks.",
          "info",
        );
        return;
      }
      pi.sendUserMessage(`Run the project_impact tool from the dotdotgod_context MCP server for these paths in batches of at most 20, inspect success and related evidence, and report any pending paths. Do not clear pending state on failure. Paths: ${JSON.stringify(paths)}`, { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("dd:plan", {
    description:
      "Toggle plan mode, or enable it and send a planning request with /dd:plan <request>",
    handler: async (args, ctx) => {
      const request = normalizePlanCommandRequest(args);
      if (!request) {
        await setPlanModeEnabled(ctx, !modeLifecycle.active);
        return;
      }

      if (modeLifecycle.executing) {
        const escalation = escalateToPlanning(ctx);
        const generation = modeLifecycle.currentGeneration;
        await escalation;
        if (generation !== modeLifecycle.currentGeneration) return;
      } else if (modeLifecycle.reviewing) {
        modeLifecycle.returnToPlanning();
      } else if (!modeLifecycle.planningEnabled && !await setPlanModeEnabled(ctx, true)) return;

      const existingPlanPath = planArtifact.loadExistingPlanPath(ctx.cwd, request, executionEvidence.attemptId !== undefined);
      if (existingPlanPath) {
        planArtifact.pendingInlinePlanningRequest = undefined;
        planArtifact.lastPlanningRequest = `Use existing plan ${existingPlanPath}`;
        planArtifact.suppressChoiceForInlineRequest = false;
        updateStatus(ctx);
        ctx.ui.notify(
          `Loaded existing plan ${existingPlanPath} for review.`,
          "info",
        );
        persistState();
        return;
      }

      const normalizedRequest = truncateText(request);
      planArtifact.resetForPlanningRequest(normalizedRequest);

      pi.sendUserMessage(request, planModeFollowUpDeliveryOptions());
      if (!ctx.isIdle()) {
        ctx.ui.notify("Plan request queued for the next turn.", "info");
      }
      persistState();
    },
  });

  pi.registerShortcut(Key.ctrlAlt("p"), {
    description: "Toggle plan mode",
    handler: async (ctx) => { await setPlanModeEnabled(ctx, !modeLifecycle.active); },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!modeLifecycle.restrictsMutation) return;
    policy.refresh(ctx.cwd);
    await ensureProjectPolicy(ctx,policy);

    if (isMcpTool(event.toolName) && !["execute", "index", "search", "fetch_and_index", "stats", "doctor", "session_resume", "ingestion_job_start", "ingestion_job_status", "project_load", "project_impact", "impact_status", "embedding_status"].some(name => event.toolName === mcpTool(name))) {
      return { block: true, reason: "Plan mode: write-capable MCP operation is unavailable until execution mode." };
    }

    if (event.toolName === "bash" || event.toolName === mcpTool("execute")) {
      const batch = event.input as {commands?: ExecutionInput[];cwd?: string};
      const entries = event.toolName === "bash" ? [event.input as ExecutionInput] : batch.commands ?? [];
      const approvalBatch = policy.batch();
      const hostRoot=ctx.cwd, hostSession=ctx.sessionManager.getSessionId(), hostTrust=ctx.isProjectTrusted();
      approvalBatch.checks.push(()=>ctx.cwd===hostRoot && ctx.sessionManager.getSessionId()===hostSession && ctx.isProjectTrusted()===hostTrust);
      const updates: Array<() => void> = [];
      const generation = policy.generation;
      const approved: Array<{input:ExecutionInput;key:string;source:"native"|"mcp"}> = [];
      try {
        for (const entry of entries) {
          const input = {...entry, ...(entry.cwd ?? batch.cwd ? {cwd:entry.cwd ?? batch.cwd} : {})};
          const tokens=input.executable?[input.executable,...(input.args??[])]:tokenizeShellCommand(input.command??"");
          const managed=tokens?parseHcCommand(tokens):undefined;
          if(managed){
            if(event.toolName!=="bash")return {block:true,reason:"Plan mode: stateful hc operations require native bash so restriction readiness is preserved."};
            if(policy.error)return {block:true,reason:policy.error};
            const requested=resolveInvocation(input,ctx.cwd);
            const actual=resolveInvocation({executable:"hc",args:tokens!.slice(1)},ctx.cwd);
            if(requested.executable!==actual.executable)return {block:true,reason:"Plan mode: managed hc must resolve to the active hc executable."};
            if(policy.deniesInvocation(actual))return {block:true,reason:"Plan policy: explicit hc deny."};
            pendingHc.set(event.toolCallId,{request:managed,generation:policy.generation,command:input.command!});
            return;
          }
          const result = await authorizeExecution(policy,input,event.toolName === "bash" ? "native" : "mcp",v => approveCommand(ctx,v,policy.scopes(v)),approvalBatch);
          if (!result.decision.allow) return {block:true,reason:result.decision.reason ?? "Plan mode: command blocked."};
          approved.push({input,key:JSON.stringify(result.invocation),source:event.toolName==="bash"?"native":"mcp"});
          if(event.toolName === "bash") updates.push(() => {event.input.command=result.executed.command;});
          else updates.push(() => {
            entry.executable=result.executed.executable;entry.args=result.executed.args;entry.shell=false;
          });
        }
        policy.refresh(ctx.cwd);
        if(generation!==policy.generation || approved.some(a=>JSON.stringify(resolveInvocation(a.input,ctx.cwd,a.source))!==a.key))return {block:true,reason:"Plan policy or execution context changed during batch approval."};
        approvalBatch.checks.push(()=>approved.every(a=>{try{return JSON.stringify(resolveInvocation(a.input,ctx.cwd,a.source))===a.key;}catch{return false;}}));
        for(const update of updates)update();
        if (event.toolName === "bash") pendingAdmissions.set(event.toolCallId,stageAdmission(policy,approvalBatch,event.input.command as string,ctx.cwd,ctx.sessionManager.getSessionId(),()=>modeLifecycle.restrictsMutation,()=>({cwd:ctx.cwd,session:ctx.sessionManager.getSessionId(),trusted:ctx.isProjectTrusted()})));
        else { const finalized = await policy.finalize(approvalBatch); if (!finalized.allow) return {block:true,reason:finalized.reason ?? "Plan mode: command denied."}; }
      } catch(error) {return {block:true,reason:`Plan mode: ${String(error)}`};}
      return;
    }

    if (!["read","grep","find","ls","write","edit",mcpTool("index"),mcpTool("search"),mcpTool("fetch_and_index"),mcpTool("stats"),mcpTool("doctor"),mcpTool("session_resume"),mcpTool("ingestion_job_start"),mcpTool("ingestion_job_status"),mcpTool("project_load"),mcpTool("project_impact"),mcpTool("impact_status"),mcpTool("embedding_status"),"project_memory_load","codemode","questionnaire"].includes(event.toolName)) return {block:true,reason:"Plan mode: unclassified tool is unavailable until execution mode."};

    if (event.toolName === "write" || event.toolName === "edit") {
      const path = getToolPath(event.input);
      const decision = path ? await policy.authorizePath(normalizeToolPath(path),p => approvePath(ctx,p)) : {allow:false};
      if (!decision.allow) {
        return {
          block: true,
          reason: decision.reason ?? "Plan mode: Markdown planning documents require a permitted path.",
        };
      }
      const normalizedPath = normalizeToolPath(path!).replace(/\\/g, "/");
      if (!planArtifact.touchedPlanPaths.includes(normalizedPath)) {
        planArtifact.markTouched(normalizedPath);
      }
      if (path && isActivePlanMarkdownPath(ctx.cwd, path)) {
        const candidate = validatePlanPath(ctx.cwd, getCurrentPlanReadmePath(relative(ctx.cwd, resolve(ctx.cwd, normalizeToolPath(path)))));
        if (candidate) planArtifact.setActivePlan(candidate, executionEvidence.attemptId !== undefined);
      }
    }
  });

  pi.on("tool_execution_start", (event) => {
    if (modeLifecycle.executing) executionEvidence.recordToolStart(event.toolCallId, modeLifecycle.currentGeneration);
  });

  pi.on("tool_result", (event, ctx) => {
    pendingHc.delete(event.toolCallId);
    if (event.toolName === "edit" || event.toolName === "write") {
      const path = getToolPath(event.input);
      if (event.isError || !path) return;
      trackPendingImpact(ctx, path);
      if (modeLifecycle.executing && executionEvidence.recordObservedEdit(ctx.cwd, path)) updateStatus(ctx);
      persistState();
    } else if (modeLifecycle.executing && (event.toolName === "bash" || event.toolName === mcpTool("execute"))) {
      const start = executionEvidence.consumeToolStart(event.toolCallId);
      if (start && start.generation === modeLifecycle.currentGeneration && executionEvidence.recordObservedCommands(ctx.cwd, event, start)) {
        updateStatus(ctx);
        persistState();
      }
    }
  });

  pi.on("context", (event) => {
    const planning = modeLifecycle.planningEnabled && !modeLifecycle.executing;
    const activeAttemptId = executionEvidence.attemptId;
    const activeRunId = executionEvidence.activeRunId;
    return { messages: event.messages.filter((message) => {
      const msg = message as AgentMessage & { customType?: string; details?: { attemptId?: unknown; runId?: unknown } };
      if (msg.customType === "plan-mode-execution-status") return false;
      if (msg.customType === "plan-mode-context") return planning;
      if (msg.customType === "plan-execution-context" || msg.customType === "plan-execution-continue") {
        return modeLifecycle.executing && typeof activeAttemptId === "string" && msg.details?.attemptId === activeAttemptId
          && (msg.customType !== "plan-execution-continue" || (activeRunId > 0 && msg.details?.runId === activeRunId));
      }
      if (planning || msg.role !== "user") return true;
      const content = msg.content;
      return typeof content === "string" ? !content.includes("[PLAN MODE ACTIVE]")
        : !Array.isArray(content) || !content.some(c => c.type === "text" && c.text.includes("[PLAN MODE ACTIVE]"));
    }) };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (modeLifecycle.planningEnabled && !modeLifecycle.executing) {
      const selection = selectLatestPlanningRequest({
        currentRequest: planArtifact.lastPlanningRequest,
        latestUserText: truncateText(typeof event.prompt === "string" ? event.prompt : ""),
        pendingInlineRequest: planArtifact.pendingInlinePlanningRequest,
      });
      if (selection.changed) {
        planArtifact.lastPlanningRequest = selection.request;
        planArtifact.pendingInlinePlanningRequest = selection.pendingInlineRequest;
        persistState();
      }
    }

    if (
      shouldShapePlanningContextOnAgentStart({
        mode: modeLifecycle.mode,
        planningContextShapePending: contextShaping.shapePending,
      })
    ) {
      contextShaping.shapePending = false;
      recordContextMetric(
        ctx,
        getContextDebugFlag,
        "plan-mode:initial-context-shape",
        { entryCount: ctx.sessionManager.getEntries().length },
      );
      if (modeLifecycle.planningEnabled && !modeLifecycle.executing) {
        contextOrchestration.refreshPlanningAdvisoryContext(ctx);
      }
      persistState();
    }

    const impactReminder = buildPendingImpactReminder(ctx);

    if (modeLifecycle.injectsPlanningPrompt) {
      if (modeLifecycle.activeTools.length === 0)
        modeLifecycle.activeTools = getPlanModeTools();
      const baseContent = buildPlanModeContextPrompt(
        contextShaping.fullPromptInjected,
        modeLifecycle.activeTools,
        DOCUMENTATION_ROOT,
      );
      const requestFraming = buildPlanModeRequestFraming(planArtifact.lastPlanningRequest);
      const content = [
        baseContent,
        requestFraming,
        contextShaping.advisorySummary,
        buildPlanReplanHandoffBlock(executionSummary()),
        impactReminder,
      ]
        .filter(Boolean)
        .join("\n\n");
      contextShaping.fullPromptInjected = true;
      persistState();
      return {
        message: {
          customType: "plan-mode-context",
          content,
          display: false,
        },
      };
    }

    if (modeLifecycle.injectsExecutionPrompt) {
      executionEvidence.beginRun();
      updateStatus(ctx);
      return {
        message: {
          customType: "plan-execution-context",
          content: buildPlanExecutionContextPrompt(executionSummary(), executionProgress.todos, {
            planDirectory: PLAN_DIRECTORY, archiveDirectory: ARCHIVE_DIRECTORY, impactReminder,
          }),
          display: false,
          details: { attemptId: executionEvidence.attemptId },
        },
      };
    }

    if (impactReminder) {
      return {
        message: {
          customType: "impact-check-context",
          content: impactReminder,
          display: false,
        },
      };
    }
  });

  pi.on("turn_start", () => {
    if (!modeLifecycle.executing) return;
    executionEvidence.pendingCompletion = undefined;
    executionEvidence.pendingNonUiStatusNotice = undefined;
    executionEvidence.lastBeforeSettleOutcome = undefined;
  });

  pi.on("turn_end", async (event, ctx) => {
    if (modeLifecycle.planningEnabled && !modeLifecycle.executing) {
      recordContextMetric(
        ctx,
        getContextDebugFlag,
        "plan-mode:turn-end",
        { entryCount: ctx.sessionManager.getEntries().length },
      );
    }

    if (!modeLifecycle.executing || !isAssistantMessage(event.message)
      || event.message.stopReason === "aborted" || event.message.stopReason === "error") return;
    const text = getMessageText(event.message);
    executionEvidence.markObservedExecutionTurn();
    executionProgress.markCompletedFromText(text);
    executionEvidence.recordExecutionSignal(extractExecutionSignals(text));
    updateStatus(ctx);
    persistState();
  });

  pi.on("agent_before_settle", (event, ctx) => executionFlow.handleBeforeSettle(event, ctx));
  pi.on("agent_settled", (event, ctx) => executionFlow.handleSettled(event, ctx));

  pi.on("user_bash", async (event, ctx) => {
    if(!modeLifecycle.restrictsMutation)return;
    policy.refresh(ctx.cwd);
    await ensureProjectPolicy(ctx,policy);
    try {
      const tokens=tokenizeShellCommand(event.command);
      const managed=tokens?parseHcCommand(tokens):undefined;
      if(managed){
        if(policy.error)throw new Error(policy.error);
        const requested=resolveInvocation({command:event.command,cwd:event.cwd},ctx.cwd);
        const actual=resolveInvocation({executable:"hc",args:tokens!.slice(1)},ctx.cwd);
        if(requested.executable!==actual.executable)throw new Error("Plan mode: managed hc must resolve to the active hc executable.");
        if(policy.deniesInvocation(actual))throw new Error("Plan policy: explicit hc deny.");
        const output=await children.execute(managed,ctx);
        return {result:{output,exitCode:0,cancelled:false,truncated:false}};
      }
      const batch = policy.batch();
      const hostRoot=ctx.cwd, hostSession=ctx.sessionManager.getSessionId(), hostTrust=ctx.isProjectTrusted();
      batch.checks.push(()=>ctx.cwd===hostRoot && ctx.sessionManager.getSessionId()===hostSession && ctx.isProjectTrusted()===hostTrust);
      const {decision,executed,invocation}=await authorizeExecution(policy,{command:event.command,cwd:event.cwd},"native",v=>approveCommand(ctx,v,policy.scopes(v)),batch);
      const invocationKey=JSON.stringify(invocation), requestedCommand=event.command, requestedCwd=event.cwd;
      batch.checks.push(()=>{try{return JSON.stringify(resolveInvocation({command:requestedCommand,cwd:requestedCwd},hostRoot))===invocationKey;}catch{return false;}});
      const admit = stageAdmission(policy,batch,event.command,event.cwd,ctx.sessionManager.getSessionId(),()=>modeLifecycle.restrictsMutation,()=>({cwd:ctx.cwd,session:ctx.sessionManager.getSessionId(),trusted:ctx.isProjectTrusted()}));
      if(decision.allow)return {operations:{exec: async (command,cwd,options)=> {
        const env = await admit(command,cwd,ctx.sessionManager.getSessionId(),options.signal);
        return createLocalBashOperations().exec(executed.command,executed.cwd,{...options,env});
      }}};
      return {result:{output:decision.reason??"Plan mode: command denied.",exitCode:1,cancelled:false,truncated:false}};
    } catch(error){return {result:{output:String(error),exitCode:1,cancelled:false,truncated:false}};}
  });

  pi.on("tool_execution_end", event => {
    pendingHc.delete(event.toolCallId);
    pendingAdmissions.delete(event.toolCallId);
    executionEvidence.cleanupToolCall(event.toolCallId);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    modeLifecycle.enablePlanning(getPlanModeTools());
    modeLifecycle.activeTools = setOwnedActiveTools(modeLifecycle.activeTools);
    clearExecutionAuthority();
    policy.reset();
    await revokeChildren(ctx, "Parent session ended");
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (modeLifecycle.mode !== "planning") return;
    if (planArtifact.suppressChoiceForInlineRequest) {
      planArtifact.suppressChoiceForInlineRequest = false;
      planArtifact.pendingReviewPath = undefined;
      persistState();
      return;
    }

    if (!ctx.hasUI && planArtifact.pendingReviewPath) {
      if (canSendNonUiStatus(ctx)) pi.sendMessage({
        customType: "plan-decisions-pending",
        content: describePendingPlanDecisions(ctx.cwd, planArtifact.pendingReviewPath),
        display: true,
      }, { triggerTurn: false });
      planArtifact.pendingReviewPath = undefined;
      persistState();
      return;
    }

    const shouldShowChoice = shouldPromptForPlanChoice({
      mode: modeLifecycle.mode,
      hasUI: ctx.hasUI,
      pendingPlanChoicePath: planArtifact.pendingReviewPath,
      suppressPlanChoice: planArtifact.suppressChoiceForInlineRequest,
    });
    if (!shouldShowChoice) return;

    const inferredPlanPath = planArtifact.inferPlanPath();
    const snapshot = loadReviewSnapshot(ctx.cwd, inferredPlanPath);
    if (!snapshot.ok) {
      const notice = formatPlanReviewFailureNotice(snapshot.reason);
      ctx.ui.notify(notice.message, notice.level);
      planArtifact.pendingReviewPath = undefined;
      persistState();
      return;
    }

    const reviewGeneration = modeLifecycle.beginReview();
    if (reviewGeneration === undefined) return;
    updateStatus(ctx);

    try {
      const queueResult = await reviewGates.promptForDiscussionQueue(ctx, snapshot, () =>
        modeLifecycle.isCurrentReview(reviewGeneration) && planArtifact.inferPlanPath() === inferredPlanPath,
      );
      if (!modeLifecycle.isCurrentReview(reviewGeneration)) return;
      if (queueResult) {
        modeLifecycle.returnToPlanning();
        updateStatus(ctx);
        planArtifact.pendingReviewPath = undefined;
        const prompt = buildDecisionWizardFollowUp(
          inferredPlanPath,
          queueResult,
        );
        if (prompt)
          pi.sendUserMessage(prompt, planModeFollowUpDeliveryOptions());
        persistState();
        return;
      }

      const choice = await reviewGates.promptForPlanReviewChoice(ctx, snapshot);
      if (!modeLifecycle.isCurrentReview(reviewGeneration)) return;
      if (planArtifact.inferPlanPath() !== inferredPlanPath) {
        modeLifecycle.returnToPlanning();
        updateStatus(ctx);
        persistState();
        return;
      }
      planArtifact.pendingReviewPath = undefined;

      await executionFlow.handleReviewChoice(ctx, choice, snapshot, reviewGeneration);
    } catch {
      if (modeLifecycle.isCurrentReview(reviewGeneration)) {
        modeLifecycle.returnToPlanning();
        planArtifact.pendingReviewPath = undefined;
        syncPlanModeTools();
        updateStatus(ctx);
      }
      ctx.ui.notify("Plan review failed safely; execution was not started.", "warning");
    }
  });

  async function restoreBranchState(ctx: ExtensionContext, source: "start" | "tree"): Promise<void> {
    modeLifecycle.enablePlanning(getPlanModeTools());
    modeLifecycle.activeTools = setOwnedActiveTools(modeLifecycle.activeTools);
    clearExecutionAuthority();
    planArtifact.restore({ suppressChoiceForInlineRequest: false, touchedPlanPaths: [] });
    contextShaping.restore({ shapePending: false, fullPromptInjected: false, advisoryContextStatus: "pending" });
    executionProgress.clear();
    executionEvidence.clear();
    if (source === "start") policy.reset();
    else policy.clear();
    refreshPlanModePolicy(ctx.cwd);
    policy.refresh(ctx.cwd);
    const generation = modeLifecycle.currentGeneration;
    const revoked = await revokeChildren(ctx, source === "start" ? "Parent session changed" : "Parent branch changed");
    if (modeLifecycle.currentGeneration !== generation) return;
    if (!revoked) {
      updateStatus(ctx);
      return;
    }

    const entries = ctx.sessionManager.getBranch();
    const latest = entries.filter(entry => entry.type === "custom" && entry.customType === "plan-mode").pop();
    const data = (latest?.type === "custom" ? latest.data : undefined) as {
      version?: number;
      mode?: ModeLifecycleSnapshot;
      artifact?: Partial<PlanArtifactSnapshot>;
      context?: ContextShapingSnapshot;
      execution?: ExecutionProgressSnapshot;
      executionEvidence?: unknown;
      gates?: { pendingImpactItems?: PendingImpactItem[] };
    } | undefined;
    let notice: ExecutionNoticeKind | undefined;
    if (data?.version === 2 && data.mode
      && ["off", "planning", "reviewing", "executing"].includes(data.mode.mode)) {
      const savedMode = data.mode.mode;
      modeLifecycle.restore({ mode: savedMode });
      modeLifecycle.returnToPlanning();

      const artifact = data.artifact;
      const active = (path: unknown) => typeof path === "string" ? validatePlanPath(ctx.cwd, path) : undefined;
      let currentPlanPath = active(artifact?.currentPlanPath);
      let pendingReviewPath = active(artifact?.pendingReviewPath);
      const invalidActivePath = (artifact?.currentPlanPath !== undefined && currentPlanPath !== artifact.currentPlanPath)
        || (artifact?.pendingReviewPath !== undefined && pendingReviewPath !== artifact.pendingReviewPath);
      if (savedMode === "executing" && invalidActivePath) currentPlanPath = undefined;
      if (savedMode === "reviewing" || invalidActivePath) pendingReviewPath = undefined;
      planArtifact.restore({
        ...(currentPlanPath && { currentPlanPath }),
        ...(pendingReviewPath && { pendingReviewPath }),
        suppressChoiceForInlineRequest: artifact?.suppressChoiceForInlineRequest === true,
        ...(typeof artifact?.lastPlanningRequest === "string" && { lastPlanningRequest: artifact.lastPlanningRequest }),
        ...(typeof artifact?.pendingInlinePlanningRequest === "string" && { pendingInlinePlanningRequest: artifact.pendingInlinePlanningRequest }),
        touchedPlanPaths: Array.isArray(artifact?.touchedPlanPaths)
          ? artifact.touchedPlanPaths.filter(path => typeof path === "string" && isValidTouchedPlanPath(ctx.cwd, path)).slice(-12)
          : [],
      });
      contextShaping.restore(data.context);

      const todos = data.execution?.todos;
      const validTodos = Array.isArray(todos)
        && todos.every(todo => todo && Number.isSafeInteger(todo.step) && todo.step > 0
          && typeof todo.text === "string" && typeof todo.completed === "boolean")
        && new Set(todos.map(todo => todo.step)).size === todos.length;
      if (validTodos) executionProgress.setTodos(todos.map(({ step, text, completed }) => ({ step, text, completed })));
      const evidenceRestored = executionEvidence.restore(data.executionEvidence, {
        cwd: ctx.cwd, mode: modeLifecycle.mode, currentPlanPath, entries,
      });

      if (modeLifecycle.executing) {
        if (!evidenceRestored || !validTodos || invalidActivePath) {
          const legacy = data.executionEvidence === undefined && !invalidActivePath && (validTodos || data.execution === undefined);
          if (legacy) executionProgress.replayCompletedFromSessionEntries(entries);
          modeLifecycle.enablePlanning(getPlanModeTools());
          executionEvidence.beginRecovery(currentPlanPath);
          planArtifact.pendingReviewPath = undefined;
          planArtifact.suppressChoiceForInlineRequest = false;
          contextShaping.fullPromptInjected = false;
          notice = legacy ? "legacy_executing_recovery" : "corrupted_evidence_recovery";
        } else {
          executionProgress.replayCompletedFromSessionEntries(entries, executionEvidence.attemptId);
          if (source === "tree") notice = "branch_switch_executing";
        }
      } else if (!modeLifecycle.active) executionEvidence.clear();

      // Startup migration is independent of execution evidence; /tree never imports it.
      const legacyPending = data.gates?.pendingImpactItems;
      if (source === "start" && Array.isArray(legacyPending) && legacyPending.length
        && !entries.some(entry => entry.type === "custom" && entry.customType === "impact-mcp-migrated")) {
        impactState(ctx).mark(legacyPending.flatMap(item => typeof item?.path === "string" ? [item.path] : []));
        pi.appendEntry("impact-mcp-migrated", { version: 1 });
      }
    } else modeLifecycle.disable();

    if (source === "start" && pi.getFlag("dd-plan") === true) {
      modeLifecycle.enablePlanning(getPlanModeTools());
      planArtifact.pendingReviewPath = undefined;
      planArtifact.suppressChoiceForInlineRequest = false;
      contextShaping.resetForPlanning();
      executionEvidence.clearVolatileRunState();
    }

    if (modeLifecycle.restrictsMutation) {
      syncPlanModeTools();
      if (source === "start") recordContextMetric(ctx, getContextDebugFlag, "plan-mode:session-start-enabled", {
        entryCount: entries.length,
        tools: modeLifecycle.activeTools,
      });
    } else setOwnedActiveTools(NORMAL_MODE_TOOLS);
    updateStatus(ctx);
    updateImpactStatus(ctx);
    if (notice) {
      if (notice !== "branch_switch_executing") persistState();
      showExecutionNotice(ctx, notice);
    }
  }

  pi.on("session_start", (_event, ctx) => restoreBranchState(ctx, "start"));
  pi.on("session_tree", (_event, ctx) => restoreBranchState(ctx, "tree"));
}
