import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ContextShapingController } from "../extensions/plan-mode/controllers/context-shaping.ts";
import { ExecutionProgressController } from "../extensions/plan-mode/controllers/execution-progress.ts";
import { GateController } from "../extensions/plan-mode/controllers/gates.ts";
import { ModeLifecycleController } from "../extensions/plan-mode/controllers/mode-lifecycle.ts";
import { PlanArtifactController } from "../extensions/plan-mode/controllers/plan-artifact.ts";
import { isActivePlanMarkdownPath, isManagedPlanMarkdownPath } from "../extensions/plan-mode/runtime/paths.ts";
import {
	PLAN_COMPACTION_PERCENT_THRESHOLD,
	PLAN_MODE_COMPACTION_INSTRUCTIONS,
	buildPlanCompactionInstructions,
	buildPlanCompactionResumePrompt,
	buildDiscussionQueueFollowUp,
	buildPlanExecutionDecision,
	buildPlanExecutionHandoff,
	buildPlanReviewDisplayMarkdown,
	buildPlanReviewMarkdown,
	buildPlanReviewRefinePrompt,
	buildPlanReviewTitle,
	buildPlanModeRequestFraming,
	classifyPlanModeRequest,
	collectProjectMemoryContextCoverage,
	detectPlanExecutionIntent,
	buildPlanModeContextPrompt,
	extractTodoItems,
	extractDiscussionQueueItems,
	formatCompactImpactSummary,
	formatExpandableToolOutput,
	formatMultiImpactSummary,
	formatPlanCompactionFocus,
	formatReferenceExpansionSummary,
	extractPathMentions,
	extractPlanSlugMentions,
	getCurrentPlanReadmePath,
	getChangedPathFromDotdotgodImpactCommand,
	getChangedPathsFromDotdotgodImpactCommand,
	getNextPlanReviewActionIndex,
	getPlanCompactionReason,
	getPlanReviewActionChoice,
	getPlanReviewScrollState,
	hasExplicitBracketReferences,
	hasLikelyFuzzyReferences,
	isBroadVerificationCommand,
	isCommitLikeCommand,
	normalizeImpactPath,
	normalizePlanCommandRequest,
	mapPlanReviewFallbackChoice,
	mergeImpactCheckPaths,
	parsePlanModeExtraTools,
	planModeFollowUpDeliveryOptions,
	pendingImpactSummary,
	resolveMentionedPlanPath,
	resolvePlanExecutionTarget,
	isAutoAllowedDotdotgodPlanModeCommand,
	isDotdotgodCliCommand,
	isSafeCommand,
	isSafePlanArchiveCommand,
	markCompletedSteps,
	resolvePlanModeTools,
	selectPlanImpactPaths,
	shouldAllowPlanModeBashCommand,
	shouldLoadProjectMemoryForPlanning,
	shouldPromptForPlanChoice,
	summarizeDiscussionQueue,
	shouldTrackImpactPath,
	shouldShapePlanningContextOnAgentStart,
	isPlanModeRuntimeRequest,
	isSyntheticProjectMemoryLoadPrompt,
	selectLatestPlanningRequest,
	upsertPendingImpact,
	clearPendingImpactForPath,
	type PendingImpactItem,
	type TodoItem,
} from "../extensions/plan-mode/utils.ts";
import { buildLoadPrompt } from "../extensions/load-project/utils.ts";

describe("plan-mode user-message delivery", () => {
	it("uses explicit follow-up delivery for synthetic user messages", () => {
		assert.deepEqual(planModeFollowUpDeliveryOptions(), { deliverAs: "followUp" });
	});
});

describe("plan-mode domain controllers", () => {
	it("stores lifecycle, context, gates, and execution progress as snapshots", () => {
		const lifecycle = new ModeLifecycleController();
		lifecycle.enablePlanning(["read", "grep"]);

		const context = new ContextShapingController();
		context.resetForPlanning();
		context.setCliSummary("summary");

		const gates = new GateController();
		gates.pendingImpactItems = [{ path: "packages/pi/index.ts", reason: "edit", touchedAt: "2026-05-25T00:00:00.000Z" }];

		const execution = new ExecutionProgressController();
		execution.setTodos([{ step: 1, text: "Verify plan", completed: false }]);

		const restoredLifecycle = new ModeLifecycleController();
		restoredLifecycle.restore(lifecycle.snapshot());
		const restoredContext = new ContextShapingController();
		restoredContext.restore(context.snapshot());
		const restoredGates = new GateController();
		restoredGates.restore(gates.snapshot());
		const restoredExecution = new ExecutionProgressController();
		restoredExecution.restore(execution.snapshot());

		assert.equal(restoredLifecycle.planningEnabled, true);
		assert.deepEqual(restoredLifecycle.snapshot(), { mode: "planning", activeTools: ["read", "grep"] });
		assert.equal(restoredContext.cliContextStatus, "loaded");
		assert.equal(restoredContext.cliSummary, "summary");
		assert.equal(restoredGates.pendingImpactItems.length, 1);
		assert.equal(restoredExecution.todos[0]?.text, "Verify plan");
	});

	it("loads an existing plan path and populates todos from its README", () => {
		const root = mkdtempSync(join(tmpdir(), "plan-mode-controller-"));
		const planDir = join(root, "docs/plan/existing-task");
		mkdirSync(planDir, { recursive: true });
		writeFileSync(join(planDir, "README.md"), "Plan:\n1. Update docs\n2. Run tests\n");

		const artifact = new PlanArtifactController();
		const execution = new ExecutionProgressController();
		const planPath = artifact.loadExistingPlanPath(root, "docs/plan/existing-task");

		assert.equal(planPath, "docs/plan/existing-task/README.md");
		assert.equal(artifact.currentPlanPath, planPath);
		assert.equal(artifact.pendingReviewPath, planPath);
		assert.equal(execution.loadTodosFromPlan(root, planPath ?? "").length, 2);
		assert.deepEqual(
			execution.todos.map((todo) => todo.text),
			["Docs", "Tests"],
		);
	});

	it("batches impact checks, preserves order, and clears successful paths", () => {
		const root = mkdtempSync(join(tmpdir(), "plan-mode-controller-"));
		const sourcePaths = [
			"packages/pi/extensions/plan-mode/index.ts",
			"packages/pi/extensions/plan-mode/impact.ts",
		];
		mkdirSync(join(root, "packages/pi/extensions/plan-mode"), { recursive: true });
		for (const path of sourcePaths) writeFileSync(join(root, path), `export const value = "${path}";\n`);

		const gates = new GateController();
		for (const path of sourcePaths) assert.equal(gates.trackPendingImpact(root, path, "edit"), true);
		assert.match(gates.buildPendingImpactReminder() ?? "", /packages\/pi\/extensions\/plan-mode\/index\.ts/);
		assert.match(gates.buildCommitBlockReason("git commit -m test") ?? "", /impact not checked/);
		assert.match(gates.buildBroadVerificationPrompt("pnpm run verify") ?? "", /Pending dotdotgod graph impact checks/);

		const batches: string[][] = [];
		const result = gates.runImpactChecks(root, [...sourcePaths, sourcePaths[0]!], (batch) => {
			batches.push([...batch]);
			return { ok: true, stdout: `impact:\n  changed_files: [${batch.join(", ")}]` };
		});

		assert.deepEqual(batches, [sourcePaths]);
		assert.deepEqual(result.checked, sourcePaths);
		assert.deepEqual(result.failed, []);
		assert.equal(gates.pendingImpactItems.length, 0);
	});

	it("retains failed batches and files modified during successful checks", () => {
		const root = mkdtempSync(join(tmpdir(), "plan-mode-controller-"));
		const paths = ["src/one.ts", "src/two.ts", "src/three.ts"];
		mkdirSync(join(root, "src"), { recursive: true });
		for (const path of paths) {
			writeFileSync(join(root, path), "export const value = 1;\n");
		}
		const gates = new GateController();
		for (const path of paths) gates.trackPendingImpact(root, path, "edit");

		let call = 0;
		const result = gates.runImpactChecks(root, paths, (batch) => {
			call += 1;
			if (call === 1) {
				writeFileSync(join(root, batch[0] ?? ""), "export const changed = true;\n");
				return { ok: true, stdout: "impact:\n  ok: true" };
			}
			return { ok: false, error: "failed" };
		}, 2);

		assert.deepEqual(result.checked, paths.slice(0, 2));
		assert.deepEqual(result.failed, paths.slice(2));
		assert.deepEqual(gates.pendingImpactItems.map((item) => item.path), [paths[0], paths[2]]);
	});

	it("clears every pending path from a successful manual multi-seed command", () => {
		const root = mkdtempSync(join(tmpdir(), "plan-mode-controller-"));
		const paths = ["src/one.ts", "src/two.ts"];
		mkdirSync(join(root, "src"), { recursive: true });
		for (const path of paths) {
			writeFileSync(join(root, path), "export const value = 1;\n");
		}
		const gates = new GateController();
		for (const path of paths) gates.trackPendingImpact(root, path, "edit");

		assert.equal(
			gates.clearFromImpactCommandResult(
				root,
				"dotdotgod graph impact . --changed src/one.ts --changed=src/two.ts --yml",
				"impact:\n  ok: true",
			),
			true,
		);
		assert.deepEqual(gates.pendingImpactItems, []);
	});

	it("resolves execution targets from active and mentioned plans", () => {
		const root = mkdtempSync(join(tmpdir(), "plan-mode-controller-"));
		for (const slug of ["first-task", "second-task"]) {
			const planDir = join(root, `docs/plan/${slug}`);
			mkdirSync(planDir, { recursive: true });
			writeFileSync(join(planDir, "README.md"), "Plan:\n1. Verify plan\n");
		}

		const artifact = new PlanArtifactController();
		artifact.setActivePlan("docs/plan/first-task/README.md");

		assert.equal(
			artifact.resolveExecutionTarget(root, "execute second-task").planPath,
			"docs/plan/second-task/README.md",
		);
		assert.equal(
			artifact.resolveExecutionTarget(root, "execute the plan").planPath,
			"docs/plan/first-task/README.md",
		);
	});

	it("replays completed execution steps from session entries after the execution marker", () => {
		const execution = new ExecutionProgressController();
		execution.setTodos([
			{ step: 1, text: "First task", completed: false },
			{ step: 2, text: "Second task", completed: false },
		]);

		execution.replayCompletedFromSessionEntries([
			{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "[DONE:1]" }] } },
			{ type: "custom", customType: "plan-mode-execute" },
			{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "[DONE:2]" }] } },
		]);

		assert.deepEqual(
			execution.todos.map((todo) => todo.completed),
			[false, true],
		);
	});
});

