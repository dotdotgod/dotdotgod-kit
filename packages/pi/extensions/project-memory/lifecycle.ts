export interface ProjectMemoryState {
	assessed: boolean;
	pending: boolean;
	inFlight: boolean;
	promptDelivered: boolean;
	originalRequest: string | undefined;
}

interface ProjectMemoryStateEntry {
	type?: string;
	customType?: string;
	data?: unknown;
}

export function findLatestProjectMemoryAutoState(
	entries: readonly unknown[],
): Pick<ProjectMemoryState, "assessed" | "pending" | "promptDelivered" | "originalRequest"> | undefined {
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		const entry = entries[i] as ProjectMemoryStateEntry | undefined;
		if (entry?.type !== "custom" || entry.customType !== "project-memory-auto-state") continue;
		const data = entry.data as {
			assessed?: boolean;
			pending?: boolean;
			promptDelivered?: boolean;
			originalRequest?: string;
		} | undefined;
		return {
			assessed: data?.assessed === true,
			pending: data?.pending === true,
			promptDelivered: data?.promptDelivered === true,
			originalRequest:
				typeof data?.originalRequest === "string"
					? data.originalRequest
					: undefined,
		};
	}
	return undefined;
}

export class ProjectMemoryLifecycle {
	readonly state: ProjectMemoryState = {
		assessed: false,
		pending: false,
		inFlight: false,
		promptDelivered: false,
		originalRequest: undefined,
	};

	restore(entries: readonly unknown[], deliveredPromptReachable = false): void {
		const restored = findLatestProjectMemoryAutoState(entries);
		this.state.assessed = restored?.assessed ?? false;
		this.state.pending = restored?.pending ?? false;
		this.state.inFlight = false;
		this.state.promptDelivered =
			this.state.pending &&
			((restored?.promptDelivered ?? false) || deliveredPromptReachable);
		this.state.originalRequest = restored?.originalRequest;
	}

	get needsAssessment(): boolean {
		return !this.state.assessed && !this.state.inFlight;
	}

	assess(pending: boolean, originalRequest?: string): void {
		this.state.assessed = true;
		this.state.pending = pending;
		this.state.promptDelivered = false;
		this.state.originalRequest = pending ? originalRequest : undefined;
	}

	confirmPromptDelivered(): void {
		if (!this.state.pending) {
			throw new Error("No automatic project-memory prompt can be confirmed.");
		}
		this.state.promptDelivered = true;
	}

	beginLoad(): void {
		if (
			!this.state.pending ||
			!this.state.promptDelivered ||
			this.state.inFlight
		) {
			throw new Error("No automatic project-memory load is pending.");
		}
		this.state.inFlight = true;
	}

	completeLoad(): void {
		this.state.pending = false;
		this.state.promptDelivered = false;
		this.state.originalRequest = undefined;
	}

	finishLoad(): void {
		this.state.inFlight = false;
	}
}
