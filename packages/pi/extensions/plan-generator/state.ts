import type { PlanGeneratorStageId } from "./stage-state.ts";

export interface PlanGeneratorSessionState {
	currentTaskPath?: string;
	currentStage?: PlanGeneratorStageId;
	currentQuestion?: string;
}

export function createInitialGeneratorState(): PlanGeneratorSessionState {
	return {};
}

export function snapshotGeneratorState(state: PlanGeneratorSessionState): PlanGeneratorSessionState {
	return { ...state };
}

export function restoreGeneratorState(snapshot: unknown): PlanGeneratorSessionState {
	if (!snapshot || typeof snapshot !== "object") return createInitialGeneratorState();
	const value = snapshot as PlanGeneratorSessionState;
	const restored: PlanGeneratorSessionState = {};
	if (typeof value.currentTaskPath === "string") restored.currentTaskPath = value.currentTaskPath;
	if (typeof value.currentStage === "string") restored.currentStage = value.currentStage;
	if (typeof value.currentQuestion === "string") restored.currentQuestion = value.currentQuestion;
	return restored;
}
