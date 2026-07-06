import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { recordContextMetric } from "../../context-metrics/utils.js";
import { buildLoadPrompt, collectSnapshot } from "../../load-project/utils.js";
import {
	shouldLoadProjectMemoryForPlanning,
} from "../context.ts";
import { formatReferenceExpansionSummary } from "../impact.ts";
import {
	hasExplicitBracketReferences,
	hasLikelyFuzzyReferences,
	selectPlanImpactPaths,
} from "../plans.ts";
import {
	buildPlanCompactionInstructions,
	buildPlanCompactionResumePrompt,
	getPlanCompactionReason,
} from "../prompts.ts";
import {
	formatPlanCliContextSummary,
	runDotdotgodCli,
} from "../runtime/dotdotgod-cli.js";
import { planPathExists } from "../runtime/paths.js";
import { planModeFollowUpDeliveryOptions } from "../plan-review.ts";
import type { ContextShapingController } from "./context-shaping.js";
import type { ExecutionProgressController } from "./execution-progress.js";
import type { ModeLifecycleController } from "./mode-lifecycle.js";
import type { PlanArtifactController } from "./plan-artifact.js";

interface ContextOrchestrationOptions {
	getFlag: (name: string) => unknown;
	appendEntry: (customType: string, data: unknown) => void;
	sendUserMessage: (
		message: string,
		options?: ReturnType<typeof planModeFollowUpDeliveryOptions>,
	) => void;
	persistState: () => void;
}

export class ContextOrchestrationController {
	constructor(
		private readonly modeLifecycle: ModeLifecycleController,
		private readonly planArtifact: PlanArtifactController,
		private readonly contextShaping: ContextShapingController,
		private readonly executionProgress: ExecutionProgressController,
		private readonly options: ContextOrchestrationOptions,
	) {}

	requestPlanningCompaction(ctx: ExtensionContext, reason: string): void {
		if (this.contextShaping.compactionInFlight) return;

		const entryCount = ctx.sessionManager.getEntries().length;
		if (
			this.contextShaping.lastCompactionEntryCount !== undefined &&
			entryCount - this.contextShaping.lastCompactionEntryCount < 5
		) {
			return;
		}

		const focus = this.contextShaping.buildCurrentWorkFocus({
			currentPlanPath: this.planArtifact.currentPlanPath,
			touchedPlanPaths: this.planArtifact.touchedPlanPaths,
			lastPlanningRequest: this.planArtifact.lastPlanningRequest,
			todos: this.executionProgress.todos,
		});
		this.contextShaping.compactionInFlight = true;
		this.contextShaping.pendingResumePrompt =
			buildPlanCompactionResumePrompt(this.planArtifact.lastPlanningRequest);
		this.contextShaping.pendingResumeReason = "plan-mode-compaction-resume";
		recordContextMetric(
			ctx,
			this.options.getFlag,
			"plan-mode:compaction-request",
			{ reason, entryCount, focus },
		);
		ctx.ui.notify(
			"Planning context is large; compacting before continuing.",
			"info",
		);
		ctx.compact({
			customInstructions: buildPlanCompactionInstructions(reason, focus),
			onComplete: () => {
				this.contextShaping.compactionInFlight = false;
				this.contextShaping.lastCompactionEntryCount =
					ctx.sessionManager.getEntries().length;
				recordContextMetric(
					ctx,
					this.options.getFlag,
					"plan-mode:compaction-complete",
					{ reason, entryCount: this.contextShaping.lastCompactionEntryCount },
				);
				ctx.ui.notify("Planning compaction completed.", "info");
				this.refreshPlanCliContextIfAvailable(ctx);
				let resumeAfterLoad = false;
				if (this.contextShaping.pendingLoadAfterCompaction) {
					this.contextShaping.pendingLoadAfterCompaction = false;
					recordContextMetric(
						ctx,
						this.options.getFlag,
						"plan-mode:load-after-compaction",
						{ reason },
					);
					this.requestPlanningLoadIfNeeded(ctx);
					resumeAfterLoad = this.flushPendingPlanningLoad(ctx);
				}
				if (!resumeAfterLoad) this.flushPendingPlanningResume(ctx);
				this.options.persistState();
			},
			onError: (error) => {
				this.contextShaping.compactionInFlight = false;
				recordContextMetric(
					ctx,
					this.options.getFlag,
					"plan-mode:compaction-error",
					{ reason, error: error.message },
				);
				ctx.ui.notify(`Planning compaction failed: ${error.message}`, "warning");
				this.options.persistState();
			},
		});
	}

