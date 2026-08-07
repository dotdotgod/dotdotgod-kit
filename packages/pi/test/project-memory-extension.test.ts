import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	buildPendingProjectMemoryLoadPrompt,
	getProjectMemoryContextText,
	hasRecentProjectMemoryLoad,
	shouldLoadProjectMemory,
} from "../extensions/project-memory/context.ts";
import {
	findLatestProjectMemoryAutoState,
	ProjectMemoryLifecycle,
} from "../extensions/project-memory/lifecycle.ts";
import { composeActiveTools } from "../extensions/shared/active-tools.ts";

const globalSource = readFileSync(
	new URL("../extensions/project-memory/index.ts", import.meta.url),
	"utf8",
);
const loadCommandSource = readFileSync(
	new URL("../extensions/load-project/index.ts", import.meta.url),
	"utf8",
);

interface FakeEntry {
	type: string;
	customType?: string;
	data?: unknown;
	message?: unknown;
}

function createContext(branch: FakeEntry[]): any {
	return {
		sessionManager: {
			getBranch: () => branch,
			getEntries: () => branch,
		},
	};
}

const baselineTranscript = [
	"AGENTS.md",
	"README.md",
	"docs/README.md",
	"docs/spec/README.md",
	"docs/arch/README.md",
	"docs/test/README.md",
	"docs/plan/README.md",
].join("\n");

describe("global project-memory orchestration", () => {
	it("registers one pending-only focused load tool and keeps explicit full-load commands", () => {
		assert.match(globalSource, /name: PROJECT_MEMORY_LOAD_TOOL/);
		assert.match(globalSource, /pi\.on\("before_agent_start"/);
		assert.match(globalSource, /pi\.on\("session_tree"/);
		assert.match(globalSource, /mode: "compact"/);
		assert.match(globalSource, /promptSnippet:/);
		assert.match(globalSource, /promptGuidelines:/);
		assert.match(loadCommandSource, /registerCommand\("load"/);
		assert.match(loadCommandSource, /registerCommand\("dd:load"/);
		assert.doesNotMatch(loadCommandSource, /dd:load:compact/);
	});

	it("restores only the latest state reachable from the active branch", () => {
		const abandonedSibling = { type: "custom", customType: "project-memory-auto-state", data: { assessed: true, pending: false } };
		const activeBranch = [
			{ type: "custom", customType: "project-memory-auto-state", data: { assessed: true, pending: true } },
		] as FakeEntry[];
		assert.deepEqual(findLatestProjectMemoryAutoState(activeBranch), { assessed: true, pending: true });
		assert.deepEqual(findLatestProjectMemoryAutoState([...activeBranch, abandonedSibling]), { assessed: true, pending: false });

		const beforeAssessmentFork = new ProjectMemoryLifecycle();
		beforeAssessmentFork.restore([]);
		assert.equal(beforeAssessmentFork.needsAssessment, true);
		const afterCompletionFork = new ProjectMemoryLifecycle();
		afterCompletionFork.restore([
			{ type: "custom", customType: "project-memory-auto-state", data: { assessed: true, pending: false } },
		]);
		assert.equal(afterCompletionFork.needsAssessment, false);
	});

	it("keeps pending and third-party tools across either composition order", async () => {
		const lifecycle = new ProjectMemoryLifecycle();
		lifecycle.restore([
			{ type: "custom", customType: "project-memory-auto-state", data: { assessed: true, pending: true } },
		]);
		const pendingTools = composeActiveTools(
			["read", "third_party"],
			["dotdotgod_project_load"],
			lifecycle.state.pending ? ["dotdotgod_project_load"] : [],
		);
		assert.deepEqual(pendingTools, ["read", "third_party", "dotdotgod_project_load"]);

		const planningTools = composeActiveTools(
			pendingTools,
			["read", "bash", "edit"],
			["read"],
		);
		assert.deepEqual(planningTools, ["third_party", "dotdotgod_project_load", "read"]);
		assert.deepEqual(
			composeActiveTools(
				planningTools,
				["dotdotgod_project_load"],
				["dotdotgod_project_load"],
			).sort(),
			[...planningTools].sort(),
		);
	});

	it("uses active-branch transcript coverage instead of startup context files", () => {
		const decision = shouldLoadProjectMemory({ contextText: "x".repeat(40_000) });
		assert.equal(decision.loadNeeded, true);
		assert.equal(decision.reason, "missing-baseline");
	});

	it("uses the active branch for transcript and recent-completion decisions", () => {
		const branch = [
			{ type: "message", message: { content: [{ type: "text", text: "active branch text" }] } },
			{ type: "custom", customType: "project-memory-load", data: { entryCount: 1 } },
		] as FakeEntry[];
		const ctx = createContext(branch);
		assert.match(getProjectMemoryContextText(ctx), /active branch text/);
		assert.equal(hasRecentProjectMemoryLoad(ctx, branch.length), true);
	});

	it("completes a pending load exactly once and removes only its owned tool", async () => {
		const lifecycle = new ProjectMemoryLifecycle();
		lifecycle.restore([
			{ type: "custom", customType: "project-memory-auto-state", data: { assessed: true, pending: true } },
		]);
		lifecycle.beginLoad();
		lifecycle.completeLoad();
		lifecycle.finishLoad();
		assert.deepEqual(lifecycle.state, { assessed: true, pending: false, inFlight: false });
		assert.throws(() => lifecycle.beginLoad(), /No automatic project-memory load is pending/);
		assert.deepEqual(
			composeActiveTools(
				["read", "third_party", "dotdotgod_project_load"],
				["dotdotgod_project_load"],
				[],
			),
			["read", "third_party"],
		);
	});

	it("blocks duplicate in-flight scheduling and leaves an interrupted load retryable", () => {
		const lifecycle = new ProjectMemoryLifecycle();
		lifecycle.assess(true);
		lifecycle.beginLoad();
		assert.throws(() => lifecycle.beginLoad(), /No automatic project-memory load is pending/);
		lifecycle.finishLoad();
		assert.equal(lifecycle.state.pending, true);
		lifecycle.beginLoad();
	});

	it("requires exactly one agent-selected load only while pending", () => {
		assert.equal(buildPendingProjectMemoryLoadPrompt(false), undefined);
		const prompt = buildPendingProjectMemoryLoadPrompt(true) ?? "";
		assert.match(prompt, /call dotdotgod_project_load exactly once/);
		assert.match(prompt, /Continue the original request/);
	});

	it("skips automatic loading for recent loads, sufficient transcript coverage, and opt-out", () => {
		assert.equal(shouldLoadProjectMemory({ hasRecentProjectMemoryLoad: true }).loadNeeded, false);
		assert.equal(shouldLoadProjectMemory({ latestRequest: "/dd:no-load" }).loadNeeded, false);
		assert.equal(shouldLoadProjectMemory({ contextText: baselineTranscript }).loadNeeded, false);
	});
});
