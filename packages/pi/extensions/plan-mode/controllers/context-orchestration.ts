import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { recordContextMetric } from "../../context-metrics/utils.js";
import { formatReferenceExpansionSummary } from "../impact.ts";
import {
	hasExplicitBracketReferences,
	hasLikelyFuzzyReferences,
	selectPlanImpactPaths,
} from "../plans.ts";
import {
	buildPlanCompactionInstructions,
	getPlanCompactionReason,
} from "../prompts.ts";
import {
	formatPlanCliContextSummary,
	runDotdotgodCli,
} from "../runtime/dotdotgod-cli.js";
import { planPathExists } from "../runtime/paths.js";
import type { ContextShapingController } from "./context-shaping.js";
import type { ExecutionProgressController } from "./execution-progress.js";
import type { ModeLifecycleController } from "./mode-lifecycle.js";
import type { PlanArtifactController } from "./plan-artifact.js";

interface ContextOrchestrationOptions {
	getFlag: (name: string) => unknown;
	persistState: () => void;
}

export class ContextOrchestrationController {
	private readonly modeLifecycle: ModeLifecycleController;
	private readonly planArtifact: PlanArtifactController;
	private readonly contextShaping: ContextShapingController;
	private readonly executionProgress: ExecutionProgressController;
	private readonly options: ContextOrchestrationOptions;

	constructor(
		modeLifecycle: ModeLifecycleController,
		planArtifact: PlanArtifactController,
		contextShaping: ContextShapingController,
		executionProgress: ExecutionProgressController,
		options: ContextOrchestrationOptions,
	) {
		this.modeLifecycle = modeLifecycle;
		this.planArtifact = planArtifact;
		this.contextShaping = contextShaping;
		this.executionProgress = executionProgress;
		this.options = options;
	}

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
		const contextParts = [formatPlanCliContextSummary(validate, impacts)];
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