	requestPlanningLoadIfNeeded(ctx: ExtensionContext): void {
		if (
			!this.modeLifecycle.planningEnabled ||
			this.modeLifecycle.executing ||
			this.contextShaping.loadInFlight ||
			this.contextShaping.compactionInFlight ||
			this.contextShaping.pendingLoadPrompt
		)
			return;

		const entryCount = ctx.sessionManager.getEntries().length;
		if (
			this.contextShaping.lastLoadEntryCount !== undefined &&
			entryCount - this.contextShaping.lastLoadEntryCount < 10
		) {
			recordContextMetric(ctx, this.options.getFlag, "plan-mode:load-skipped", {
				reason: "debounced",
				entryCount,
			});
			return;
		}
		if (this.contextShaping.hasRecentProjectMemoryLoad(ctx, entryCount)) {
			recordContextMetric(ctx, this.options.getFlag, "plan-mode:load-skipped", {
				reason: "recent-project-memory-load",
				entryCount,
			});
			return;
		}

		this.contextShaping.lastLoadEntryCount = entryCount;
		this.contextShaping.pendingLoadPrompt = buildLoadPrompt(
			ctx.cwd,
			"",
			collectSnapshot(ctx.cwd),
			undefined,
			{ mode: "compact" },
		);
		this.contextShaping.pendingLoadReason = "plan-mode-context-shaping";
		recordContextMetric(ctx, this.options.getFlag, "plan-mode:load-queued", {
			entryCount,
			reason: this.contextShaping.pendingLoadReason,
		});
		this.options.appendEntry("project-memory-load", {
			reason: this.contextShaping.pendingLoadReason,
			entryCount,
			queued: true,
		});
		if (ctx.hasUI) {
			ctx.ui.notify(
				"Project memory looks missing or stale; queued curated project memory load for planning.",
				"info",
			);
		}
		this.options.persistState();
	}

	flushPendingPlanningLoad(ctx: ExtensionContext): boolean {
		if (
			!this.contextShaping.pendingLoadPrompt ||
			this.contextShaping.loadInFlight ||
			this.modeLifecycle.executing
		)
			return false;
		this.contextShaping.loadInFlight = true;
		const prompt = this.contextShaping.pendingLoadPrompt;
		const reason =
			this.contextShaping.pendingLoadReason ?? "plan-mode-context-shaping";
		try {
			this.options.sendUserMessage(prompt, planModeFollowUpDeliveryOptions());
			this.contextShaping.pendingLoadPrompt = undefined;
			this.contextShaping.pendingLoadReason = undefined;
			recordContextMetric(ctx, this.options.getFlag, "plan-mode:load-flushed", {
				reason,
				entryCount: ctx.sessionManager.getEntries().length,
			});
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			recordContextMetric(
				ctx,
				this.options.getFlag,
				"plan-mode:load-flush-error",
				{ reason, error: message },
			);
			if (ctx.hasUI)
				ctx.ui.notify(
					`Planning project-memory load is still queued: ${message}`,
					"warning",
				);
			return false;
		} finally {
			this.contextShaping.loadInFlight = false;
			this.options.persistState();
		}
	}

	flushPendingPlanningResume(ctx: ExtensionContext): boolean {
		if (
			!this.contextShaping.pendingResumePrompt ||
			this.contextShaping.loadInFlight ||
			this.contextShaping.compactionInFlight ||
			this.modeLifecycle.executing ||
			!this.modeLifecycle.planningEnabled
		)
			return false;
		const prompt = this.contextShaping.pendingResumePrompt;
		const reason =
			this.contextShaping.pendingResumeReason ?? "plan-mode-compaction-resume";
		this.contextShaping.pendingResumePrompt = undefined;
		this.contextShaping.pendingResumeReason = undefined;
		recordContextMetric(
			ctx,
			this.options.getFlag,
			"plan-mode:resume-after-compaction",
			{ reason, entryCount: ctx.sessionManager.getEntries().length },
		);
		this.options.persistState();
		setTimeout(() => {
			try {
				this.options.sendUserMessage(prompt, planModeFollowUpDeliveryOptions());
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				recordContextMetric(
					ctx,
					this.options.getFlag,
					"plan-mode:resume-after-compaction-error",
					{ reason, error: message },
				);
				this.contextShaping.pendingResumePrompt = prompt;
				this.contextShaping.pendingResumeReason = reason;
				if (ctx.hasUI)
					ctx.ui.notify(
						`Planning request resume is still queued: ${message}`,
						"warning",
					);
				this.options.persistState();
			}
		}, 0);
		return true;
	}

