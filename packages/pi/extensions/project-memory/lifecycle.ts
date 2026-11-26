export const PROJECT_MEMORY_STATE_ENTRY = "project-memory-auto-state";

interface ProjectMemoryState {
	version: 3;
	assessed: boolean;
	loaded: boolean;
	notified: boolean;
	skipCount: number;
	lastPromptHash: string | null;
	pending: boolean;
}

interface BranchEntry {
	type: string;
	customType?: string;
	data?: unknown;
}

const INITIAL_STATE: ProjectMemoryState = {
	version: 3, assessed: false, loaded: false, notified: false, skipCount: 0, lastPromptHash: null, pending: false,
};
const MAX_SKIPS = 5;

export class ProjectMemoryLifecycle {
	private state = { ...INITIAL_STATE };
	private assessment: symbol | undefined;
	private inFlight = false;

	private readonly persist: (state: ProjectMemoryState) => void;

	constructor(persist: (state: ProjectMemoryState) => void) {
		this.persist = persist;
	}

	restore(branch: readonly BranchEntry[]): void {
		// The full branch includes ancestors omitted from the model context by compaction.
		const data = branch.filter(entry => entry.type === "custom" && entry.customType === PROJECT_MEMORY_STATE_ENTRY).at(-1)?.data as
			(Partial<Omit<ProjectMemoryState, "version">> & { version?: number }) | undefined;
		const assessed = data?.assessed === true;
		const pending = data?.pending === true;
		const loaded = data?.version === 3 ? data.loaded === true
			: (assessed && !pending) || branch.some(entry => entry.type === "custom" && entry.customType === "project-memory-load");
		this.state = {
			version: 3,
			assessed: assessed || loaded,
			loaded,
			notified: loaded || (data?.version === 3 && data.notified === true),
			skipCount: data?.version === 3 ? data.skipCount ?? 0 : 0,
			lastPromptHash: data?.version === 3 ? data.lastPromptHash ?? null : null,
			pending: pending && !loaded,
		};
		this.assessment = undefined;
	}

	getLoadState(): Readonly<ProjectMemoryState> {
		return this.state;
	}

	beginLoadAssessment(promptHash: string) {
		const { loaded, notified, skipCount, lastPromptHash } = this.state;
		if (loaded || notified || this.assessment || this.inFlight || skipCount >= MAX_SKIPS || lastPromptHash === promptHash) return;
		this.assessment = Symbol();
		return { token: this.assessment, skipCount };
	}

	recordLoadSkip(token: symbol, promptHash: string) {
		const skipCount = this.state.skipCount + 1;
		const terminal = skipCount >= MAX_SKIPS;
		const recorded = this.completeAssessment(token, promptHash, { skipCount, ...(terminal ? { assessed: true, notified: true } : {}) });
		return { recorded, terminal: recorded && terminal };
	}

	completeLoadNotified(token: symbol, promptHash: string): boolean {
		return this.completeAssessment(token, promptHash, { assessed: true, notified: true, pending: false });
	}

	completeLoadPrefetch(token: symbol, promptHash: string): boolean {
		return this.completeAssessment(token, promptHash, { assessed: true, loaded: true, notified: true, pending: false });
	}

	claimAdvisedOnce(): boolean {
		if (this.state.loaded || this.state.notified) return false;
		this.assessment = undefined;
		this.update({ assessed: true, notified: true, pending: true });
		return true;
	}

	markLoaded(): void {
		this.assessment = undefined;
		if (!this.state.loaded) this.update({ assessed: true, loaded: true, notified: true, pending: false });
	}

	beginLoad(): boolean {
		if (this.state.loaded || this.inFlight) return false;
		this.inFlight = true;
		return true;
	}

	finishLoad(): void {
		this.inFlight = false;
	}

	private completeAssessment(token: symbol, promptHash: string, changes: Partial<ProjectMemoryState>): boolean {
		if (this.assessment !== token) return false;
		this.assessment = undefined;
		this.update({ ...changes, lastPromptHash: promptHash });
		return true;
	}

	private update(changes: Partial<ProjectMemoryState>): void {
		this.state = { ...this.state, ...changes };
		this.persist(this.state);
	}
}
