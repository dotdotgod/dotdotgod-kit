export type PlanningAdvisoryContextStatus = "pending" | "ready" | "unavailable";

export interface ContextShapingSnapshot {
	shapePending: boolean;
	fullPromptInjected: boolean;
	advisoryContextStatus: PlanningAdvisoryContextStatus;
	advisorySummary?: string;
}

type LegacyContextShapingSnapshot = Partial<ContextShapingSnapshot> & {
	cliContextStatus?: "not_loaded" | "loaded" | "unavailable";
	cliSummary?: string;
};

export class ContextShapingController {
	shapePending = false;
	fullPromptInjected = false;
	advisoryContextStatus: PlanningAdvisoryContextStatus = "pending";
	advisorySummary: string | undefined;

	resetForPlanning(): void {
		this.fullPromptInjected = false;
		this.shapePending = true;
		this.advisoryContextStatus = "pending";
		this.advisorySummary = undefined;
	}

	clearQueuedWork(): void {
		this.shapePending = false;
	}

	markAdvisoryContextUnavailable(): void {
		this.advisoryContextStatus = "unavailable";
		this.advisorySummary = undefined;
	}

	setAdvisorySummary(summary: string): void {
		this.advisoryContextStatus = "ready";
		this.advisorySummary = summary;
	}

	snapshot(): ContextShapingSnapshot {
		return {
			shapePending: this.shapePending,
			fullPromptInjected: this.fullPromptInjected,
			advisoryContextStatus: this.advisoryContextStatus,
			...(this.advisorySummary ? { advisorySummary: this.advisorySummary } : {}),
		};
	}

	restore(snapshot: LegacyContextShapingSnapshot | undefined): void {
		if (!snapshot) return;
		this.shapePending = snapshot.shapePending ?? false;
		this.fullPromptInjected = snapshot.fullPromptInjected ?? false;
		this.advisoryContextStatus =
			snapshot.advisoryContextStatus ??
			(snapshot.cliContextStatus === "loaded"
				? "ready"
				: snapshot.cliContextStatus === "unavailable"
					? "unavailable"
					: "pending");
		this.advisorySummary = snapshot.advisorySummary ?? snapshot.cliSummary;
	}
}
