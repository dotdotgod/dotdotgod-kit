/**
 * Customized Plan Mode Extension
 *
 * Planning-only exploration and document management without filesystem-area ACLs.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { createLocalBashOperations, createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { PolicyRuntime } from "./policy/runtime.ts";
import { approveCommand, approvePath, ensureProjectPolicy } from "./policy/ui.ts";
import { authorizeExecution } from "./policy/execution.ts";
import { resolveInvocation, type ExecutionInput } from "./policy/invocation.ts";
import { ChildManager } from "./children/manager.ts";
import { parseHcCommand, type HcCommand } from "./children/hc-command.ts";
import { tokenizeShellCommand } from "./tools.ts";
import { ImpactState, impactReminder } from "@dotdotgod/context";
import { isMcpTool, mcpTool } from "../shared/mcp.ts";
import { buildDecisionWizardFollowUp } from "./decision-wizard.ts";
import { describePendingPlanDecisions } from "./controllers/decision-wizard.ts";
import { recordContextMetric } from "../context-metrics/utils.js";
import { composeActiveTools } from "../shared/active-tools.js";
import { ContextOrchestrationController } from "./controllers/context-orchestration.js";
import { ContextShapingController, type ContextShapingSnapshot } from "./controllers/context-shaping.js";
import { ExecutionFlowController } from "./controllers/execution-flow.js";
import { ExecutionProgressController, type ExecutionProgressSnapshot } from "./controllers/execution-progress.js";
import { ModeLifecycleController, type ModeLifecycleSnapshot } from "./controllers/mode-lifecycle.js";
import { PlanArtifactController, type PlanArtifactSnapshot } from "./controllers/plan-artifact.js";
import { ReviewGateController } from "./controllers/review-gates.js";
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
  planModeFollowUpDeliveryOptions,
} from "./plans.js";
import {
  buildPlanModeContextPrompt,
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
  const policy = new PolicyRuntime();
  const children = new ChildManager(pi, policy);
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
    const settings=pi.getSettings() as {shellPath?:string;shellCommandPrefix?:string};
    const options=modeLifecycle.restrictsMutation
      ? {exposeSessionEnvironment:false,spawnHook:(value:{command:string;cwd:string;env:NodeJS.ProcessEnv})=>({...value,env:{...process.env}})}
      : {...(settings.shellPath?{shellPath:settings.shellPath}:{}),...(settings.shellCommandPrefix?{commandPrefix:settings.shellCommandPrefix}:{})};
    return createBashToolDefinition(ctx.cwd,options).execute(id,args,signal,update,ctx);
  }});

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
      getFlag: (name) => pi.getFlag(name),
      persistState: () => persistState(),
    },
  );
  const reviewGates = new ReviewGateController();
  const executionFlow = new ExecutionFlowController(
    modeLifecycle,
    planArtifact,
    contextShaping,
    executionProgress,
    {
      getFlag: (name) => pi.getFlag(name),
      appendEntry: (customType, data) => pi.appendEntry(customType, data),
      sendUserMessage: (message, options) => pi.sendUserMessage(message, options),
      setNormalTools: () => setOwnedActiveTools(NORMAL_MODE_TOOLS),
      updateStatus: (ctx) => updateStatus(ctx),
      persistState: () => persistState(),
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
    if (modeLifecycle.executing && executionProgress.todos.length > 0) {
      const completed = executionProgress.todos.filter((t) => t.completed).length;
      ctx.ui.setStatus(
        "plan-mode",
        ctx.ui.theme.fg("accent", `📋 ${completed}/${executionProgress.todos.length}`),
      );
    } else if (modeLifecycle.planningEnabled) {
      ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
    } else {
      ctx.ui.setStatus("plan-mode", undefined);
    }
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
    persistState();
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

  function setPlanModeEnabled(ctx: ExtensionContext, enabled: boolean): void {
    policy.clear();
    void children.revokeAll("Parent mode changed").catch(error=>ctx.ui.notify(String(error),"error"));
    if (enabled) {
      refreshPlanModePolicy(ctx.cwd);
      policy.refresh(ctx.cwd);
      executionProgress.clear();
      planArtifact.resetForFreshPlanning();
      contextShaping.resetForPlanning();
      modeLifecycle.enablePlanning(getPlanModeTools());
      modeLifecycle.activeTools = setOwnedActiveTools(modeLifecycle.activeTools);
      recordContextMetric(
        ctx,
        (name) => pi.getFlag(name),
        "plan-mode:enabled",
        {
          entryCount: ctx.sessionManager.getEntries().length,
          tools: modeLifecycle.activeTools,
        },
      );
      ctx.ui.notify(
        `Plan mode enabled. Tools: ${modeLifecycle.activeTools.join(", ")}`,
      );
    } else {
      modeLifecycle.disable();
      executionProgress.clear();
      planArtifact.pendingReviewPath = undefined;
      planArtifact.suppressChoiceForInlineRequest = false;
      contextShaping.clearQueuedWork();
      setOwnedActiveTools(NORMAL_MODE_TOOLS);
      ctx.ui.setStatus("plan-mode", undefined);
      ctx.ui.notify("Plan mode disabled. Full access restored.");
    }
    updateStatus(ctx);
    persistState();
  }

  function getPlanModeTools(): string[] {
    const availableTools = pi.getAllTools().map((tool) => tool.name);
    return resolvePlanModeTools(pi.getFlag("plan-extra-tools"), availableTools);
  }

  function syncPlanModeTools(): void {
    if (!modeLifecycle.planningEnabled || modeLifecycle.executing) return;
    modeLifecycle.activeTools = setOwnedActiveTools(getPlanModeTools());
  }

  function persistState(): void {
    pi.appendEntry("plan-mode", {
      version: 2,
      mode: modeLifecycle.snapshot(),
      artifact: planArtifact.snapshot(),
      context: contextShaping.snapshot(),
      execution: executionProgress.snapshot(),
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
        setPlanModeEnabled(ctx, !modeLifecycle.active);
        return;
      }

      if (!modeLifecycle.planningEnabled || modeLifecycle.executing) {
        setPlanModeEnabled(ctx, true);
      }

      const existingPlanPath = planArtifact.loadExistingPlanPath(ctx.cwd, request);
      if (existingPlanPath) {
        executionProgress.loadTodosFromPlan(ctx.cwd, existingPlanPath);
        planArtifact.pendingInlinePlanningRequest = undefined;
        planArtifact.lastPlanningRequest = `Use existing plan ${existingPlanPath}`;
        planArtifact.suppressChoiceForInlineRequest = false;
        updateStatus(ctx);
        ctx.ui.notify(
          `Loaded existing plan ${existingPlanPath} with ${executionProgress.todos.length} todo${executionProgress.todos.length === 1 ? "" : "s"}.`,
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
    handler: async (ctx) => setPlanModeEnabled(ctx, !modeLifecycle.active),
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
          const result = await authorizeExecution(policy,input,event.toolName === "bash" ? "native" : "mcp",v => approveCommand(ctx,v));
          if (!result.decision.allow) return {block:true,reason:result.decision.reason ?? "Plan mode: command blocked."};
          approved.push({input,key:JSON.stringify(result.invocation),source:event.toolName==="bash"?"native":"mcp"});
          if(event.toolName === "bash") updates.push(() => {event.input.command=result.executed.command;});
          else updates.push(() => {
            entry.executable=result.executed.executable;entry.args=result.executed.args;entry.shell=false;
          });
        }
        policy.refresh(ctx.cwd);
        if(generation!==policy.generation || approved.some(a=>JSON.stringify(resolveInvocation(a.input,ctx.cwd,a.source))!==a.key))return {block:true,reason:"Plan policy or execution context changed during batch approval."};
        for(const update of updates)update();
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
        planArtifact.setActivePlanFromMarkdownPath(path);
      }
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    pendingHc.delete(event.toolCallId);
    if (event.isError) return;
    if (event.toolName === "edit" || event.toolName === "write") {
      const path = getToolPath(event.input);
      if (path) trackPendingImpact(ctx, path);
      return;
    }
    // Only a successful shared MCP review clears durable pending state. Shell
    // command text is not evidence that a review completed for this revision.
  });

  pi.on("context", async (event) => {
    if (modeLifecycle.restrictsMutation) return;

    return {
      messages: event.messages.filter((m) => {
        const msg = m as AgentMessage & { customType?: string };
        if (msg.customType === "plan-mode-context") return false;
        if (msg.role !== "user") return true;

        const content = msg.content;
        if (typeof content === "string") {
          return !content.includes("[PLAN MODE ACTIVE]");
        }
        if (Array.isArray(content)) {
          return !content.some(
            (c) =>
              c.type === "text" &&
              c.text?.includes("[PLAN MODE ACTIVE]"),
          );
        }
        return true;
      }),
    };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (modeLifecycle.planningEnabled && !modeLifecycle.executing) {
      const selection = selectLatestPlanningRequest({
        currentRequest: planArtifact.lastPlanningRequest,
        latestUserText: truncateText(event.prompt),
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
        (name) => pi.getFlag(name),
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
      const remaining = executionProgress.todos.filter((t) => !t.completed);
      const todoList = remaining.length > 0
        ? remaining.map((t) => `${t.step}. ${t.text}`).join("\n")
        : "No tracked Plan: steps were extracted. Execute the approved plan scope, then report completion.";
      return {
        message: {
          customType: "plan-execution-context",
          content: `[EXECUTING PLAN - Full tool access enabled]

Active plan: ${planArtifact.currentPlanPath ?? "unknown"}

Remaining plan steps:
${todoList}

Execute each step in order.
After completing any step, include its [DONE:n] tag in the same assistant response.
Final responses after implementation or verification MUST include [DONE:n] for every step completed in that turn.
Example: after completing step 1, include [DONE:1]. If steps 1 and 2 are both complete, include [DONE:1] [DONE:2].
After modification or coding work, run dotdotgod validate for the project before final completion. Prefer the local source CLI form when available: node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index.
When implementation and verification are complete, move the completed task directory from ${PLAN_DIRECTORY}/<task-slug>/ to ${ARCHIVE_DIRECTORY}/plan/<task-slug>/ as the final housekeeping step and include the archive step's [DONE:n] tag.

If an out-of-scope change is required, stop and ask the user for confirmation.${impactReminder ? `\n\n${impactReminder}` : ""}`,
          display: false,
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

  pi.on("turn_end", async (event, ctx) => {
    if (modeLifecycle.planningEnabled && !modeLifecycle.executing) {
      recordContextMetric(
        ctx,
        (name) => pi.getFlag(name),
        "plan-mode:turn-end",
        { entryCount: ctx.sessionManager.getEntries().length },
      );
    }

    if (!modeLifecycle.executing || executionProgress.todos.length === 0) return;
    if (!isAssistantMessage(event.message)) return;

    const text = getMessageText(event.message);
    if (executionProgress.markCompletedFromText(text) > 0) {
      updateStatus(ctx);
    }
    persistState();
  });

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
      const {decision,executed}=await authorizeExecution(policy,{command:event.command,cwd:event.cwd},"native",v=>approveCommand(ctx,v));
      if(decision.allow)return {operations:{exec: (_command,cwd,options)=>createLocalBashOperations().exec(executed.command,cwd,{...options,env:{...process.env}})}};
      return {result:{output:decision.reason??"Plan mode: command denied.",exitCode:1,cancelled:false,truncated:false}};
    } catch(error){return {result:{output:String(error),exitCode:1,cancelled:false,truncated:false}};}
  });

  pi.on("tool_execution_end", event => {pendingHc.delete(event.toolCallId);});
  pi.on("session_shutdown", async () => {pendingHc.clear();policy.reset();await children.revokeAll("Parent session ended");modeLifecycle.disable();});
  pi.on("session_tree", async () => {
    policy.clear();await children.revokeAll("Parent branch changed");
    if (modeLifecycle.reviewing) modeLifecycle.returnToPlanning();
  });

  pi.on("agent_end", async (event, ctx) => {
    if (executionFlow.completeExecutionIfDone(ctx)) return;

    if (!modeLifecycle.planningEnabled) return;
    if (planArtifact.suppressChoiceForInlineRequest) {
      planArtifact.suppressChoiceForInlineRequest = false;
      planArtifact.pendingReviewPath = undefined;
      persistState();
      return;
    }

    if (!ctx.hasUI && planArtifact.pendingReviewPath) {
      pi.sendMessage({
        customType: "plan-decisions-pending",
        content: describePendingPlanDecisions(ctx.cwd, planArtifact.pendingReviewPath),
        display: true,
      });
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
    const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
    executionProgress.loadTodosFromPlanOrText(
      ctx.cwd,
      inferredPlanPath,
      lastAssistant ? getMessageText(lastAssistant) : undefined,
    );

    const reviewGeneration = modeLifecycle.beginReview();
    if (reviewGeneration === undefined) return;
    updateStatus(ctx);
    persistState();

    try {
      const queueResult = await reviewGates.promptForDiscussionQueue(ctx, inferredPlanPath, () =>
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

      const choice = await reviewGates.promptForPlanReviewChoice(
        ctx,
        inferredPlanPath,
        executionProgress.todos,
      );
      if (!modeLifecycle.isCurrentReview(reviewGeneration)) return;
      if (planArtifact.inferPlanPath() !== inferredPlanPath) {
        modeLifecycle.returnToPlanning();
        updateStatus(ctx);
        persistState();
        return;
      }
      planArtifact.pendingReviewPath = undefined;

      await executionFlow.handleReviewChoice(ctx, choice, inferredPlanPath, reviewGeneration);
    } catch (error) {
      if (modeLifecycle.isCurrentReview(reviewGeneration)) {
        modeLifecycle.returnToPlanning();
        planArtifact.pendingReviewPath = undefined;
        syncPlanModeTools();
        updateStatus(ctx);
        persistState();
      }
      ctx.ui.notify(
        `Plan review failed safely; execution was not started. ${error instanceof Error ? error.message : String(error)}`,
        "warning",
      );
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    policy.reset();policy.refresh(ctx.cwd);
    refreshPlanModePolicy(ctx.cwd);
    if (pi.getFlag("dd-plan") === true) {
      modeLifecycle.enablePlanning(getPlanModeTools());
      contextShaping.shapePending = true;
    }

    const entries = ctx.sessionManager.getEntries();

    const planModeEntry = entries
      .filter(
        (e: { type: string; customType?: string }) =>
          e.type === "custom" && e.customType === "plan-mode",
      )
      .pop() as
      | {
          data?: {
            version?: number;
            mode?: ModeLifecycleSnapshot;
            artifact?: PlanArtifactSnapshot;
            context?: ContextShapingSnapshot;
            gates?: { pendingImpactItems?: PendingImpactItem[] };
            execution?: ExecutionProgressSnapshot;
          };
        }
      | undefined;

    if (planModeEntry?.data?.version === 2) {
      modeLifecycle.restore(planModeEntry.data.mode);
      // A review overlay cannot survive a session boundary; recover to visible planning.
      modeLifecycle.returnToPlanning();
      planArtifact.restore(planModeEntry.data.artifact);
      contextShaping.restore(planModeEntry.data.context);
      executionProgress.restore(planModeEntry.data.execution);
    }

    // Startup restriction wins over restored off/executing state.
    if (pi.getFlag("dd-plan") === true) modeLifecycle.enablePlanning(getPlanModeTools());

    // Import legacy snapshots once; later session resumes must not resurrect
    // paths already reviewed through MCP.
    const legacyPending = planModeEntry?.data?.gates?.pendingImpactItems ?? [];
    if (legacyPending.length && !entries.some((entry) => entry.type === "custom" && entry.customType === "impact-mcp-migrated")) {
      impactState(ctx).mark(legacyPending.map(item => item.path));
      pi.appendEntry("impact-mcp-migrated", { version: 1 });
    }

    const isResume = planModeEntry !== undefined;
    if (isResume && modeLifecycle.executing && executionProgress.todos.length > 0) {
      executionProgress.replayCompletedFromSessionEntries(entries);
    }

    if (modeLifecycle.restrictsMutation) {
      modeLifecycle.activeTools = setOwnedActiveTools(getPlanModeTools());
      recordContextMetric(
        ctx,
        (name) => pi.getFlag(name),
        "plan-mode:session-start-enabled",
        {
          entryCount: ctx.sessionManager.getEntries().length,
          tools: modeLifecycle.activeTools,
        },
      );
    } else {
      setOwnedActiveTools(NORMAL_MODE_TOOLS);
    }
    updateStatus(ctx);
    updateImpactStatus(ctx);
  });
}
