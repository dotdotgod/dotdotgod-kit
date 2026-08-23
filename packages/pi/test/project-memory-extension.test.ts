import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	buildPendingProjectMemoryLoadPrompt,
	collectProjectMemoryContextCoverage,
	formatProjectMemoryToolOutput,
	getProjectMemoryContextText,
	hasReachableProjectMemoryInstruction,
	hasRecentProjectMemoryLoad,
	isExplicitProjectMemoryLoadInput,
	shouldLoadProjectMemory,
	stripExplicitProjectMemoryLoadMarker,
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
		assert.match(globalSource, /pi\.on\("input"/);
		assert.match(globalSource, /action: "transform"/);
		assert.doesNotMatch(globalSource, /buildProjectMemorySyntheticUserPrompt|PROJECT_MEMORY_AUTO_LOAD/);
		assert.match(globalSource, /customType: PROJECT_MEMORY_CONTEXT_TYPE/);
		assert.match(globalSource, /display: false/);
		assert.match(globalSource, /pi\.on\("tool_call"/);
		assert.match(globalSource, /event\.toolName !== PROJECT_MEMORY_LOAD_TOOL\) return/);
		assert.doesNotMatch(globalSource, /pi\.on\("turn_end"|pi\.on\("agent_end"|sendUserMessage/);
		assert.match(globalSource, /pi\.on\("session_tree"/);
		assert.match(globalSource, /mode: "compact"/);
		assert.match(globalSource, /promptSnippet:/);
		assert.match(globalSource, /promptGuidelines:/);
		assert.match(globalSource, /renderResult\(result, \{ expanded, isPartial \}, theme\)/);
		assert.match(globalSource, /keyHint\("app\.tools\.expand"/);
		assert.match(loadCommandSource, /registerCommand\("load"/);
		assert.match(loadCommandSource, /registerCommand\("dd:load"/);
		assert.doesNotMatch(loadCommandSource, /dd:load:compact/);
	});

	it("restores only the latest state reachable from the active branch", () => {
		const abandonedSibling = { type: "custom", customType: "project-memory-auto-state", data: { assessed: true, pending: false } };
		const activeBranch = [
			{ type: "custom", customType: "project-memory-auto-state", data: { assessed: true, pending: true } },
		] as FakeEntry[];
		assert.deepEqual(findLatestProjectMemoryAutoState(activeBranch), {
			assessed: true,
			pending: true,
			promptDelivered: false,
		});
		assert.deepEqual(findLatestProjectMemoryAutoState([...activeBranch, abandonedSibling]), {
			assessed: true,
			pending: false,
			promptDelivered: false,
		});

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
		lifecycle.restore(
			[
				{
					type: "custom",
					customType: "project-memory-auto-state",
					data: {
						assessed: true,
						pending: true,
						promptDelivered: true,
					},
				},
			],
			true,
		);
		const pendingTools = composeActiveTools(
			["read", "third_party"],
			["dotdotgod_project_load"],
			lifecycle.state.pending && lifecycle.state.promptDelivered
				? ["dotdotgod_project_load"]
				: [],
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
		lifecycle.confirmPromptDelivered();
		lifecycle.beginLoad();
		lifecycle.completeLoad();
		lifecycle.finishLoad();
		assert.deepEqual(lifecycle.state, {
			assessed: true,
			pending: false,
			inFlight: false,
			promptDelivered: false,
		});
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
		assert.throws(() => lifecycle.beginLoad(), /No automatic project-memory load is pending/);
		lifecycle.confirmPromptDelivered();
		lifecycle.beginLoad();
		assert.throws(() => lifecycle.beginLoad(), /No automatic project-memory load is pending/);
		lifecycle.finishLoad();
		assert.equal(lifecycle.state.pending, true);
		lifecycle.beginLoad();
	});

	it("renders three collapsed lines and expands to the complete Load output", () => {
		const output = ["one", "two", "three", "four", "five"].join("\n");
		assert.equal(
			formatProjectMemoryToolOutput(output, false, "Ctrl+O to expand"),
			["one", "two", "... (3 more lines, Ctrl+O to expand)"].join("\n"),
		);
		assert.equal(formatProjectMemoryToolOutput(output, true, "Ctrl+O to collapse"), output);
		assert.equal(formatProjectMemoryToolOutput("one\ntwo\nthree", false, "Ctrl+O to expand"), "one\ntwo\nthree");
	});

	it("allows the pending tool immediately after scheduling the hidden instruction", () => {
		const lifecycle = new ProjectMemoryLifecycle();
		lifecycle.assess(true);

		const instruction = buildPendingProjectMemoryLoadPrompt(lifecycle.state.pending);
		assert.match(instruction ?? "", /call dotdotgod_project_load exactly once/);
		lifecycle.confirmPromptDelivered();

		assert.doesNotThrow(() => lifecycle.beginLoad());
		assert.equal(lifecycle.state.inFlight, true);
		assert.match(
			globalSource,
			/const content = buildPendingProjectMemoryLoadPrompt[\s\S]*lifecycle\.confirmPromptDelivered\(\);[\s\S]*customType: PROJECT_MEMORY_CONTEXT_TYPE/,
		);
	});

	it("confirms hidden instruction delivery only when its message is reachable", () => {
		const stateEntry = {
			type: "custom",
			customType: "project-memory-auto-state",
			data: {
				assessed: true,
				pending: true,
				promptDelivered: false,
			},
		};
		const missing = new ProjectMemoryLifecycle();
		missing.restore([stateEntry], false);
		assert.equal(missing.state.promptDelivered, false);

		const hiddenInstruction = {
			type: "message",
			message: {
				role: "custom",
				customType: "project-memory-context",
				content: "hidden automatic-load guidance",
				display: false,
			},
		};
		assert.equal(
			hasReachableProjectMemoryInstruction([stateEntry, hiddenInstruction] as any),
			true,
		);
		const delivered = new ProjectMemoryLifecycle();
		delivered.restore([stateEntry, hiddenInstruction], true);
		assert.equal(delivered.state.promptDelivered, true);

		const confirmedState = {
			...stateEntry,
			data: { ...stateEntry.data, promptDelivered: true },
		};
		assert.equal(
			hasReachableProjectMemoryInstruction(
				[hiddenInstruction, confirmedState] as any,
			),
			false,
		);
		const restoredAfterConfirmation = new ProjectMemoryLifecycle();
		restoredAfterConfirmation.restore([hiddenInstruction, confirmedState], false);
		assert.equal(restoredAfterConfirmation.state.promptDelivered, true);
	});

	it("builds hidden automatic-load guidance without synthetic user content", () => {
		assert.equal(buildPendingProjectMemoryLoadPrompt(false), undefined);
		const delivered = buildPendingProjectMemoryLoadPrompt(true) ?? "";
		assert.match(delivered, /call dotdotgod_project_load exactly once/);
		assert.match(delivered, /Continue the original request/);
		assert.doesNotMatch(delivered, /PROJECT MEMORY AUTO LOAD/);
		assert.doesNotMatch(globalSource, /originalRequest|buildProjectMemorySyntheticUserPrompt/);
	});

	it("strips the structural explicit-load marker and cancels pending automatic state", () => {
		const lifecycle = new ProjectMemoryLifecycle();
		lifecycle.assess(true);
		lifecycle.confirmPromptDelivered();
		lifecycle.assess(false);
		assert.deepEqual(lifecycle.state, {
			assessed: true,
			pending: false,
			inFlight: false,
			promptDelivered: false,
		});

		const explicit = "[PROJECT MEMORY EXPLICIT LOAD]\nLoad the dotdotgod project memory in full mode.";
		assert.equal(isExplicitProjectMemoryLoadInput(explicit), true);
		assert.equal(
			stripExplicitProjectMemoryLoadMarker(explicit),
			"Load the dotdotgod project memory in full mode.",
		);
		assert.match(loadCommandSource, /PROJECT_MEMORY_EXPLICIT_LOAD_MARKER/);
	});

	it("keeps automatic-load decision coverage in the global extension", () => {
		const coverage = collectProjectMemoryContextCoverage(baselineTranscript);
		assert.equal(coverage.markers.includes("AGENTS.md"), true);
		assert.equal(shouldLoadProjectMemory({ contextText: "docs/spec/PLAN_MODE.md" }).reason, "missing-baseline");
		assert.deepEqual(
			shouldLoadProjectMemory({ latestRequest: "/no-load", contextText: "" }),
			{ loadNeeded: false, reason: "user-opt-out" },
		);
	});

	it("skips automatic loading for recent loads, sufficient transcript coverage, and opt-out", () => {
		assert.equal(shouldLoadProjectMemory({ hasRecentProjectMemoryLoad: true }).loadNeeded, false);
		assert.equal(shouldLoadProjectMemory({ latestRequest: "/dd:no-load" }).loadNeeded, false);
		assert.equal(shouldLoadProjectMemory({ contextText: baselineTranscript }).loadNeeded, false);
	});
});

describe("alternate-root transcript coverage", () => {
	it("recognizes baseline and area coverage outside docs", () => {
		const text = "AGENTS.md README.md project-memory/README.md project-memory/spec/README.md project-memory/arch/README.md project-memory/test/README.md project-memory/plan/README.md project-memory/spec/FEATURE.md project-memory/arch/DESIGN.md project-memory/test/VERIFY.md";
		const coverage = collectProjectMemoryContextCoverage(text);
		assert.equal(coverage.markers.length, 7);
		assert.deepEqual(coverage.areas.sort(), ["arch", "spec", "test"]);
	});
});
