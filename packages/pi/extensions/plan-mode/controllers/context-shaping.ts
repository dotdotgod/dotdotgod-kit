import type { PlanCompactionFocus } from "../prompts.ts";
import type { TodoItem } from "../todos.ts";

export type PlanCliContextStatus = "not_loaded" | "loaded" | "unavailable";

export interface ContextShapingSnapshot {
	compactionInFlight: boolean;
	lastCompactionEntryCount?: number;
	pendingResumePrompt?: string;
	pendingResumeReason?: string;
	shapePending: boolean;
	fullPromptInjected: boolean;
	cliContextStatus: PlanCliContextStatus;
	cliSummary?: string;
}

export class ContextShapingController {
	compactionInFlight = false;
	lastCompactionEntryCount: number | undefined;
	shapePending = false;
	fullPromptInjected = false;
	cliContextStatus: PlanCliContextStatus = "not_loaded";
	cliSummary: string | undefined;

	resetForPlanning(): void {
		this.fullPromptInjected = false;
		this.shapePending = true;
		this.cliContextStatus = "not_loaded";
		this.cliSummary = undefined;
	}

	clearQueuedWork(): void {
		this.shapePending = false;
	}

	markCliUnavailable(): void {
		this.cliContextStatus = "unavailable";
		this.cliSummary = undefined;
	}

	setCliSummary(summary: string): void {
		this.cliContextStatus = "loaded";
		this.cliSummary = summary;
	}

	snapshot(): ContextShapingSnapshot {
		return {
			compactionInFlight: this.compactionInFlight,
			...(this.lastCompactionEntryCount !== undefined ? { lastCompactionEntryCount: this.lastCompactionEntryCount } : {}),
			shapePending: this.shapePending,
			fullPromptInjected: this.fullPromptInjected,
			cliContextStatus: this.cliContextStatus,
			...(this.cliSummary ? { cliSummary: this.cliSummary } : {}),
		};
	}

	restore(snapshot: ContextShapingSnapshot | undefined): void {
		if (!snapshot) return;
		this.compactionInFlight = snapshot.compactionInFlight;
		this.lastCompactionEntryCount = snapshot.lastCompactionEntryCount;
		this.shapePending = snapshot.shapePending;
		this.fullPromptInjected = snapshot.fullPromptInjected;
		this.cliContextStatus = snapshot.cliContextStatus;
		this.cliSummary = snapshot.cliSummary;
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
			...input.touchedPlanPaths.filter((path) => path.startsWith("docs/plan/")),
		];
		const focus: PlanCompactionFocus = {
			activePlanPaths,
			touchedMemoryPaths: [...input.touchedPlanPaths],
			constraints: [
				"Use pnpm for workspace commands",
				"Plan Mode blocks source/config mutation until execution mode",
				"Keep docs/archive/README.md included as the archive map",
				"Exclude docs/archive/** bodies by default unless targeted",
			],
		};
		if (input.lastPlanningRequest) focus.task = input.lastPlanningRequest;
		if (input.todos.length > 0)
			focus.todoSummary = `${completed}/${input.todos.length} completed`;
		return focus;
	}
}