describe("plan-mode command safety", () => {
	it("normalizes inline /plan request arguments", () => {
		assert.equal(normalizePlanCommandRequest("add inline request support"), "add inline request support");
		assert.equal(normalizePlanCommandRequest("  add inline request support  "), "add inline request support");
		assert.equal(normalizePlanCommandRequest("\n\t"), undefined);
	});

	it("allows read-only commands", () => {
		for (const command of ["grep foo README.md", "find docs -name README.md", "git status --short", "npm view @dotdotgod/pi version", "sed -n '1,10p' README.md"]) {
			assert.equal(isSafeCommand(command), true, command);
		}
	});

	it("blocks mutating or dangerous commands", () => {
		for (const command of ["rm -rf docs", "mv a b", "npm install", "git commit -m test", "echo hi > file", "sudo ls"]) {
			assert.equal(isSafeCommand(command), false, command);
		}
	});

	it("allows constrained plan/archive housekeeping commands", () => {
		for (const command of [
			"mkdir -p docs/archive/plan",
			"mv docs/plan/old-task docs/archive/plan/old-task",
			"rm -rf docs/plan/stale-task",
			"rm docs/archive/plan/stale-task/README.md",
		]) {
			assert.equal(isSafePlanArchiveCommand(command), true, command);
			assert.equal(isSafeCommand(command), true, command);
		}
	});

	it("uses configured writable documentation paths for safe housekeeping", () => {
		const paths = ["docs/proposals/**"];
		assert.equal(isSafePlanArchiveCommand("mkdir -p docs/proposals/new-design", paths), true);
		assert.equal(isSafePlanArchiveCommand("mkdir -p docs/plan/new-design", paths), false);
		assert.equal(isSafePlanArchiveCommand("rm -rf docs/proposals", paths), false);
	});

	it("blocks plan/archive housekeeping commands that escape local memory", () => {
		for (const command of [
			"rm -rf docs/plan",
			"rm package.json",
			"mv packages/pi docs/archive/plan/pi",
			"mv docs/plan/task packages/task",
			"rm -rf docs/plan/task && rm package.json",
			"rm -rf docs/plan/../spec",
		]) {
			assert.equal(isSafePlanArchiveCommand(command), false, command);
		}
	});

	it("detects dotdotgod CLI commands for explicit Plan Mode approval", () => {
		for (const command of [
			"dotdotgod validate .",
			"node packages/cli/bin/dotdotgod.mjs validate .",
			"node ./packages/cli/bin/dotdotgod.mjs validate .",
			"node /opt/example/dotdotgod-kit/packages/cli/bin/dotdotgod.mjs validate .",
		]) {
			assert.equal(isDotdotgodCliCommand(command), true, command);
			assert.equal(isSafeCommand(command), false, command);
		}
	});

	it("rejects non-dotdotgod or chained commands from the dotdotgod CLI permission path", () => {
		for (const command of [
			"node -e \"console.log(1)\"",
			"node scripts/other.mjs",
			"pnpm dlx dotdotgod validate .",
			"dotdotgod validate . && rm package.json",
			"dotdotgod validate . > out.txt",
		]) {
			assert.equal(isDotdotgodCliCommand(command), false, command);
		}
	});

	it("automatically allows bounded dotdotgod context and status commands in Plan Mode", async () => {
		for (const command of [
			"dotdotgod --version",
			"dotdotgod --help",
			"dotdotgod status . --json",
			"dotdotgod query . 'Plan Mode tools' --json",
			"dotdotgod resolve . PLAN_MODE --json",
			"dotdotgod expand . 'Update [[PLAN_MODE]]' --json",
			"dotdotgod graph impact . --changed packages/pi/index.ts --json",
			"dotdotgod graph impact . --changed packages/pi/index.ts --compact",
			"dotdotgod graph impact . --changed packages/pi/index.ts --yml",
			"dotdotgod graph communities . --json",
			"dotdotgod config . --json",
			"dotdotgod index .",
			"node packages/cli/bin/dotdotgod.mjs --version",
			"node packages/cli/bin/dotdotgod.mjs status . --json",
			"node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/index.ts --yaml",
			"node /opt/example/dotdotgod-kit/packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/index.ts --yml",
			"node ./packages/cli/bin/dotdotgod.mjs expand . 'Update [[PLAN_MODE]]' --json",
			"node packages/cli/bin/dotdotgod.mjs config . --json",
			"node packages/cli/bin/dotdotgod.mjs index .",
		]) {
			assert.equal(isDotdotgodCliCommand(command), true, command);
			assert.equal(isAutoAllowedDotdotgodPlanModeCommand(command), true, command);
			assert.deepEqual(await shouldAllowPlanModeBashCommand(command), { allow: true }, command);
		}

		for (const command of [
			"dotdotgod validate .",
			"dotdotgod init .",
			"dotdotgod impact . --changed packages/pi/index.ts",
			"dotdotgod graph query .",
			"dotdotgod unknown .",
			"dotdotgod config init .",
			"node packages/cli/bin/dotdotgod.mjs config init .",
		]) {
			assert.equal(isDotdotgodCliCommand(command), true, command);
			assert.equal(isAutoAllowedDotdotgodPlanModeCommand(command), false, command);
		}
	});

	it("detects impact-check commands and commit gates", () => {
		assert.deepEqual(
			getChangedPathsFromDotdotgodImpactCommand("dotdotgod graph impact . --changed packages/pi/extensions/plan-mode/index.ts --changed=packages/pi/extensions/plan-mode/utils.ts --changed packages/pi/extensions/plan-mode/index.ts --yml"),
			["packages/pi/extensions/plan-mode/index.ts", "packages/pi/extensions/plan-mode/utils.ts"],
		);
		assert.equal(getChangedPathFromDotdotgodImpactCommand("dotdotgod graph impact . --changed packages/pi/extensions/plan-mode/index.ts --yml"), "packages/pi/extensions/plan-mode/index.ts");
		assert.equal(getChangedPathFromDotdotgodImpactCommand("node /tmp/repo/packages/cli/bin/dotdotgod.mjs graph impact . --changed=packages/pi/extensions/plan-mode/utils.ts --json"), "packages/pi/extensions/plan-mode/utils.ts");
		assert.deepEqual(getChangedPathsFromDotdotgodImpactCommand("dotdotgod graph communities . --json"), []);
		assert.equal(getChangedPathFromDotdotgodImpactCommand("dotdotgod graph communities . --json"), undefined);
		assert.equal(isCommitLikeCommand("git commit -m test"), true);
		assert.equal(isCommitLikeCommand("git push"), true);
		assert.equal(isCommitLikeCommand("pnpm publish"), true);
		assert.equal(isCommitLikeCommand("git status --short"), false);
		assert.equal(isBroadVerificationCommand("pnpm run verify"), true);
		assert.equal(isBroadVerificationCommand("pytest tests"), true);
		assert.equal(isBroadVerificationCommand("node packages/cli/bin/dotdotgod.mjs validate ."), false);
	});

	it("tracks and clears pending impact paths", () => {
		assert.equal(normalizeImpactPath("/repo", "./packages/pi/index.ts"), "packages/pi/index.ts");
		assert.equal(normalizeImpactPath("/repo", "/repo/packages/pi/index.ts"), "packages/pi/index.ts");
		assert.equal(normalizeImpactPath("/repo", "../outside.ts"), undefined);
		assert.equal(shouldTrackImpactPath("packages/pi/index.ts"), true);
		assert.equal(shouldTrackImpactPath("docs/plan/task/README.md"), false);
		assert.equal(shouldTrackImpactPath(".dotdotgod/manifest.json"), false);

		const first: PendingImpactItem = { path: "packages/pi/index.ts", fingerprint: "a", reason: "edit", touchedAt: "t1" };
		const second: PendingImpactItem = { path: "packages/pi/utils.ts", fingerprint: "b", reason: "write", touchedAt: "t2" };
		let items = upsertPendingImpact([], first);
		items = upsertPendingImpact(items, second);
		items = upsertPendingImpact(items, { ...first, fingerprint: "c", touchedAt: "t3" });
		assert.deepEqual(items.map((item) => `${item.path}:${item.fingerprint}`), ["packages/pi/utils.ts:b", "packages/pi/index.ts:c"]);
		assert.equal(pendingImpactSummary(items), "- packages/pi/utils.ts\n- packages/pi/index.ts");
		assert.deepEqual(clearPendingImpactForPath(items, "packages/pi/index.ts").map((item) => item.path), ["packages/pi/utils.ts"]);
	});

	it("merges pending and git worktree impact paths", () => {
		const pending: PendingImpactItem[] = [
			{ path: "packages/pi/index.ts", fingerprint: "old", reason: "edit", touchedAt: "t1" },
			{ path: "docs/plan/task/README.md", reason: "write", touchedAt: "t2" },
		];
		assert.deepEqual(
			mergeImpactCheckPaths("/repo", pending, ["packages/pi/utils.ts", "packages/pi/index.ts", "coverage/out.json", "../outside.ts"]),
			["packages/pi/index.ts", "packages/pi/utils.ts"],
		);
	});

	it("formats expandable tool output", () => {
		const tenLines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
		assert.equal(formatExpandableToolOutput(tenLines, false, "ctrl+o to expand"), tenLines);

		const twelveLines = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n");
		assert.equal(
			formatExpandableToolOutput(twelveLines, false, "ctrl+o to expand"),
			`${Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n")}\n... (2 more lines, ctrl+o to expand)`,
		);
		assert.equal(formatExpandableToolOutput(twelveLines, true, "ctrl+o to expand"), twelveLines);
	});

	it("formats multi-file impact summaries", () => {
		const summary = formatMultiImpactSummary([{ path: "packages/pi/index.ts", error: "missing cli" }]);
		assert.match(summary, /dotdotgod graph impact summary/);
		assert.match(summary, /failed for packages\/pi\/index.ts/);
		const structured = formatMultiImpactSummary([{ path: "packages/pi/index.ts", summary: "impact:\n  output: \"yml\"" }]);
		assert.equal(structured, "impact:\n  output: \"yml\"");
		const multiStructured = formatMultiImpactSummary([
			{ path: "packages/pi/index.ts", summary: "impact:\n  changed: \"packages/pi/index.ts\"" },
			{ path: "packages/pi/utils.ts", summary: "impact:\n  changed: \"packages/pi/utils.ts\"" },
		]);
		assert.match(multiStructured, /\n---\n/);
	});

	it("asks for one-command approval before allowing other dotdotgod CLI in Plan Mode", async () => {
		let prompts = 0;
		assert.deepEqual(await shouldAllowPlanModeBashCommand("grep foo README.md"), { allow: true });
		assert.deepEqual(
			await shouldAllowPlanModeBashCommand("node packages/cli/bin/dotdotgod.mjs validate .", {
				hasUI: true,
				confirm: (title, message) => {
					prompts += 1;
					assert.match(title, /Allow dotdotgod CLI/);
					assert.match(message, /dotdotgod\.mjs validate/);
					return true;
				},
			}),
			{ allow: true },
		);
		assert.equal(prompts, 1);

		const declined = await shouldAllowPlanModeBashCommand("dotdotgod validate .", { hasUI: true, confirm: () => false });
		assert.equal(declined.allow, false);
		assert.match(declined.reason ?? "", /blocked by user/);

		const headless = await shouldAllowPlanModeBashCommand("dotdotgod validate .", { hasUI: false, confirm: () => true });
		assert.equal(headless.allow, false);
		assert.match(headless.reason ?? "", /interactive user approval/);

		const unsafe = await shouldAllowPlanModeBashCommand("rm package.json");
		assert.equal(unsafe.allow, false);
		assert.match(unsafe.reason ?? "", /not allowlisted/);
	});
});

