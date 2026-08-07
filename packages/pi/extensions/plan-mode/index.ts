/**
 * Customized Plan Mode Extension
 *
 * Safe exploration mode for code analysis and docs/plan plan-file management.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Key, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { recordContextMetric } from "../context-metrics/utils.js";
import { composeActiveTools } from "../shared/active-tools.js";
import { ContextOrchestrationController } from "./controllers/context-orchestration.js";
import { ContextShapingController, type ContextShapingSnapshot } from "./controllers/context-shaping.js";
import { ExecutionFlowController } from "./controllers/execution-flow.js";
import { ExecutionProgressController, type ExecutionProgressSnapshot } from "./controllers/execution-progress.js";
import { GateController, type GateSnapshot } from "./controllers/gates.js";
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
  getTextContent,
  isAssistantMessage,
  truncateText,
} from "./runtime/messages.js";
import {
  ARCHIVE_DIRECTORY,
  DEFAULT_PLAN_MODE_WRITABLE_PATHS,
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
  formatExpandableToolOutput,
  type PendingImpactItem,
} from "./impact.js";
import {
  buildDiscussionQueueFollowUp,
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

const DotdotgodGraphImpactParams = Type.Object({
  changed: Type.Optional(
    Type.String({
      description: "Changed file path to check with dotdotgod graph impact",
    }),
  ),
  paths: Type.Optional(
    Type.Array(Type.String(), {
      description: "Changed file paths to check with dotdotgod graph impact",
    }),
  ),
});

export default function planModeExtension(pi: ExtensionAPI): void {
  const modeLifecycle = new ModeLifecycleController();
  const planArtifact = new PlanArtifactController();
  const contextShaping = new ContextShapingController();
  const gates = new GateController();
  const executionProgress = new ExecutionProgressController();
  let writablePaths: readonly string[] = DEFAULT_PLAN_MODE_WRITABLE_PATHS;

  function refreshPlanModePolicy(cwd: string): void {
    const result = runDotdotgodCli(cwd, ["config", cwd, "--json"]);
    const data = result.data as { config?: { planMode?: { writablePaths?: unknown } } } | undefined;
    const configured = data?.config?.planMode?.writablePaths;
    writablePaths = Array.isArray(configured) && configured.every((value) => typeof value === "string")
      ? configured as string[]
      : DEFAULT_PLAN_MODE_WRITABLE_PATHS;
  }
  const contextOrchestration = new ContextOrchestrationController(
    modeLifecycle,
    planArtifact,
    contextShaping,
    executionProgress,
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
    description: "Start in plan mode (safe exploration plus docs/plan updates)",
    type: "boolean",
    default: false,
  });
  pi.registerFlag("plan-extra-tools", {
    description:
      "Comma-separated extra tool names to allow in Plan Mode when those tools are installed",
    type: "string",
    default: "",
  });

  pi.registerTool({
    name: "dotdotgod_graph_impact",
    label: "dotdotgod graph impact",
    description:
      "Run bounded dotdotgod graph impact checks for changed files and clear pending Pi impact reminders after success.",
    promptSnippet:
      "Run dotdotgod graph impact for changed files before broad tests, commits, pushes, or publishing.",
    promptGuidelines: [
      "Use dotdotgod_graph_impact after source/config edits and before broad tests, commits, pushes, or publishing when changed files may affect related docs/tests/files.",
    ],
    parameters: DotdotgodGraphImpactParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const paths = [
        ...(params.changed ? [params.changed] : []),
        ...(params.paths ?? []),
      ];
      if (paths.length === 0) {
        return {
          content: [
            { type: "text", text: "Error: changed or paths is required" },
          ],
          details: {
            ok: false,
            error: "changed or paths is required",
            summary: "Error: changed or paths is required",
          },
        };
      }
      const result = runImpactChecks(ctx, paths);
      return {
        content: [{ type: "text", text: result.summary }],
        details: {
          ok: result.failed.length === 0,
          checked: result.checked,
          failed: result.failed,
          pending: gates.pendingImpactItems,
          summary: result.summary,
        },
      };
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial)
        return new Text(
          theme.fg("warning", "Running dotdotgod graph impact..."),
          0,
          0,
        );
      const details =
        result.details && typeof result.details === "object"
          ? (result.details as { summary?: unknown; error?: unknown })
          : undefined;
      const summary =
        typeof details?.summary === "string"
          ? details.summary
          : typeof details?.error === "string"
            ? `Error: ${details.error}`
            : "dotdotgod graph impact completed.";
      const text = formatExpandableToolOutput(
        summary,
        expanded,
        keyHint("app.tools.expand", expanded ? "to collapse" : "to expand"),
      );
      return new Text(text, 0, 0);
    },
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
    if (gates.pendingImpactItems.length === 0) {
      ctx.ui.setStatus("impact-check", undefined);
      ctx.ui.setWidget("impact-check", undefined);
      return;
    }
    ctx.ui.setStatus(
      "impact-check",
      ctx.ui.theme.fg("warning", `🔎 ${gates.pendingImpactItems.length}`),
    );
    ctx.ui.setWidget("impact-check", [
      "dotdotgod impact check pending:",
      ...gates.pendingImpactItems.slice(0, 5).map((item) => `- ${item.path}`),
      ...(gates.pendingImpactItems.length > 5
        ? [`- ... ${gates.pendingImpactItems.length - 5} more`]
        : []),
      "Run /impact-check or dotdotgod_graph_impact before committing.",
    ]);
  }

  function trackPendingImpact(
    ctx: ExtensionContext,
    path: string,
    reason: PendingImpactItem["reason"],
  ): void {
    if (!gates.trackPendingImpact(ctx.cwd, path, reason)) return;
    updateImpactStatus(ctx);
    persistState();
  }

  function runImpactChecks(
    ctx: ExtensionContext,
    paths: string[],
  ): { summary: string; checked: string[]; failed: string[] } {
    const result = gates.runImpactChecks(ctx.cwd, paths, (batch) =>
      runDotdotgodCli(ctx.cwd, [
        "graph",
        "impact",
        ctx.cwd,
        ...batch.flatMap((path) => ["--changed", path]),
        "--yml",
      ]),
    );
    updateImpactStatus(ctx);
    persistState();
    return result;
  }

  function buildPendingImpactReminder(): string | undefined {
    return gates.buildPendingImpactReminder();
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
      gates: gates.snapshot(),
      execution: executionProgress.snapshot(),
    });
  }

  pi.registerCommand("impact-check", {
    description: "Run dotdotgod graph impact for pending and git-changed files",
    handler: async (_args, ctx) => {
      const paths = gates.mergeImpactCheckPaths(ctx.cwd, collectGitChangedPaths(ctx.cwd));
      if (paths.length === 0) {
        ctx.ui.notify(
          "No source/config files need dotdotgod impact checks.",
          "info",
        );
        return;
      }
      const result = runImpactChecks(ctx, paths);
      ctx.ui.notify(
        result.summary,
        result.failed.length > 0 ? "warning" : "info",
      );
    },
  });

  pi.registerCommand("dd:plan", {
    description:
      "Toggle plan mode, or enable it and send a planning request with /dd:plan <request>",
    handler: async (args, ctx) => {
      const request = normalizePlanCommandRequest(args);
      if (!request) {
        setPlanModeEnabled(ctx, !modeLifecycle.planningEnabled);
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
    handler: async (ctx) => setPlanModeEnabled(ctx, !modeLifecycle.planningEnabled),
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      const command = event.input.command as string;
      const commitBlockReason = gates.buildCommitBlockReason(command);
      if (commitBlockReason) {
        return {
          block: true,
          reason: commitBlockReason,
        };
      }
      const broadVerificationPrompt = gates.buildBroadVerificationPrompt(command);
      if (broadVerificationPrompt && ctx.hasUI) {
        const approved = await ctx.ui.confirm(
          "Run broad verification before impact check?",
          broadVerificationPrompt,
        );
        if (!approved) {
          return {
            block: true,
            reason:
              "Blocked: run /impact-check or dotdotgod_graph_impact before broad verification.",
          };
        }
      }
    }

    if (!modeLifecycle.planningEnabled) return;

    if (event.toolName === "bash") {
      const command = event.input.command as string;
      const decision = await shouldAllowPlanModeBashCommand(command, {
        hasUI: ctx.hasUI,
        confirm: (title, message) => ctx.ui.confirm(title, message),
      }, writablePaths);
      if (!decision.allow) {
        return {
          block: true,
          reason: decision.reason ?? "Plan mode: command blocked.",
        };
      }
      return;
    }

    if (event.toolName === "write" || event.toolName === "edit") {
      const path = getToolPath(event.input);
      if (!path || !isManagedPlanMarkdownPath(ctx.cwd, path, writablePaths)) {
        return {
          block: true,
          reason: `Plan mode: ${event.toolName} is only allowed for documentation markdown matching ${writablePaths.join(", ") || "no configured paths"}. Directories must be kebab-case and markdown file names must be UPPER_SNAKE_CASE.md. Use execution mode for source changes.`,
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
      if (path) trackPendingImpact(ctx, path, event.toolName);
      return;
    }
    if (event.toolName === "bash") {
      const command =
        typeof event.input.command === "string" ? event.input.command : "";
      const output = getTextContent(event.content);
      if (gates.clearFromImpactCommandResult(ctx.cwd, command, output)) {
        updateImpactStatus(ctx);
        persistState();
      }
    }
  });

  pi.on("context", async (event) => {
    if (modeLifecycle.planningEnabled) return;

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
        planModeEnabled: modeLifecycle.planningEnabled,
        executionMode: modeLifecycle.executing,
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
        const reason = contextOrchestration.getPlanCompactionReason(ctx);
        if (reason) {
          contextOrchestration.requestPlanningCompaction(ctx, reason);
          persistState();
        } else {
          contextOrchestration.refreshPlanningAdvisoryContext(ctx);
        }
      }
      persistState();
    }

    const impactReminder = buildPendingImpactReminder();

    if (modeLifecycle.planningEnabled) {
      if (modeLifecycle.activeTools.length === 0)
        modeLifecycle.activeTools = getPlanModeTools();
      const baseContent = buildPlanModeContextPrompt(
        contextShaping.fullPromptInjected,
        modeLifecycle.activeTools,
        writablePaths,
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

    if (modeLifecycle.executing && executionProgress.todos.length > 0) {
      const remaining = executionProgress.todos.filter((t) => !t.completed);
      const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
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
When implementation and verification are complete, move the completed task directory from docs/plan/<task-slug>/ to docs/archive/plan/<task-slug>/ as the final housekeeping step and include the archive step's [DONE:n] tag.

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

  pi.on("agent_end", async (event, ctx) => {
    if (executionFlow.completeExecutionIfDone(ctx)) return;

    if (!modeLifecycle.planningEnabled) return;
    if (planArtifact.suppressChoiceForInlineRequest) {
      planArtifact.suppressChoiceForInlineRequest = false;
      planArtifact.pendingReviewPath = undefined;
      persistState();
      return;
    }

    const shouldShowChoice = shouldPromptForPlanChoice({
      planModeEnabled: modeLifecycle.planningEnabled,
      executionMode: modeLifecycle.executing,
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

    const queueResult = await reviewGates.promptForDiscussionQueue(ctx, inferredPlanPath);
    if (queueResult) {
      planArtifact.pendingReviewPath = undefined;
      const prompt = buildDiscussionQueueFollowUp(
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
    planArtifact.pendingReviewPath = undefined;

    await executionFlow.handleReviewChoice(ctx, choice, inferredPlanPath);
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
            gates?: GateSnapshot;
            execution?: ExecutionProgressSnapshot;
          };
        }
      | undefined;

    if (planModeEntry?.data?.version === 2) {
      modeLifecycle.restore(planModeEntry.data.mode);
      planArtifact.restore(planModeEntry.data.artifact);
      contextShaping.restore(planModeEntry.data.context);
      gates.restore(planModeEntry.data.gates);
      executionProgress.restore(planModeEntry.data.execution);
    }

    const isResume = planModeEntry !== undefined;
    if (isResume && modeLifecycle.executing && executionProgress.todos.length > 0) {
      executionProgress.replayCompletedFromSessionEntries(entries);
    }

    if (modeLifecycle.planningEnabled) {
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
    }
    updateStatus(ctx);
    updateImpactStatus(ctx);
  });
}
