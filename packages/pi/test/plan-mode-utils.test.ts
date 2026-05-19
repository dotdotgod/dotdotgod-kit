import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	PLAN_COMPACTION_PERCENT_THRESHOLD,
	PLAN_MODE_COMPACTION_INSTRUCTIONS,
	buildPlanCompactionInstructions,
	buildPlanModeRequestFraming,
	classifyPlanModeRequest,
	collectProjectMemoryContextCoverage,
	detectPlanExecutionIntent,
	buildPlanModeContextPrompt,
	extractDoneSteps,
	extractTodoItems,
	formatCompactImpactSummary,
	formatExpandableToolOutput,
	formatMultiImpactSummary,
	formatPlanCompactionFocus,
	formatReferenceExpansionSummary,
	extractPathMentions,
	extractPlanSlugMentions,
	getCurrentPlanReadmePath,
	getChangedPathFromDotdotgodImpactCommand,
	getPlanCompactionReason,
	hasExplicitBracketReferences,
	hasLikelyFuzzyReferences,
	isBroadVerificationCommand,
	isCommitLikeCommand,
	normalizeImpactPath,
	normalizePlanCommandRequest,
	mergeImpactCheckPaths,
	parsePlanModeExtraTools,
	pendingImpactSummary,
	resolveMentionedPlanPath,
	isAutoAllowedDotdotgodPlanModeCommand,
	isDotdotgodCliCommand,
	isSafeCommand,
	isSafePlanArchiveCommand,
	markCompletedSteps,
	resolvePlanModeTools,
	selectPlanImpactPath,
	selectPlanImpactPaths,
	shouldAllowPlanModeBashCommand,
	shouldLoadProjectMemoryForPlanning,
	shouldPromptForPlanChoice,
	shouldTrackImpactPath,
	shouldShapePlanningContextOnAgentStart,
	upsertPendingImpact,
	clearPendingImpactForPath,
	type PendingImpactItem,
	type TodoItem,
} from "../extensions/plan-mode/utils.ts";

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
			"dotdotgod load-snapshot . --json",
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
		assert.equal(getChangedPathFromDotdotgodImpactCommand("dotdotgod graph impact . --changed packages/pi/extensions/plan-mode/index.ts --yml"), "packages/pi/extensions/plan-mode/index.ts");
		assert.equal(getChangedPathFromDotdotgodImpactCommand("node /tmp/repo/packages/cli/bin/dotdotgod.mjs graph impact . --changed=packages/pi/extensions/plan-mode/utils.ts --json"), "packages/pi/extensions/plan-mode/utils.ts");
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
	it("classifies advisory, implementation, execution, and memory-load requests", () => {
		assert.equal(classifyPlanModeRequest("현재 만들어져있는 plan모드를 조사해봐"), "advisory");
		assert.equal(classifyPlanModeRequest("Claude Code하고 Codex에도 적용해줘"), "implementation_request");
		assert.equal(classifyPlanModeRequest("Execute the plan in docs/plan/foo/README.md"), "explicit_execution");
		assert.equal(classifyPlanModeRequest("Load the dotdotgod project memory."), "memory_load");
	});

	it("builds concise hidden framing for the latest request", () => {
		assert.match(buildPlanModeRequestFraming("fix prompt behavior"), /convert it into a durable implementation plan first/);
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
		assert.deepEqual(shouldLoadProjectMemoryForPlanning({ latestRequest: "do not load more context", contextText: "" }), { loadNeeded: false, reason: "user-opt-out" });
	});

	it("requests load when only one docs area remains for cross-area work", () => {
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
		assert.equal(decision.loadNeeded, true);
		assert.equal(decision.reason, "single-area-only");
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

describe("plan-mode explicit execution helpers", () => {
	it("detects explicit English and Korean requests to execute a plan", () => {
		for (const request of [
			"Execute the plan in docs/plan/impact-ranking-config/README.md.",
			"execute the impact-ranking-config plan",
			"start the plan in docs/plan/impact-ranking-config/README.md",
			"impact-ranking-config 진행해줘",
			"impact-ranking-config 플랜 시작하자",
			"docs/plan/impact-ranking-config/README.md 실행해줘",
		]) {
			assert.equal(detectPlanExecutionIntent(request), true, request);
		}
	});

	it("does not treat refinement or planning language as execution intent", () => {
		for (const request of [
			"impact-ranking-config 계획을 수정하자",
			"이 플랜 더 다듬자",
			"plan-mode 실행 질문 버그를 계획하자",
			"refine the impact-ranking-config plan",
		]) {
			assert.equal(detectPlanExecutionIntent(request), false, request);
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

	it("keeps the single impact path helper compatible", () => {
		const exists = (_cwd: string, path: string): boolean => path === "packages/pi/index.ts";
		assert.equal(selectPlanImpactPath(".", "Change packages/pi/index.ts", "docs/plan/task/README.md", [], exists), "packages/pi/index.ts");
		assert.equal(selectPlanImpactPath(".", "No source file here", "docs/plan/task/README.md", [], exists), undefined);
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
		const prompt = buildPlanModeContextPrompt(false, ["read", "bash", "ctx_search"]);
		assert.match(prompt, /Allowed tools: read, bash, ctx_search/);
		assert.match(prompt, /using questionnaire if available/);
		assert.match(prompt, /run dotdotgod graph impact for intended changed files/);
		assert.match(prompt, /post-coding dotdotgod validate/);
		assert.match(prompt, /You may create or update only the allowed docs\/plan or docs\/archive markdown files/);
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
		assert.match(fullPrompt, /Explore files in bounded passes/);
		assert.match(fullPrompt, /top related specs\/tests\/source files first/);
		assert.match(fullPrompt, /Do not paste large raw impact payloads into durable plans/);
		assert.doesNotMatch(fullPrompt, /Explore relevant files thoroughly/);
		assert.match(compactPrompt, /Compact reminder/);
		assert.match(compactPrompt, /Do not mutate source\/code\/config files/);
		assert.ok(compactPrompt.length < fullPrompt.length / 2);
	});

	it("builds current-work-focused custom instructions", () => {
		const focus = formatPlanCompactionFocus({
			task: "Integrate load-snapshot into /dd:load",
			activePlanPaths: ["docs/plan/load-snapshot-integration/README.md"],
			touchedMemoryPaths: ["docs/plan/load-snapshot-integration/README.md"],
			todoSummary: "1/3 completed",
			pendingLoadAfterCompaction: true,
			constraints: ["Use pnpm", "Exclude archive bodies"],
		});
		assert.match(focus ?? "", /Current work focus/);
		assert.match(focus ?? "", /Integrate load-snapshot/);
		assert.match(focus ?? "", /docs\/plan\/load-snapshot-integration\/README\.md/);

		const instructions = buildPlanCompactionInstructions("because", { task: "Do the current task" });
		assert.match(instructions, /Reason: because/);
		assert.match(instructions, /Current work focus/);
		assert.match(instructions, /Do the current task/);
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
		assert.equal(shouldPromptForPlanChoice({ planModeEnabled: true, executionMode: false, hasUI: true, activePlanTouched: true }), true);
		assert.equal(shouldPromptForPlanChoice({ planModeEnabled: true, executionMode: false, hasUI: true }), false);
		assert.equal(shouldPromptForPlanChoice({ planModeEnabled: true, executionMode: true, hasUI: true, pendingPlanChoicePath: "docs/plan/task/README.md" }), false);
		assert.equal(shouldPromptForPlanChoice({ planModeEnabled: true, executionMode: false, hasUI: false, pendingPlanChoicePath: "docs/plan/task/README.md" }), false);
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
	it("extracts done markers case-insensitively", () => {
		assert.deepEqual(extractDoneSteps("[DONE:1] text [done:3]"), [1, 3]);
	});

	it("marks matching items complete", () => {
		const items: TodoItem[] = [
			{ step: 1, text: "One", completed: false },
			{ step: 2, text: "Two", completed: false },
		];
		assert.equal(markCompletedSteps("[DONE:2] [DONE:9]", items), 2);
		assert.deepEqual(
			items.map((item) => item.completed),
			[false, true],
		);
	});
});
