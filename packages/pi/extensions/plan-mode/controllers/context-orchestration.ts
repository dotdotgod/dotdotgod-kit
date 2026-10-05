import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { recordContextMetric } from "../../context-metrics/utils.ts";
import { formatReferenceExpansionSummary } from "../impact.ts";
import {
	hasExplicitBracketReferences,
	hasLikelyFuzzyReferences,
	selectPlanImpactPaths,
} from "../plans.ts";
import {
	formatPlanCliContextSummary,
	runDotdotgodCli,
} from "../runtime/dotdotgod-cli.ts";
import { planPathExists } from "../runtime/paths.ts";
import type { ContextShapingController } from "./context-shaping.js";
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
	private readonly options: ContextOrchestrationOptions;

	constructor(
		modeLifecycle: ModeLifecycleController,
		planArtifact: PlanArtifactController,
		contextShaping: ContextShapingController,
		options: ContextOrchestrationOptions,
	) {
		this.modeLifecycle = modeLifecycle;
		this.planArtifact = planArtifact;
		this.contextShaping = contextShaping;
		this.options = options;
	}

	refreshPlanningAdvisoryContext(ctx: ExtensionContext): void {
		if (
			this.contextShaping.advisoryContextStatus !== "pending" ||
			!this.modeLifecycle.planningEnabled ||
			this.modeLifecycle.executing
		)
			return;

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
				"graph", "impact", ctx.cwd, "--changed", path, "--json",
			]),
		}));
		const contextParts = [formatPlanCliContextSummary(impacts)];
		let referenceExpansionSummary = "";
		let expansionUnavailable = false;
		const hasExplicitReferences = hasExplicitBracketReferences(
			this.planArtifact.lastPlanningRequest,
		);
		const hasFuzzyReferences = hasLikelyFuzzyReferences(
			(this.planArtifact.lastPlanningRequest ?? "").replace(/\[\[[^\]\n]+\]\]/g, " "),
		);
		if (hasExplicitReferences || hasFuzzyReferences) {
			const expansionArgs = [
				"expand", ctx.cwd, this.planArtifact.lastPlanningRequest ?? "",
				"--json", "--with-impact",
			];
			if (hasFuzzyReferences) expansionArgs.push("--fuzzy");
			const expansion = runDotdotgodCli(ctx.cwd, expansionArgs);
			if (expansion.ok) {
				referenceExpansionSummary = formatReferenceExpansionSummary(expansion.data);
				if (referenceExpansionSummary) contextParts.push(referenceExpansionSummary);
			} else {
				expansionUnavailable = true;
				recordContextMetric(ctx, this.options.getFlag,
					"plan-mode:reference-expansion-unavailable", { error: expansion.error });
			}
		}
		const allImpactsUnavailable = impacts.length > 0 && impacts.every(({ result }) => !result.ok);
		if ((allImpactsUnavailable && !referenceExpansionSummary) || (expansionUnavailable && impacts.length === 0)) {
			this.contextShaping.markAdvisoryContextUnavailable();
		} else {
			this.contextShaping.setAdvisorySummary(contextParts.filter(Boolean).join("\n\n"));
		}
		recordContextMetric(ctx, this.options.getFlag, "plan-mode:cli-context", {
			hasSummary: Boolean(this.contextShaping.advisorySummary),
			impactPaths,
			referenceExpansion: Boolean(referenceExpansionSummary),
		});
		this.options.persistState();
	}
}
