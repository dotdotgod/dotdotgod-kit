export type PlanModeRuntimeMode = "off" | "planning" | "reviewing" | "executing";

export interface ModeLifecycleSnapshot {
	mode: PlanModeRuntimeMode;
	activeTools: string[];
}

export class ModeLifecycleController {
	mode: PlanModeRuntimeMode = "off";
	activeTools: string[] = [];

	get planningEnabled(): boolean {
		return this.mode === "planning" || this.mode === "reviewing";
	}

	get executing(): boolean {
		return this.mode === "executing";
	}

	enablePlanning(activeTools: string[]): void {
		this.mode = "planning";
		this.activeTools = [...activeTools];
	}

	disable(): void {
		this.mode = "off";
		this.activeTools = [];
	}

	startExecution(): void {
		this.mode = "executing";
		this.activeTools = [];
	}

	completeExecution(): void {
		this.mode = "off";
		this.activeTools = [];
	}

	snapshot(): ModeLifecycleSnapshot {
		return {
			mode: this.mode,
			activeTools: [...this.activeTools],
		};
	}

	restore(snapshot: ModeLifecycleSnapshot | undefined): void {
		if (!snapshot) return;
		this.mode = snapshot.mode;
		this.activeTools = [...snapshot.activeTools];
	}
}
