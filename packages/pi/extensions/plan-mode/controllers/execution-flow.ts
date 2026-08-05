import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { recordContextMetric } from "../../context-metrics/utils.js";
import { NORMAL_MODE_TOOLS } from "../runtime/constants.js";
import {
	buildPlanExecutionDecision,
	planModeFollowUpDeliveryOptions,
	type PlanReviewChoice,
} from "../plan-review.ts";
import { buildPlanReviewRefinePrompt } from "../plans.ts";
import type { TodoItem } from "../todos.ts";
import type { ContextShapingController } from "./context-shaping.js";
import type { ExecutionProgressController } from "./execution-progress.js";
import type { ModeLifecycleController } from "./mode-lifecycle.js";
import type { PlanArtifactController } from "./plan-artifact.js";

interface ExecutionFlowOptions {
	getFlag: (name: string) => unknown;
	appendEntry: (customType: string, data: unknown) => void;
	sendUserMessage: (
		message: string,
		options?: ReturnType<typeof planModeFollowUpDeliveryOptions>,
	) => void;
	setNormalTools: () => void;
	updateStatus: (ctx: ExtensionContext) => void;
	persistState: () => void;
}

export class ExecutionFlowController {
	constructor(
		private readonly modeLifecycle: ModeLifecycleController,
		private readonly planArtifact: PlanArtifactController,
		private readonly contextShaping: ContextShapingController,
		private readonly executionProgress: ExecutionProgressController,
		private readonly options: ExecutionFlowOptions,
	) {}

	startExplicitExecution(
		ctx: ExtensionContext,
		planPath: string,
		todos: readonly TodoItem[],
	): void {
		this.planArtifact.currentPlanPath = planPath;
		this.executionProgress.setTodos(todos);
		this.startOrDisableExecution();
		this.planArtifact.pendingReviewPath = undefined;
		this.contextShaping.clearQueuedWork();
		this.options.setNormalTools();
		this.options.updateStatus(ctx);
		recordContextMetric(ctx, this.options.getFlag, "plan-mode:execution-start", {
			todoCount: this.executionProgress.todos.length,
			planPath,
			explicit: true,
		});
		this.options.persistState();
	}

	async handleReviewChoice(
		ctx: ExtensionContext,
		choice: PlanReviewChoice | undefined,
		planPath: string | undefined,
	): Promise<void> {
		this.planArtifact.pendingReviewPath = undefined;
		const decision = buildPlanExecutionDecision(
			choice,
			this.executionProgress.todos,
			planPath,
		);
		if (decision.shouldExecute && decision.handoff) {
			this.contextShaping.shapePending = false;
			this.startOrDisableExecution();
			recordContextMetric(ctx, this.options.getFlag, "plan-mode:execution-start", {
				todoCount: this.executionProgress.todos.length,
				planPath,
			});
			this.options.setNormalTools();
			this.options.updateStatus(ctx);

			const handoff = decision.handoff;
			this.options.appendEntry("plan-mode-execute", handoff.marker);
			this.options.persistState();
			setTimeout(() => {
				this.options.sendUserMessage(
					handoff.message,
					planModeFollowUpDeliveryOptions(),
				);
			}, 0);
			return;
		}
		if (choice === "refine") {
			const refinement = await ctx.ui.editor(
				"What should the agent change before execution?",
				"",
			);
			if (refinement?.trim()) {
				this.options.sendUserMessage(
					buildPlanReviewRefinePrompt({
						planPath,
						userFeedback: refinement.trim(),
						context:
							this.executionProgress.todos.length > 0
								? `Extracted execution steps: ${this.executionProgress.todos.map((todo) => `${todo.step}. ${todo.text}`).join("; ")}`
								: undefined,
					}),
					planModeFollowUpDeliveryOptions(),
				);
			}
		}
		this.options.persistState();
	}

	completeExecutionIfDone(ctx: ExtensionContext): boolean {
		if (!this.modeLifecycle.executing || this.executionProgress.todos.length === 0)
			return false;
		if (!this.executionProgress.isComplete()) return true;
		this.modeLifecycle.completeExecution();
		this.executionProgress.clear();
		this.options.setNormalTools();
		this.options.updateStatus(ctx);
		this.options.persistState();
		return true;
	}

	private startOrDisableExecution(): void {
		if (this.executionProgress.todos.length > 0) this.modeLifecycle.startExecution();
		else this.modeLifecycle.disable();
	}
}
