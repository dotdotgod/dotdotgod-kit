export type PlanModeRuntimeMode = "off" | "planning" | "reviewing" | "executing";

export interface ModeLifecycleSnapshot {
	mode: PlanModeRuntimeMode;
	activeTools: string[];
}

export interface LegacyModeLifecycleSnapshot {
	mode?: unknown;
	activeTools?: unknown;
	executing?: unknown;
	planningEnabled?: unknown;
}

const VALID_MODES = new Set<PlanModeRuntimeMode>(["off", "planning", "reviewing", "executing"]);

export class ModeLifecycleController {
	mode: PlanModeRuntimeMode = "off";
	activeTools: string[] = [];
	private generation = 0;

	get active(): boolean {
		return this.mode !== "off";
	}

	get planningEnabled(): boolean {
		return this.mode === "planning" || this.mode === "reviewing";
	}

	get reviewing(): boolean {
		return this.mode === "reviewing";
	}

	get executing(): boolean {
		return this.mode === "executing";
	}

	get restrictsMutation(): boolean {
		return this.planningEnabled;
	}

	get injectsPlanningPrompt(): boolean {
		return this.planningEnabled;
	}

	get injectsExecutionPrompt(): boolean {
		return this.executing;
	}

	enablePlanning(activeTools: string[]): void {
		this.transition("planning", activeTools);
	}

	beginReview(): number | undefined {
		if (this.mode !== "planning") return undefined;
		this.transition("reviewing", this.activeTools);
		return this.generation;
	}

	isCurrentReview(reviewGeneration: number): boolean {
		return this.mode === "reviewing" && this.generation === reviewGeneration;
	}

	returnToPlanning(): void {
		if (this.mode === "reviewing") this.transition("planning", this.activeTools);
	}

	disable(): void {
		this.transition("off", []);
	}

	startExecution(reviewGeneration: number): boolean {
		if (!this.isCurrentReview(reviewGeneration)) return false;
		this.transition("executing", []);
		return true;
	}

	completeExecution(): void {
		if (this.mode === "executing") this.transition("off", []);
	}

	snapshot(): ModeLifecycleSnapshot {
		return {
			mode: this.mode,
			activeTools: [...this.activeTools],
		};
	}

	restore(snapshot: LegacyModeLifecycleSnapshot | undefined): void {
		const explicitMode = typeof snapshot?.mode === "string" && VALID_MODES.has(snapshot.mode as PlanModeRuntimeMode)
			? snapshot.mode as PlanModeRuntimeMode
			: undefined;
		const mode = explicitMode ?? (snapshot?.executing === true
			? "executing"
			: snapshot?.planningEnabled === true
				? "planning"
				: "off");
		const tools = Array.isArray(snapshot?.activeTools)
			? [...new Set(snapshot.activeTools.filter((tool): tool is string => typeof tool === "string" && tool.length > 0))]
			: [];
		this.transition(mode, mode === "planning" || mode === "reviewing" ? tools : []);
	}

	private transition(mode: PlanModeRuntimeMode, activeTools: readonly string[]): void {
		this.mode = mode;
		this.activeTools = [...activeTools];
		this.generation += 1;
	}
}
