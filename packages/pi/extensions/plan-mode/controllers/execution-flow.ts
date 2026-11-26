import type { AgentBeforeSettleEvent, AgentSettledEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { clearTimeout, setTimeout } from "node:timers";
import { recordContextMetric } from "../../context-metrics/utils.ts";
import { computeExecutionProgressFingerprint, evaluateExecutionSettleGate, type ExecutionReplanTrigger, type ReviewSnapshotResult } from "../execution-evidence.ts";
import { buildPlanExecutionDecision, planModeFollowUpDeliveryOptions, type PlanReviewChoice } from "../plan-review.ts";
import { buildPlanReviewRefinePrompt } from "../plans.ts";
import { formatExecutionNotice } from "../presentation.ts";
import { buildExecutionContinueMessage } from "../prompts.ts";
import type { ContextShapingController } from "./context-shaping.ts";
import type { ExecutionEvidenceController } from "./execution-evidence.ts";
import type { ExecutionProgressController } from "./execution-progress.ts";
import type { ModeLifecycleController } from "./mode-lifecycle.ts";
import type { PlanArtifactController } from "./plan-artifact.ts";

export function canSendNonUiStatus(ctx: ExtensionContext): boolean {
	return !ctx.hasUI && (ctx as ExtensionContext & { mode?: string }).mode !== "print";
}

interface ExecutionFlowOptions {
	getFlag: (name: string) => unknown;
	appendEntry: (customType: string, data: unknown) => void;
	sendUserMessage: (message: string, options: ReturnType<typeof planModeFollowUpDeliveryOptions>) => void;
	sendStatus: (content: string) => void;
	setNormalTools: () => void;
	setPlanningTools: () => void;
	updateStatus: (ctx: ExtensionContext) => void;
	persistState: (completed?: true) => void;
	escalateToPlanning: (ctx: ExtensionContext, trigger: ExecutionReplanTrigger) => Promise<void>;
}

export class ExecutionFlowController {
	private handoffTimer: ReturnType<typeof setTimeout> | undefined;

	private readonly modeLifecycle: ModeLifecycleController;
	private readonly planArtifact: PlanArtifactController;
	private readonly contextShaping: ContextShapingController;
	private readonly executionProgress: ExecutionProgressController;
	private readonly evidence: ExecutionEvidenceController;
	private readonly options: ExecutionFlowOptions;

	constructor(
		modeLifecycle: ModeLifecycleController,
		planArtifact: PlanArtifactController,
		contextShaping: ContextShapingController,
		executionProgress: ExecutionProgressController,
		evidence: ExecutionEvidenceController,
		options: ExecutionFlowOptions,
	) {
		this.modeLifecycle = modeLifecycle;
		this.planArtifact = planArtifact;
		this.contextShaping = contextShaping;
		this.executionProgress = executionProgress;
		this.evidence = evidence;
		this.options = options;
	}

	cancelPendingHandoff(): void {
		clearTimeout(this.handoffTimer);
		this.handoffTimer = undefined;
	}

	async handleReviewChoice(
		ctx: ExtensionContext,
		choice: PlanReviewChoice | undefined,
		snapshot: Extract<ReviewSnapshotResult, { ok: true }>,
		reviewGeneration: number,
	): Promise<void> {
		const { modeLifecycle, planArtifact, contextShaping, executionProgress, evidence, options } = this;
		if (!modeLifecycle.isCurrentReview(reviewGeneration)) return;
		const { planPath, todos, verificationContract } = snapshot;
		const { handoff } = buildPlanExecutionDecision(choice, todos, planPath);
		const priorMode = modeLifecycle.snapshot();
		planArtifact.pendingReviewPath = undefined;
		if (handoff) {
			if (!modeLifecycle.startExecution(reviewGeneration)) return;
			const generation = modeLifecycle.currentGeneration;
			const priorPath = planArtifact.currentPlanPath;
			const priorTodos = executionProgress.snapshot();
			const priorEvidence = evidence.snapshot();
			const priorTrigger = evidence.replanTrigger;
			const shapePending = contextShaping.shapePending;
			const attemptId = evidence.beginApprovedExecution({
				planPath, checks: verificationContract.checks, contractHash: verificationContract.contractHash,
				carryForwardDebt: priorPath === planPath,
			});
			planArtifact.currentPlanPath = planPath;
			executionProgress.setTodos(todos);
			contextShaping.shapePending = false;
			try {
				options.appendEntry("plan-mode-execute", { ...handoff.marker, attemptId });
				options.persistState();
			} catch (error) {
				modeLifecycle.restore(priorMode);
				modeLifecycle.returnToPlanning();
				planArtifact.currentPlanPath = priorPath;
				executionProgress.restore(priorTodos);
				evidence.restore(priorEvidence, { cwd: ctx.cwd, mode: "planning", currentPlanPath: priorPath });
				evidence.replanTrigger = priorTrigger;
				contextShaping.shapePending = shapePending;
				options.setPlanningTools();
				options.updateStatus(ctx);
				throw error;
			}
			options.setNormalTools();
			options.updateStatus(ctx);
			recordContextMetric(ctx, options.getFlag, "plan-mode:execution-start", { todoCount: todos.length });
			this.handoffTimer = setTimeout(() => {
				this.handoffTimer = undefined;
				if (!modeLifecycle.executing || generation !== modeLifecycle.currentGeneration || attemptId !== evidence.attemptId) return;
				evidence.beginRun();
				options.sendUserMessage(handoff.message, planModeFollowUpDeliveryOptions());
			}, 0);
			return;
		}
		modeLifecycle.returnToPlanning();
		const generation = modeLifecycle.currentGeneration;
		options.updateStatus(ctx);
		options.persistState();
		if (choice !== "refine") return;
		const refinement = await ctx.ui.editor("What should the agent change before execution?", "");
		if (generation === modeLifecycle.currentGeneration && refinement?.trim()) {
			options.sendUserMessage(buildPlanReviewRefinePrompt({
				planPath, userFeedback: refinement.trim(),
				context: todos.length ? `Extracted execution steps: ${todos.map(todo => `${todo.step}. ${todo.text}`).join("; ")}` : undefined,
			}), planModeFollowUpDeliveryOptions());
		}
	}

	async handleBeforeSettle(event: AgentBeforeSettleEvent, ctx: ExtensionContext) {
		const { modeLifecycle, planArtifact, executionProgress, evidence, options } = this;
		const snapshot = evidence.snapshot();
		if (!modeLifecycle.executing || !snapshot) return;
		const { attemptId } = snapshot;
		const generation = modeLifecycle.currentGeneration;
		const { todos } = executionProgress;
		const summary = evidence.projectUxSummary(modeLifecycle.mode, planArtifact.currentPlanPath, todos);
		const { editRevision, requiredCheckCount, passedRequiredCheckCount } = summary;
		const counts = { editRevision, requiredCheckCount, passedRequiredCheckCount };
		const outcome = evidence.lastBeforeSettleOutcome === "error" && event.outcome === "aborted" ? "error" : event.outcome;
		evidence.lastBeforeSettleOutcome = outcome;
		evidence.pendingCompletion = undefined;
		evidence.pendingNonUiStatusNotice = undefined;
		const decision = evaluateExecutionSettleGate({
			executing: true, outcome,
			hasDispatchedExecutionHandoff: evidence.hasDispatchedExecutionHandoff,
			hasObservedExecutionTurn: evidence.hasObservedExecutionTurn, latestSignal: evidence.latestSignal,
			lastCheck: summary.lastCheck, remainingTodoCount: summary.remainingTodoSteps.length,
			needsSubstantiveVerification: summary.needsSubstantiveVerification,
			missingRequiredCheckIndices: summary.missingRequiredCheckIndices,
			eventContinue: event.continue, pendingMessagesCount: event.context.pendingMessages.length,
			canContinue: event.context.canContinue, runContinuationCount: evidence.runContinuationCount,
			lastProgressFingerprint: evidence.lastProgressFingerprint,
			currentFingerprint: computeExecutionProgressFingerprint(snapshot, todos),
		});
		switch (decision.action) {
			case "noop":
			case "defer_to_other_extension": return;
			case "continue": {
				const { nextAttempt, reasons, progressFingerprint } = decision;
				evidence.runContinuationCount = nextAttempt;
				evidence.lastProgressFingerprint = progressFingerprint;
				evidence.pauseState = undefined;
				options.updateStatus(ctx);
				recordContextMetric(ctx, options.getFlag, "plan-mode:execution-continue", { ...counts, attempt: nextAttempt, maxAttempts: summary.maxContinuations, reasons });
				return { continue: true, entries: [...event.entries, {
					type: "custom_message" as const, customType: "plan-execution-continue",
					content: buildExecutionContinueMessage(summary, nextAttempt), display: false,
					details: { attemptId, runId: evidence.activeRunId },
				}] };
			}
			case "complete":
				evidence.pendingCompletion = { generation, attemptId, metricPayload: {
					editRevision, editedFileCount: snapshot.editedPaths.length, editedFileCountCapped: snapshot.editedPathsTruncated,
					requiredCheckCount, todoCount: todos.length, continuationCount: evidence.runContinuationCount,
				} };
				return;
			case "replan": {
				const { trigger } = decision;
				const escalation = options.escalateToPlanning(ctx, trigger);
				const replanGeneration = modeLifecycle.currentGeneration;
				await escalation;
				if (modeLifecycle.currentGeneration !== replanGeneration || evidence.attemptId !== attemptId) return;
				recordContextMetric(ctx, options.getFlag, "plan-mode:execution-replan", { ...counts, trigger });
				const kind = trigger === "signal" ? "replan_signal" : "replan_consecutive_failures";
				const notice = formatExecutionNotice(kind, summary);
				if (ctx.hasUI) ctx.ui.notify(notice.message, notice.level);
				else if (canSendNonUiStatus(ctx)) evidence.pendingNonUiStatusNotice = { generation: replanGeneration, attemptId, kind, content: notice.message };
				return;
			}
			case "stop": {
				const { reason } = decision;
				evidence.pauseState = reason;
				options.updateStatus(ctx);
				if (reason === "aborted" || reason === "error") return;
				recordContextMetric(ctx, options.getFlag, "plan-mode:execution-pause", { ...counts, reason, continuationCount: evidence.runContinuationCount });
				const notice = formatExecutionNotice(reason, summary);
				if (ctx.hasUI) ctx.ui.notify(notice.message, notice.level);
				else if (canSendNonUiStatus(ctx)) evidence.pendingNonUiStatusNotice = { generation, attemptId, kind: reason, content: notice.message };
			}
		}
	}

	handleSettled(event: AgentSettledEvent & { aborted?: boolean }, ctx: ExtensionContext): void {
		const { modeLifecycle, executionProgress, evidence, options } = this;
		const { pendingCompletion, pendingNonUiStatusNotice, lastBeforeSettleOutcome } = evidence;
		evidence.pendingCompletion = undefined;
		evidence.pendingNonUiStatusNotice = undefined;
		const isCurrent = (pending: { generation: number; attemptId: string }) => pending.generation === modeLifecycle.currentGeneration && pending.attemptId === evidence.attemptId;
		if (pendingNonUiStatusNotice && canSendNonUiStatus(ctx) && isCurrent(pendingNonUiStatusNotice)
			&& (event.aborted !== true || pendingNonUiStatusNotice.kind.startsWith("replan_"))) {
			options.sendStatus(pendingNonUiStatusNotice.content);
		}
		if (!modeLifecycle.executing) return;
		if ((event.aborted === true && lastBeforeSettleOutcome !== "error")
			|| (typeof event.aborted !== "boolean" && lastBeforeSettleOutcome === undefined)) {
			evidence.pauseState = "aborted";
			options.updateStatus(ctx);
		}
		if (!pendingCompletion || event.aborted !== false || !isCurrent(pendingCompletion)) return;
		const priorMode = modeLifecycle.snapshot();
		modeLifecycle.completeExecution();
		try {
			options.persistState(true);
		} catch {
			modeLifecycle.restore(priorMode);
			options.updateStatus(ctx);
			if (ctx.hasUI) ctx.ui.notify("Could not save plan completion; execution remains active.", "warning");
			return;
		}
		executionProgress.clear();
		evidence.clear();
		options.setNormalTools();
		options.updateStatus(ctx);
		recordContextMetric(ctx, options.getFlag, "plan-mode:execution-complete", { ...pendingCompletion.metricPayload });
	}
}
