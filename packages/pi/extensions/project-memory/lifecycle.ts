export interface ProjectMemoryState {
	assessed: boolean;
	pending: boolean;
	inFlight: boolean;
}

interface ProjectMemoryStateEntry {
	type?: string;
	customType?: string;
	data?: unknown;
}

export function findLatestProjectMemoryAutoState(
	entries: readonly unknown[],
): Pick<ProjectMemoryState, "assessed" | "pending"> | undefined {
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		const entry = entries[i] as ProjectMemoryStateEntry | undefined;
		if (entry?.type !== "custom" || entry.customType !== "project-memory-auto-state") continue;
		const data = entry.data as { assessed?: boolean; pending?: boolean } | undefined;
		return { assessed: data?.assessed === true, pending: data?.pending === true };
	}
	return undefined;
}

export class ProjectMemoryLifecycle {
	readonly state: ProjectMemoryState = { assessed: false, pending: false, inFlight: false };

	restore(entries: readonly unknown[]): void {
		const restored = findLatestProjectMemoryAutoState(entries);
		this.state.assessed = restored?.assessed ?? false;
		this.state.pending = restored?.pending ?? false;
		this.state.inFlight = false;
	}

	get needsAssessment(): boolean {
		return !this.state.assessed && !this.state.inFlight;
	}

	assess(pending: boolean): void {
		this.state.assessed = true;
		this.state.pending = pending;
	}

	beginLoad(): void {
		if (!this.state.pending || this.state.inFlight) {
			throw new Error("No automatic project-memory load is pending.");
		}
		this.state.inFlight = true;
	}

	completeLoad(): void {
		this.state.pending = false;
	}

	finishLoad(): void {
		this.state.inFlight = false;
	}
}
