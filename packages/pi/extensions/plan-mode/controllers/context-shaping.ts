import type { PlanCompactionFocus } from "../prompts.ts";
import type { TodoItem } from "../todos.ts";
import { ARCHIVE_DIRECTORY, isActivePlanPath } from "../runtime/paths.ts";

export type PlanningAdvisoryContextStatus = "pending" | "ready" | "unavailable";

export interface ContextShapingSnapshot {
	compactionInFlight: boolean;
	lastCompactionEntryCount?: number;
	pendingResumePrompt?: string;
	pendingResumeReason?: string;
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
	compactionInFlight = false;
	lastCompactionEntryCount: number | undefined;
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
			compactionInFlight: this.compactionInFlight,
			...(this.lastCompactionEntryCount !== undefined ? { lastCompactionEntryCount: this.lastCompactionEntryCount } : {}),
			shapePending: this.shapePending,
			fullPromptInjected: this.fullPromptInjected,
			advisoryContextStatus: this.advisoryContextStatus,
			...(this.advisorySummary ? { advisorySummary: this.advisorySummary } : {}),
		};
	}

	restore(snapshot: LegacyContextShapingSnapshot | undefined): void {
		if (!snapshot) return;
		this.compactionInFlight = snapshot.compactionInFlight ?? false;
		this.lastCompactionEntryCount = snapshot.lastCompactionEntryCount;
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

	buildCurrentWorkFocus(input: {
		currentPlanPath?: string | undefined;
		touchedPlanPaths: readonly string[];
		lastPlanningRequest?: string | undefined;
		todos: readonly TodoItem[];
	}): PlanCompactionFocus {
		const completed = input.todos.filter((item) => item.completed).length;
		const activePlanPaths = [
			...(input.currentPlanPath ? [input.currentPlanPath] : []),
			...input.touchedPlanPaths.filter(isActivePlanPath),
		];
		const focus: PlanCompactionFocus = {
			activePlanPaths,
			touchedMemoryPaths: [...input.touchedPlanPaths],
			constraints: [
				"Use pnpm for workspace commands",
				"Plan Mode blocks source/config mutation until execution mode",
				`Keep ${ARCHIVE_DIRECTORY}/README.md included as the archive map`,
				`Exclude ${ARCHIVE_DIRECTORY}/** bodies by default unless targeted`,
			],
		};
		if (input.lastPlanningRequest) focus.task = input.lastPlanningRequest;
		if (input.todos.length > 0)
			focus.todoSummary = `${completed}/${input.todos.length} completed`;
		return focus;
	}
}