describe("plan-mode request framing", () => {
	it("classifies explicit runtime markers while leaving free-form prose advisory", () => {
		assert.equal(classifyPlanModeRequest("현재 만들어져있는 plan모드를 조사해봐"), "advisory");
		assert.equal(classifyPlanModeRequest("Claude Code하고 Codex에도 적용해줘"), "advisory");
		assert.equal(classifyPlanModeRequest("Execute the plan in docs/plan/foo/README.md"), "explicit_execution");
		assert.equal(classifyPlanModeRequest("설계부터 진행하자"), "advisory");
		assert.equal(classifyPlanModeRequest("Load the dotdotgod project memory."), "memory_load");
	});

	it("builds concise hidden framing for the latest request", () => {
		assert.match(buildPlanModeRequestFraming("fix prompt behavior"), /advisory or planning work/);
		assert.match(buildPlanModeRequestFraming("이 방식이 좋을까?"), /advisory or planning work/);
		assert.match(buildPlanModeRequestFraming("Load the dotdotgod project memory."), /project-memory load request/);
	});
});

describe("plan-mode project-memory load conditions", () => {
	const fullContext = [
		"AGENTS.md",
		"README.md",
		"docs/README.md",
		"docs/spec/README.md",
		"docs/arch/README.md",
		"docs/test/README.md",
		"docs/plan/README.md",
		"docs/plan/example-task/README.md",
		"docs/spec/PLAN_MODE.md",
		"docs/arch/EXTENSION_ARCHITECTURE.md",
		"docs/test/MANUAL_SMOKE.md",
	].join("\n");

	it("detects baseline markers and documentation areas", () => {
		const coverage = collectProjectMemoryContextCoverage(fullContext);
		assert.deepEqual(coverage.areas, ["spec", "arch", "test", "plan"]);
		assert.equal(coverage.markers.includes("AGENTS.md"), true);
	});

	it("requests load when baseline docs are missing", () => {
		const decision = shouldLoadProjectMemoryForPlanning({ latestRequest: "implement Plan Mode framing", contextText: "docs/spec/PLAN_MODE.md" });
		assert.equal(decision.loadNeeded, true);
		assert.equal(decision.reason, "missing-baseline");
		assert.equal(decision.missingMarkers?.includes("AGENTS.md"), true);
	});

	it("does not request load after a recent load or user opt-out", () => {
		assert.deepEqual(shouldLoadProjectMemoryForPlanning({ latestRequest: "implement framing", hasRecentProjectMemoryLoad: true }), { loadNeeded: false, reason: "recent-load" });
		assert.deepEqual(shouldLoadProjectMemoryForPlanning({ latestRequest: "/no-load", contextText: "" }), { loadNeeded: false, reason: "user-opt-out" });
	});

	it("does not infer cross-area load requirements from free-form request wording", () => {
		const contextText = [
			"AGENTS.md",
			"README.md",
			"docs/README.md",
			"docs/spec/README.md",
			"docs/arch/README.md",
			"docs/test/README.md",
			"docs/plan/README.md",
			"docs/spec/PLAN_MODE.md",
		].join("\n");
		const decision = shouldLoadProjectMemoryForPlanning({ latestRequest: "implement runtime validation behavior", contextText });
		assert.equal(decision.loadNeeded, false);
		assert.deepEqual(decision.areas, ["spec"]);
	});

	it("keeps simple advisory work local when project memory coverage is sufficient", () => {
		const decision = shouldLoadProjectMemoryForPlanning({ latestRequest: "이 방식이 좋을까?", contextText: fullContext });
		assert.equal(decision.loadNeeded, false);
	});
});

