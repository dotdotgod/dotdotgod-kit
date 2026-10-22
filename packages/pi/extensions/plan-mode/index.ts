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
  isManagedPlanMarkdownPath,
  normalizeToolPath,
  PLAN_DIRECTORY,
  planPathExists,
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
  buildPlanReviewDisplayMarkdown,
  buildPlanReviewMarkdown,
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
  shouldAllowPlanModeBashCommand,
} from "./tools.js";

export default function planModeExtension(pi: ExtensionAPI): void {
  const modeLifecycle = new ModeLifecycleController();
  const planArtifact = new PlanArtifactController();
  const contextShaping = new ContextShapingController();
  const impactState = (ctx: ExtensionContext) => new ImpactState(ctx.cwd, ctx.sessionManager.getSessionId());
  const executionProgress = new ExecutionProgressController();

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
    if (enabled) {
      refreshPlanModePolicy(ctx.cwd);
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
    const executionCommands = event.toolName === "bash"
      ? [event.input.command as string]
      : event.toolName === mcpTool("execute")
        ? ((event.input as Record<string, unknown>).commands as { command?: string; executable?: string; args?: string[] }[] ?? []).map((entry) => entry.executable ? [entry.executable, ...(entry.args ?? [])].map((value) => /^[\w./:-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`).join(" ") : entry.command ?? "")
        : [];
    if (!modeLifecycle.restrictsMutation) return;

    if (isMcpTool(event.toolName) && !["execute", "index", "search", "fetch_and_index", "stats", "doctor", "session_resume", "ingestion_job_start", "ingestion_job_status", "project_load", "project_impact", "impact_status", "embedding_status"].some(name => event.toolName === mcpTool(name))) {
      return { block: true, reason: "Plan mode: write-capable MCP operation is unavailable until execution mode." };
    }

    for (const command of executionCommands) {
      const decision = await shouldAllowPlanModeBashCommand(command, {
        hasUI: ctx.hasUI,
        confirm: (title, message) => ctx.ui.confirm(title, message),
      });
      if (!decision.allow) {
        return {
          block: true,
          reason: decision.reason ?? "Plan mode: command blocked.",
        };
      }
    }
    if (executionCommands.length) return;

    if (event.toolName === "write" || event.toolName === "edit") {
      const path = getToolPath(event.input);
      if (!path || !isManagedPlanMarkdownPath(ctx.cwd, path)) {
        return {
          block: true,
          reason: `Plan mode: ${event.toolName} is only allowed for Markdown planning documents, regardless of location. Keep source and config unchanged; use execution mode for implementation.`,
        };
      }
      const normalizedPath = normalizeToolPath(path).replace(/\\/g, "/");
      if (!planArtifact.touchedPlanPaths.includes(normalizedPath)) {
        planArtifact.markTouched(normalizedPath);
      }
      if (isActivePlanMarkdownPath(ctx.cwd, path)) {
        planArtifact.setActivePlanFromMarkdownPath(path);
      }
    }
  });

  pi.on("tool_result", async (event, ctx) => {
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
              (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
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

  pi.on("session_shutdown", () => modeLifecycle.disable());
  pi.on("session_tree", () => {
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
