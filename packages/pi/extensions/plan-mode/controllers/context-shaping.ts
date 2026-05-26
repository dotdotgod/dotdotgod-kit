import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getMessageText } from "../runtime/messages.ts";
import type { PlanCompactionFocus } from "../prompts.ts";
import type { TodoItem } from "../todos.ts";

export type PlanCliContextStatus = "not_loaded" | "loaded" | "unavailable";

export interface ContextShapingSnapshot {
	compactionInFlight: boolean;
	lastCompactionEntryCount?: number;
	loadInFlight: boolean;
	lastLoadEntryCount?: number;
	pendingLoadAfterCompaction: boolean;
	pendingLoadPrompt?: string;
	pendingLoadReason?: string;
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
	loadInFlight = false;
	lastLoadEntryCount: number | undefined;
	pendingLoadAfterCompaction = false;
	pendingLoadPrompt: string | undefined;
	pendingLoadReason: string | undefined;
	pendingResumePrompt: string | undefined;
	pendingResumeReason: string | undefined;
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
		this.pendingLoadAfterCompaction = false;
		this.pendingLoadPrompt = undefined;
		this.pendingLoadReason = undefined;
		this.pendingResumePrompt = undefined;
		this.pendingResumeReason = undefined;
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
			loadInFlight: this.loadInFlight,
			...(this.lastLoadEntryCount !== undefined ? { lastLoadEntryCount: this.lastLoadEntryCount } : {}),
			pendingLoadAfterCompaction: this.pendingLoadAfterCompaction,
			...(this.pendingLoadPrompt ? { pendingLoadPrompt: this.pendingLoadPrompt } : {}),
			...(this.pendingLoadReason ? { pendingLoadReason: this.pendingLoadReason } : {}),
			...(this.pendingResumePrompt ? { pendingResumePrompt: this.pendingResumePrompt } : {}),
			...(this.pendingResumeReason ? { pendingResumeReason: this.pendingResumeReason } : {}),
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
		this.loadInFlight = snapshot.loadInFlight;
		this.lastLoadEntryCount = snapshot.lastLoadEntryCount;
		this.pendingLoadAfterCompaction = snapshot.pendingLoadAfterCompaction;
		this.pendingLoadPrompt = snapshot.pendingLoadPrompt;
		this.pendingLoadReason = snapshot.pendingLoadReason;
		this.pendingResumePrompt = snapshot.pendingResumePrompt;
		this.pendingResumeReason = snapshot.pendingResumeReason;
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
			pendingLoadAfterCompaction:
				this.pendingLoadAfterCompaction || Boolean(this.pendingLoadPrompt),
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

	hasRecentProjectMemoryLoad(ctx: ExtensionContext, currentEntryCount: number): boolean {
		const entries = ctx.sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i -= 1) {
			const entry = entries[i] as {
				type?: string;
				customType?: string;
				data?: { entryCount?: number };
			};
			if (
				entry.type === "custom" &&
				entry.customType === "project-memory-load"
			) {
				const loadEntryCount = entry.data?.entryCount ?? i;
				return currentEntryCount - loadEntryCount < 25;
			}
		}
		return false;
	}

	getProjectMemoryContextText(ctx: ExtensionContext): string {
		return ctx.sessionManager
			.getEntries()
			.slice(-60)
			.map((entry) => {
				const candidate = entry as {
					type?: string;
					customType?: string;
					message?: AgentMessage;
					data?: unknown;
				};
				if (candidate.type === "message" && candidate.message)
					return getMessageText(candidate.message);
				if (candidate.type === "custom")
					return `${candidate.customType ?? "custom"}\n${JSON.stringify(candidate.data ?? {})}`;
				return "";
			})
			.filter(Boolean)
			.join("\n")
			.slice(-20_000);
	}
}