describe("plan-mode current plan path helpers", () => {
	it("normalizes active plan markdown paths to the task README", () => {
		assert.equal(getCurrentPlanReadmePath("docs/plan/landing-site/README.md"), "docs/plan/landing-site/README.md");
		assert.equal(getCurrentPlanReadmePath("@docs/plan/landing-site/VERIFICATION.md"), "docs/plan/landing-site/README.md");
		assert.equal(getCurrentPlanReadmePath("./docs/plan/landing-site/RESEARCH_NOTES.md"), "docs/plan/landing-site/README.md");
	});

	it("ignores non-plan or incorrectly named markdown paths", () => {
		assert.equal(getCurrentPlanReadmePath("docs/archive/plan/landing-site/README.md"), undefined);
		assert.equal(getCurrentPlanReadmePath("docs/plan/LandingSite/README.md"), undefined);
		assert.equal(getCurrentPlanReadmePath("docs/plan/landing-site/notes.md"), undefined);
		assert.equal(getCurrentPlanReadmePath("packages/pi/README.md"), undefined);
	});

});

describe("plan-mode review helpers", () => {
	it("builds review titles that include the durable plan path and step count", () => {
		assert.equal(buildPlanReviewTitle("docs/plan/example-task/README.md", 1), "Review plan before execution: docs/plan/example-task/README.md (1 step)");
		assert.equal(buildPlanReviewTitle("docs/plan/example-task/README.md", 2), "Review plan before execution: docs/plan/example-task/README.md (2 steps)");
		assert.equal(buildPlanReviewTitle(undefined, 0), "Review plan before execution (0 steps)");
	});

	it("reads saved plan markdown for the review preview", () => {
		const review = buildPlanReviewMarkdown("docs/plan/example-task/README.md", [], (path) => {
			assert.equal(path, "docs/plan/example-task/README.md");
			return "# Example Task\n\nPlan body";
		});

		assert.deepEqual(review, { markdown: "# Example Task\n\nPlan body", source: "file" });
	});

	it("falls back to extracted steps when the saved plan cannot be read", () => {
		const review = buildPlanReviewMarkdown("docs/plan/example-task/README.md", [
			{ step: 1, text: "Write regression tests", completed: false },
			{ step: 2, text: "Refactor review helpers", completed: false },
		], () => {
			throw new Error("missing file");
		});

		assert.equal(review.source, "fallback");
		assert.match(review.markdown, /Plan file could not be read: docs\/plan\/example-task\/README\.md/);
		assert.match(review.markdown, /1\. Write regression tests/);
		assert.match(review.markdown, /2\. Refactor review helpers/);
	});

	it("falls back with an unknown path message when no plan path is available", () => {
		const review = buildPlanReviewMarkdown(undefined, [], () => {
			throw new Error("should not read without a path");
		});

		assert.equal(review.source, "fallback");
		assert.match(review.markdown, /Plan file path is unknown/);
		assert.match(review.markdown, /No extracted Plan: steps were found/);
	});

	it("builds session-rendered review markdown around the preview body", () => {
		const markdown = buildPlanReviewDisplayMarkdown({
			planPath: "docs/plan/example-task/README.md",
			todoCount: 2,
			review: { markdown: "## Plan\n\nBody", source: "file" },
		});

		assert.match(markdown, /^# Review plan before execution: docs\/plan\/example-task\/README\.md \(2 steps\)/);
		assert.match(markdown, /Full saved plan preview/);
		assert.match(markdown, /## Plan\n\nBody/);
	});

	it("maps fallback selector labels to review choices", () => {
		assert.equal(mapPlanReviewFallbackChoice("Execute the plan (track progress)"), "execute");
		assert.equal(mapPlanReviewFallbackChoice("Execute the plan"), "execute");
		assert.equal(mapPlanReviewFallbackChoice("Stay in plan mode"), "stay");
		assert.equal(mapPlanReviewFallbackChoice("Refine the plan"), "refine");
		assert.equal(mapPlanReviewFallbackChoice(undefined), "cancel");
		assert.equal(mapPlanReviewFallbackChoice("Unexpected"), "cancel");
	});

	it("clamps review scroll offsets to the rendered body range", () => {
		assert.deepEqual(getPlanReviewScrollState(-10, 100, 24), { offset: 0, maxOffset: 76, canScrollUp: false, canScrollDown: true });
		assert.deepEqual(getPlanReviewScrollState(20, 100, 24), { offset: 20, maxOffset: 76, canScrollUp: true, canScrollDown: true });
		assert.deepEqual(getPlanReviewScrollState(999, 100, 24), { offset: 76, maxOffset: 76, canScrollUp: true, canScrollDown: false });
		assert.deepEqual(getPlanReviewScrollState(5, 10, 24), { offset: 0, maxOffset: 0, canScrollUp: false, canScrollDown: false });
	});

	it("maps cursor-selectable review actions and wraps selection", () => {
		assert.equal(getPlanReviewActionChoice(0), "execute");
		assert.equal(getPlanReviewActionChoice(1), "stay");
		assert.equal(getPlanReviewActionChoice(2), "refine");
		assert.equal(getPlanReviewActionChoice(3), "cancel");
		assert.equal(getPlanReviewActionChoice(-10), "execute");
		assert.equal(getPlanReviewActionChoice(99), "cancel");
		assert.equal(getNextPlanReviewActionIndex(0, 1), 1);
		assert.equal(getNextPlanReviewActionIndex(3, 1), 0);
		assert.equal(getNextPlanReviewActionIndex(0, -1), 3);
	});
});

describe("plan-mode discussion queue helpers", () => {
	const queueMarkdown = `# Task

## Discussion Queue

- [ ] Q1 scope blocks-execute-review: Should Phase 1 include PLAN.json?
  - Why: Affects validation model and implementation scope.
  - Affects: M2-T2, V1
  - Options:
    - A: Markdown queue only for first slice.
    - B: Add PLAN.json now.
  - Recommended: A
  - Verification impact: B adds schema tests.
  - Status: open
- [x] Q2 preference: Which label should the UI use?
  - Decision: Discussion Queue Console.
  - Status: answered

## Plan:
1. Implement queue`;

	it("extracts Discussion Queue items in FIFO order with fields and options", () => {
		const items = extractDiscussionQueueItems(queueMarkdown);
		assert.equal(items.length, 2);
		assert.equal(items[0]?.id, "Q1");
		assert.equal(items[0]?.type, "scope");
		assert.deepEqual(items[0]?.flags, ["blocks-execute-review"]);
		assert.equal(items[0]?.question, "Should Phase 1 include PLAN.json?");
		assert.equal(items[0]?.why, "Affects validation model and implementation scope.");
		assert.equal(items[0]?.affects, "M2-T2, V1");
		assert.equal(items[0]?.verificationImpact, "B adds schema tests.");
		assert.deepEqual(items[0]?.options.map((option) => `${option.label}:${option.recommended}`), ["A:true", "B:false"]);
		assert.equal(items[1]?.id, "Q2");
		assert.equal(items[1]?.status, "answered");
	});

	it("summarizes unresolved queue items and suppresses execution review", () => {
		const summary = summarizeDiscussionQueue(queueMarkdown);
		assert.equal(summary.items.length, 2);
		assert.equal(summary.unresolved.length, 1);
		assert.equal(summary.unresolved[0]?.id, "Q1");
		assert.equal(summary.blocksExecutionReview, true);

		const answered = queueMarkdown.replace("- [ ] Q1", "- [x] Q1").replace("Status: open", "Status: answered");
		assert.deepEqual(summarizeDiscussionQueue(answered).unresolved, []);
		assert.equal(summarizeDiscussionQueue(answered).blocksExecutionReview, false);
	});

	it("builds follow-up prompts that keep plan markdown as the durable source", () => {
		const answer = buildDiscussionQueueFollowUp("docs/plan/example/README.md", {
			action: "answer",
			itemId: "Q1",
			optionLabel: "A",
			optionText: "Markdown only",
		});
		assert.match(answer ?? "", /Record the user's answer/);
		assert.match(answer ?? "", /Q1/);
		assert.match(answer ?? "", /docs\/plan\/example\/README\.md/);
		assert.match(answer ?? "", /do not start execution yet/);
		assert.equal(buildDiscussionQueueFollowUp("docs/plan/example/README.md", { action: "cancel" }), undefined);
	});
});

describe("plan-mode review refinement helpers", () => {
	it("wraps saved-plan review refinement feedback with plan context", () => {
		const prompt = buildPlanReviewRefinePrompt({
			planPath: "docs/plan/example/README.md",
			context: "Extracted execution steps: 1. Update tests",
			userFeedback: "Split verification into its own step.",
		});
		assert.match(prompt, /Refine docs\/plan\/example\/README\.md before execution/);
		assert.match(prompt, /Current plan context/);
		assert.match(prompt, /Split verification into its own step/);
		assert.match(prompt, /do not start execution yet/);
	});
});

describe("plan-mode execution handoff", () => {
	it("builds a user-message handoff with a resume marker", () => {
		const handoff = buildPlanExecutionHandoff([
			{ step: 2, text: "Run targeted validation", completed: false },
		], "docs/plan/example-task/README.md");

		assert.equal(handoff.trigger, "user-message");
		assert.equal(handoff.persistBeforeTrigger, true);
		assert.equal(handoff.message, "Execute the plan in docs/plan/example-task/README.md. Start with: Run targeted validation");
		assert.deepEqual(handoff.marker, {
			content: handoff.message,
			planPath: "docs/plan/example-task/README.md",
			todoCount: 1,
		});
	});

	it("builds an untracked execute message when no todos are available", () => {
		const handoff = buildPlanExecutionHandoff([], "docs/plan/example-task/README.md");

		assert.equal(handoff.message, "Execute the plan in docs/plan/example-task/README.md.");
		assert.equal(handoff.marker.todoCount, 0);
	});

	it("only creates an execution handoff for an explicit execute review choice", () => {
		const todos: TodoItem[] = [{ step: 1, text: "Run implementation", completed: false }];
		const executed = buildPlanExecutionDecision("execute", todos, "docs/plan/example-task/README.md");
		assert.equal(executed.shouldExecute, true);
		assert.equal(executed.handoff?.message, "Execute the plan in docs/plan/example-task/README.md. Start with: Run implementation");

		for (const choice of ["stay", "refine", "cancel", undefined] as const) {
			const decision = buildPlanExecutionDecision(choice, todos, "docs/plan/example-task/README.md");
			assert.equal(decision.shouldExecute, false, choice);
			assert.equal(decision.handoff, undefined, choice);
		}
	});
});

describe("plan-mode explicit execution helpers", () => {
	it("detects structured execution handoff requests", () => {
		assert.equal(detectPlanExecutionIntent("Execute the plan in docs/plan/impact-ranking-config/README.md."), true);
		for (const request of [
			"execute the impact-ranking-config plan",
			"start the plan in docs/plan/impact-ranking-config/README.md",
			"impact-ranking-config 진행해줘",
			"impact-ranking-config 플랜 시작하자",
			"docs/plan/impact-ranking-config/README.md 실행해줘",
		]) {
			assert.equal(detectPlanExecutionIntent(request), false, request);
		}
	});

	it("does not treat refinement, planning, or non-plan commands as execution intent", () => {
		for (const request of [
			"impact-ranking-config 계획을 수정하자",
			"이 플랜 더 다듬자",
			"plan-mode 실행 질문 버그를 계획하자",
			"설계부터 진행하자",
			"계획을 만들어보자",
			"진행하자",
			"테스트 실행해줘",
			"run tests",
			"implement the package version bump",
			"refine the impact-ranking-config plan",
		]) {
			assert.equal(detectPlanExecutionIntent(request), false, request);
			assert.notEqual(classifyPlanModeRequest(request), "explicit_execution", request);
		}
	});

	it("extracts plan slugs and resolves mentioned active plan paths", () => {
		assert.deepEqual(extractPlanSlugMentions("Execute docs/plan/impact-ranking-config/README.md and plan-mode-specific-plan-execution"), [
			"impact-ranking-config",
			"plan-mode-specific-plan-execution",
		]);

		const exists = (_cwd: string, path: string): boolean => path === "docs/plan/impact-ranking-config/README.md" || path === "docs/plan/current-task/README.md";
		assert.equal(
			resolveMentionedPlanPath(".", "impact-ranking-config 진행해줘", undefined, [], exists),
			"docs/plan/impact-ranking-config/README.md",
		);
		assert.equal(
			resolveMentionedPlanPath(".", "진행해줘", "docs/plan/current-task/README.md", [], exists),
			"docs/plan/current-task/README.md",
		);
		assert.equal(resolveMentionedPlanPath(".", "missing-plan 실행해줘", undefined, [], exists), undefined);
	});

	it("resolves explicit execution targets before falling back to active-plan choices", () => {
		const existing = new Set([
			"docs/plan/current-task/README.md",
			"docs/plan/mentioned-task/README.md",
			"docs/plan/other-task/README.md",
		]);
		const pathExists = (path: string): boolean => existing.has(path);

		assert.deepEqual(
			resolvePlanExecutionTarget({
				request: "mentioned-task 진행하자",
				currentPlanPath: "docs/plan/current-task/README.md",
				activePlanPaths: ["docs/plan/current-task/README.md", "docs/plan/other-task/README.md"],
				allowActivePlanFallback: true,
				pathExists,
			}),
			{ planPath: "docs/plan/mentioned-task/README.md", status: "resolved", candidates: ["docs/plan/mentioned-task/README.md"] },
		);

		assert.deepEqual(
			resolvePlanExecutionTarget({
				request: "진행하자",
				currentPlanPath: "docs/plan/current-task/README.md",
				activePlanPaths: ["docs/plan/current-task/README.md", "docs/plan/other-task/README.md"],
				allowActivePlanFallback: true,
				pathExists,
			}),
			{ planPath: "docs/plan/current-task/README.md", status: "resolved", candidates: ["docs/plan/current-task/README.md"] },
		);
	});

	it("does not report ambiguity for free-form execution prose", () => {
		const resolution = resolvePlanExecutionTarget({
			request: "실행하자",
			activePlanPaths: ["docs/plan/one-task/README.md", "docs/plan/two-task/README.md"],
			allowActivePlanFallback: true,
			pathExists: () => true,
		});

		assert.equal(detectPlanExecutionIntent("실행하자"), false);
		assert.equal(resolution.status, "missing");
		assert.equal(resolution.planPath, undefined);
		assert.deepEqual(resolution.candidates, []);
	});

	it("does not classify planning or implementation requests as active-plan execution", () => {
		const activePlanPaths = ["docs/plan/one-task/README.md", "docs/plan/two-task/README.md"];
		for (const request of [
			"Which active plan should be executed?는 계획을 실행해야 할때만 물어보게 변경하자",
			"선택된 플랜이 없는 상태에서 계획을 하지 않으면 모두 실행되는지 조사해봐",
			"테스트 실행해줘",
			"run tests",
		]) {
			assert.equal(detectPlanExecutionIntent(request), false, request);
			assert.notEqual(classifyPlanModeRequest(request), "explicit_execution", request);
			const resolution = resolvePlanExecutionTarget({ request, activePlanPaths, pathExists: () => true });
			assert.equal(resolution.status, "missing", request);
			assert.deepEqual(resolution.candidates, [], request);
		}
	});
});

describe("plan-mode CLI context helpers", () => {
	it("extracts mentioned file paths from planning requests", () => {
		assert.deepEqual(
			extractPathMentions("Review `packages/pi/extensions/plan-mode/index.ts` and @docs/spec/PLAN_MODE.md, not docs/spec/"),
			["packages/pi/extensions/plan-mode/index.ts", "docs/spec/PLAN_MODE.md"],
		);
	});

	it("selects bounded impact paths from request and plan content", () => {
		const existing = new Set(["packages/pi/index.ts", "packages/pi/utils.ts", "docs/spec/PLAN_MODE.md", "docs/plan/task/README.md"]);
		const exists = (_cwd: string, path: string): boolean => existing.has(path);
		assert.deepEqual(
			selectPlanImpactPaths(
				".",
				"Change packages/pi/index.ts and docs/plan/task/README.md",
				"docs/plan/task/README.md",
				"Target files: packages/pi/utils.ts, docs/spec/PLAN_MODE.md, packages/pi/index.ts",
				[],
				exists,
				3,
			),
			["packages/pi/index.ts", "packages/pi/utils.ts", "docs/spec/PLAN_MODE.md"],
		);
	});

	it("can select a single impact path with a limit", () => {
		const exists = (_cwd: string, path: string): boolean => path === "packages/pi/index.ts";
		assert.deepEqual(
			selectPlanImpactPaths(".", "Change packages/pi/index.ts", "docs/plan/task/README.md", undefined, [], exists, 1),
			["packages/pi/index.ts"],
		);
		assert.deepEqual(
			selectPlanImpactPaths(".", "No source file here", "docs/plan/task/README.md", undefined, [], exists, 1),
			[],
		);
	});

	it("detects explicit bracket refs and formats reference expansion summaries", () => {
		assert.equal(hasExplicitBracketReferences("Update [[PLAN_MODE]]"), true);
		assert.equal(hasExplicitBracketReferences("Update PLAN_MODE"), false);
		assert.equal(hasLikelyFuzzyReferences("Update PLAN_MODE"), true);
		assert.equal(hasLikelyFuzzyReferences("Update docs/spec/PLAN_MODE.md"), true);
		assert.equal(hasLikelyFuzzyReferences("Update `hooks docs`"), true);
		assert.equal(hasLikelyFuzzyReferences("hello world"), false);

		const summary = formatReferenceExpansionSummary({
			refs: [
				{
					query: "PLAN_MODE",
					ambiguous: true,
					omitted: 2,
					candidates: [
						{ path: "docs/spec/PLAN_MODE.md", score: 118 },
						{ path: "docs/test/MANUAL_SMOKE.md", title: "Plan Mode", score: 91 },
					],
					impact: { related: [{ path: "docs/spec/PLAN_MODE.md" }, { path: "packages/pi/extensions/plan-mode/index.ts" }] },
				},
			],
		});
		assert.match(summary, /Reference expansion/);
		assert.match(summary, /PLAN_MODE: ambiguous; omitted=2/);
		assert.match(summary, /docs\/spec\/PLAN_MODE\.md score=118/);
		assert.match(summary, /docs\/test\/MANUAL_SMOKE\.md#Plan Mode score=91/);
		assert.match(summary, /impact=docs\/spec\/PLAN_MODE\.md, packages\/pi\/extensions\/plan-mode\/index\.ts/);
		assert.equal(formatReferenceExpansionSummary({ refs: [] }), "");
	});

	it("formats compact impact summaries with top related items", () => {
		const summary = formatCompactImpactSummary("packages/pi/index.ts", {
			impact: {
				groups: {
					docs: { items: [{ path: "docs/spec/PLAN_MODE.md" }] },
					tests: { items: [{ path: "packages/pi/test/plan-mode-utils.test.ts" }] },
					files: { items: [{ path: "packages/pi/index.ts" }, { path: "packages/pi/utils.ts" }] },
					commands: { items: [] },
					events: { items: [] },
				},
				related: [
					{ path: "packages/pi/index.ts", impactScore: 100, reasons: ["changed-file"] },
					{ path: "docs/spec/PLAN_MODE.md", impactScore: 93.2, reasons: ["incoming:implemented_by", "semantic_similarity"] },
					{ path: "packages/pi/test/plan-mode-utils.test.ts", impactScore: 75, reasons: ["verified_by"] },
				],
			},
		});
		assert.match(summary, /changed=packages\/pi\/index\.ts/);
		assert.match(summary, /docs=1; tests=1; files=2/);
		assert.match(summary, /docs\/spec\/PLAN_MODE\.md score=93\.2 reasons=incoming:implemented_by\+semantic_similarity/);
		assert.match(summary, /packages\/pi\/test\/plan-mode-utils\.test\.ts score=75 reasons=verified_by/);
	});
});

describe("plan-mode tool settings", () => {
	it("parses and resolves extra Plan Mode tools against installed tools", () => {
		assert.deepEqual(parsePlanModeExtraTools("ctx_search, ctx_execute_file, ctx_search, bad tool, subagent"), ["ctx_search", "ctx_execute_file", "subagent"]);
		const resolved = resolvePlanModeTools("ctx_search,missing_tool", ["read", "bash", "edit", "write", "grep", "find", "ls", "ctx_search"]);
		assert.deepEqual(resolved, ["read", "bash", "edit", "write", "grep", "find", "ls", "ctx_search"]);
		assert(!resolved.includes("questionnaire"));
		assert(!resolved.includes("missing_tool"));
	});

	it("injects the resolved Plan Mode tool list into the full prompt", () => {
		const prompt = buildPlanModeContextPrompt(false, ["read", "bash", "ctx_search"], ["docs/proposals/**"]);
		assert.match(prompt, /Allowed tools: read, bash, ctx_search/);
		assert.match(prompt, /docs\/proposals\/\*\*/);
		assert.match(prompt, /questionnaire/);
		assert.match(prompt, /focused query and README indexes/);
		assert.match(prompt, /Run impact review/);
		assert.match(prompt, /stop until the user approves execution/);
		assert.match(prompt, /Forbidden: source\/code\/config mutation/);
		assert.doesNotMatch(prompt, /checkpoint files/);
		assert.doesNotMatch(prompt, /Do NOT attempt to make changes/);
	});
});

describe("plan-mode compaction helpers", () => {
	it("builds planning-focused custom instructions with the reason", () => {
		const instructions = buildPlanCompactionInstructions(`Plan Mode context exceeded ${PLAN_COMPACTION_PERCENT_THRESHOLD}% of the context window.`);
		assert.match(instructions, new RegExp(`^Reason: Plan Mode context exceeded ${PLAN_COMPACTION_PERCENT_THRESHOLD}%`));
		assert.match(instructions, /Preserve only planning-critical context/);
		assert.match(instructions, /active plan task slug\/path\/status/);
		assert.match(instructions, /\[DONE:n\]/);
		assert.match(instructions, /Demote or omit old completed plans/);
		assert.equal(buildPlanCompactionInstructions(), PLAN_MODE_COMPACTION_INSTRUCTIONS);
	});

	it("builds a compact Plan Mode reminder after the full prompt", () => {
		const fullPrompt = buildPlanModeContextPrompt(false);
		const compactPrompt = buildPlanModeContextPrompt(true);

		assert.match(fullPrompt, /You are in Plan Mode/);
		assert.match(fullPrompt, /1\. Check for a matching active plan/);
		assert.match(fullPrompt, /2\. Reuse loaded memory and the documentation map/);
		assert.match(fullPrompt, /4\. Run impact review/);
		assert.doesNotMatch(fullPrompt, /Explore relevant files thoroughly/);
		assert.match(compactPrompt, /Compact reminder/);
		assert.match(compactPrompt, /Do not mutate source\/code\/config files/);
		assert.doesNotMatch(compactPrompt, /checkpoint files/);
		assert.ok(compactPrompt.length < fullPrompt.length / 2);
	});

	it("builds current-work-focused custom instructions", () => {
		const focus = formatPlanCompactionFocus({
			task: "Integrate documentation query into /dd:load",
			activePlanPaths: ["docs/plan/documentation-query-integration/README.md"],
			touchedMemoryPaths: ["docs/plan/documentation-query-integration/README.md"],
			todoSummary: "1/3 completed",
			pendingLoadAfterCompaction: true,
			constraints: ["Use pnpm", "Exclude archive bodies"],
		});
		assert.match(focus ?? "", /Current work focus/);
		assert.match(focus ?? "", /Integrate documentation query/);
		assert.match(focus ?? "", /docs\/plan\/documentation-query-integration\/README\.md/);

		const instructions = buildPlanCompactionInstructions("because", { task: "Do the current task" });
		assert.match(instructions, /Reason: because/);
		assert.match(instructions, /Current work focus/);
		assert.match(instructions, /Do the current task/);
	});

	it("builds a post-compaction resume prompt for the latest request", () => {
		const prompt = buildPlanCompactionResumePrompt("노션 API 연동 방법 조사해줘");
		assert.match(prompt, /Continue the following Plan Mode request after planning-focused compaction/);
		assert.match(prompt, /노션 API 연동 방법 조사해줘/);
		assert.match(buildPlanCompactionResumePrompt(), /Continue the latest Plan Mode request after planning-focused compaction/);
	});

	it("keeps inline /plan requests authoritative until their synthetic user message arrives", () => {
		const waiting = selectLatestPlanningRequest({
			currentRequest: "플랜",
			pendingInlineRequest: "플랜",
			latestUserText: "이전 대화 메시지",
		});
		assert.deepEqual(waiting, { request: "플랜", pendingInlineRequest: "플랜", changed: false });

		const delivered = selectLatestPlanningRequest({
			currentRequest: "플랜",
			pendingInlineRequest: "플랜",
			latestUserText: "플랜",
		});
		assert.deepEqual(delivered, { request: "플랜", pendingInlineRequest: undefined, changed: true });
		assert.match(buildPlanCompactionResumePrompt(waiting.request), /Latest request:\n플랜/);
	});

	it("ignores Plan Mode runtime follow-up messages when selecting the latest request", () => {
		assert.equal(isPlanModeRuntimeRequest("[PLAN MODE ACTIVE]\nStay in planning"), true);
		assert.equal(isPlanModeRuntimeRequest("Load the dotdotgod project memory."), true);
		assert.equal(isPlanModeRuntimeRequest("Continue the following Plan Mode request after planning-focused compaction."), true);
		assert.deepEqual(
			selectLatestPlanningRequest({
				currentRequest: "현재 요청",
				latestUserText: "Continue the latest Plan Mode request after planning-focused compaction.",
			}),
			{ request: "현재 요청", pendingInlineRequest: undefined, changed: false },
		);
	});

	it("skips synthetic project-memory load prompts when selecting the latest request", () => {
		const syntheticFullLoad = "Load the dotdotgod project memory in full mode.\nCurrent working directory: /project";
		const syntheticCompactLoad = "Load the dotdotgod project memory in compact mode.\nCurrent working directory: /project";
		assert.equal(isSyntheticProjectMemoryLoadPrompt(syntheticFullLoad), true);
		assert.equal(isSyntheticProjectMemoryLoadPrompt(syntheticCompactLoad), true);
		assert.equal(isSyntheticProjectMemoryLoadPrompt("Do not modify files. Only load and summarize project memory."), true);
		assert.equal(isSyntheticProjectMemoryLoadPrompt("load 동작을 검토해줘"), false);
		assert.equal(isPlanModeRuntimeRequest(syntheticCompactLoad), true);

		const actualLoadPrompt = buildLoadPrompt("/project", "", {
			present: ["AGENTS.md"],
			missing: [],
			directories: [{ path: "docs/spec", exists: true, markdownFiles: ["docs/spec/README.md"], readmeFiles: ["docs/spec/README.md"] }],
		}, undefined, { mode: "compact" });
		assert.equal(isPlanModeRuntimeRequest(actualLoadPrompt), true);
	});

	it("frames a later human request after a compact load as its own intent, not a load request", () => {
		const syntheticCompactLoad = buildLoadPrompt("/project", "", {
			present: ["AGENTS.md"],
			missing: [],
			directories: [{ path: "docs/spec", exists: true, markdownFiles: ["docs/spec/README.md"], readmeFiles: ["docs/spec/README.md"] }],
		}, undefined, { mode: "compact" });

		const afterSyntheticLoad = selectLatestPlanningRequest({
			currentRequest: "이전 계획 요청",
			latestUserText: syntheticCompactLoad,
		});
		assert.deepEqual(afterSyntheticLoad, { request: "이전 계획 요청", pendingInlineRequest: undefined, changed: false });

		const laterHumanRequest = "load 커맨드의 compact 동작을 검토하고 바꾸고 싶어";
		const afterHumanRequest = selectLatestPlanningRequest({
			currentRequest: afterSyntheticLoad.request,
			latestUserText: laterHumanRequest,
		});
		assert.deepEqual(afterHumanRequest, { request: laterHumanRequest, pendingInlineRequest: undefined, changed: true });
		assert.equal(classifyPlanModeRequest(afterHumanRequest.request), "advisory");
		assert.match(buildPlanModeRequestFraming(afterHumanRequest.request), /advisory or planning work/);
	});

	it("detects token-based planning compaction reasons", () => {
		assert.equal(
			getPlanCompactionReason({ tokens: 60_000, contextWindow: 100_000, percent: 60 }),
			`Plan Mode context exceeded ${PLAN_COMPACTION_PERCENT_THRESHOLD}% of the context window.`,
		);
		assert.equal(
			getPlanCompactionReason({ tokens: 168_000, contextWindow: 200_000 }),
			"Plan Mode context is within 32,000 tokens of the context window.",
		);
		assert.equal(getPlanCompactionReason({ tokens: 100_000 }), "Plan Mode context exceeded 100,000 tokens.");
		assert.equal(getPlanCompactionReason({ tokens: 40_000, contextWindow: 200_000, percent: 20 }), undefined);
	});
});

describe("plan-mode context shaping trigger", () => {
	it("runs the initial shaping check only for active non-execution planning turns", () => {
		assert.equal(shouldShapePlanningContextOnAgentStart({ planModeEnabled: true, executionMode: false, planningContextShapePending: true }), true);
		assert.equal(shouldShapePlanningContextOnAgentStart({ planModeEnabled: false, executionMode: false, planningContextShapePending: true }), false);
		assert.equal(shouldShapePlanningContextOnAgentStart({ planModeEnabled: true, executionMode: true, planningContextShapePending: true }), false);
		assert.equal(shouldShapePlanningContextOnAgentStart({ planModeEnabled: true, executionMode: false, planningContextShapePending: false }), false);
	});
});

describe("plan-mode plan choice trigger", () => {
	it("asks after every active plan file create or update", () => {
		assert.equal(shouldPromptForPlanChoice({ planModeEnabled: true, executionMode: false, hasUI: true, pendingPlanChoicePath: "docs/plan/task/README.md" }), true);
		assert.equal(shouldPromptForPlanChoice({ planModeEnabled: true, executionMode: false, hasUI: true }), false);
		assert.equal(shouldPromptForPlanChoice({ planModeEnabled: true, executionMode: true, hasUI: true, pendingPlanChoicePath: "docs/plan/task/README.md" }), false);
		assert.equal(shouldPromptForPlanChoice({ planModeEnabled: true, executionMode: false, hasUI: false, pendingPlanChoicePath: "docs/plan/task/README.md" }), false);
	});

	it("suppresses the chooser for inline planning follow-up turns", () => {
		assert.equal(
			shouldPromptForPlanChoice({
				planModeEnabled: true,
				executionMode: false,
				hasUI: true,
				pendingPlanChoicePath: "docs/plan/task/README.md",
				suppressPlanChoice: true,
			}),
			false,
		);
	});

});

describe("plan-mode todo extraction", () => {
	it("extracts concrete numbered plan items", () => {
		const todos = extractTodoItems(`Plan:\n1. Update docs/test/README.md\n2. Run pnpm run verify\n3. Archive completed plan`);
		assert.deepEqual(
			todos.map((todo) => todo.text),
			["Docs/test/README.md", "Pnpm run verify", "Archive completed plan"],
		);
	});

	it("ignores generic plan template headings", () => {
		const todos = extractTodoItems(`Plan:\n1. Target files and rationale\n2. Implementation steps\n3. 실행/유지/수정 선택 프롬프트 표시\n4. Verification method`);
		assert.deepEqual(todos, []);
	});

	it("requires a Plan section", () => {
		assert.deepEqual(extractTodoItems("1. Update docs\n2. Run tests"), []);
	});
});

describe("plan-mode done markers", () => {
	it("marks matching items complete case-insensitively", () => {
		const items: TodoItem[] = [
			{ step: 1, text: "One", completed: false },
			{ step: 2, text: "Two", completed: false },
		];
		assert.equal(markCompletedSteps("[done:2] [DONE:9]", items), 2);
		assert.deepEqual(
			items.map((item) => item.completed),
			[false, true],
		);
	});
});