	shouldLoadForPlanning(ctx: ExtensionContext): boolean {
		if (
			!this.modeLifecycle.planningEnabled ||
			this.modeLifecycle.executing ||
			this.contextShaping.loadInFlight ||
			this.contextShaping.pendingLoadPrompt
		)
			return false;
		const entryCount = ctx.sessionManager.getEntries().length;
		if (
			this.contextShaping.lastLoadEntryCount !== undefined &&
			entryCount - this.contextShaping.lastLoadEntryCount < 10
		)
			return false;
		const hasRecentLoad = this.contextShaping.hasRecentProjectMemoryLoad(
			ctx,
			entryCount,
		);
		const decision = shouldLoadProjectMemoryForPlanning({
			latestRequest: this.planArtifact.lastPlanningRequest,
			contextText: this.contextShaping.getProjectMemoryContextText(ctx),
			hasRecentProjectMemoryLoad: hasRecentLoad,
		});
		return decision.loadNeeded;
	}

	refreshPlanCliContextIfAvailable(ctx: ExtensionContext): void {
		if (
			this.contextShaping.cliContextStatus !== "not_loaded" ||
			!this.modeLifecycle.planningEnabled ||
			this.modeLifecycle.executing
		)
			return;
		const validate = runDotdotgodCli(ctx.cwd, [
			"validate",
			ctx.cwd,
			"--include-local-memory",
			"--check-index",
			"--json",
		]);
		if (!validate.ok) {
			recordContextMetric(
				ctx,
				this.options.getFlag,
				"plan-mode:cli-context-unavailable",
				{ error: validate.error },
			);
			this.contextShaping.markCliUnavailable();
			this.options.persistState();
			return;
		}

		const snapshot = runDotdotgodCli(ctx.cwd, [
			"load-snapshot",
			ctx.cwd,
			"--json",
		]);
		let currentPlanContent: string | undefined;
		if (this.planArtifact.currentPlanPath) {
			try {
				currentPlanContent = readFileSync(
					resolve(ctx.cwd, this.planArtifact.currentPlanPath),
					"utf8",
				);
			} catch {
				currentPlanContent = undefined;
			}
		}
		const impactPaths = selectPlanImpactPaths(
			ctx.cwd,
			this.planArtifact.lastPlanningRequest,
			this.planArtifact.currentPlanPath,
			currentPlanContent,
			this.planArtifact.touchedPlanPaths,
			planPathExists,
		);
		const impacts = impactPaths.map((path) => ({
			path,
			result: runDotdotgodCli(ctx.cwd, [
				"graph",
				"impact",
				ctx.cwd,
				"--changed",
				path,
				"--json",
			]),
		}));
		const contextParts = [formatPlanCliContextSummary(validate, snapshot, impacts)];
		let referenceExpansionSummary = "";
		const hasExplicitReferences = hasExplicitBracketReferences(
			this.planArtifact.lastPlanningRequest,
		);
		const hasFuzzyReferences = hasLikelyFuzzyReferences(
			(this.planArtifact.lastPlanningRequest ?? "").replace(
				/\[\[[^\]\n]+\]\]/g,
				" ",
			),
		);
		const shouldExpandReferences = hasExplicitReferences || hasFuzzyReferences;
		if (shouldExpandReferences) {
			const expansionArgs = [
				"expand",
				ctx.cwd,
				this.planArtifact.lastPlanningRequest ?? "",
				"--json",
				"--with-impact",
			];
			if (hasFuzzyReferences) expansionArgs.push("--fuzzy");
			const expansion = runDotdotgodCli(ctx.cwd, expansionArgs);
			if (expansion.ok) {
				referenceExpansionSummary = formatReferenceExpansionSummary(
					expansion.data,
				);
				if (referenceExpansionSummary)
					contextParts.push(referenceExpansionSummary);
			} else {
				recordContextMetric(
					ctx,
					this.options.getFlag,
					"plan-mode:reference-expansion-unavailable",
					{ error: expansion.error },
				);
			}
		}
		this.contextShaping.setCliSummary(contextParts.filter(Boolean).join("\n\n"));
		recordContextMetric(ctx, this.options.getFlag, "plan-mode:cli-context", {
			hasSummary: Boolean(this.contextShaping.cliSummary),
			impactPaths,
			referenceExpansion: Boolean(referenceExpansionSummary),
		});
		this.options.persistState();
	}

	getPlanCompactionReason(ctx: ExtensionContext): string | undefined {
		return getPlanCompactionReason(ctx.getContextUsage());
	}
}
