import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	PLAN_COMPACTION_PERCENT_THRESHOLD,
	PLAN_MODE_COMPACTION_INSTRUCTIONS,
	buildPlanCompactionInstructions,
	detectPlanExecutionIntent,
	buildPlanModeContextPrompt,
	extractDoneSteps,
	extractTodoItems,
	formatCompactImpactSummary,
	formatPlanCompactionFocus,
	formatReferenceExpansionSummary,
	extractPathMentions,
	extractPlanSlugMentions,
	getCurrentPlanReadmePath,
	getPlanCompactionReason,
	hasExplicitBracketReferences,
	parsePlanModeExtraTools,
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
	shouldPromptForPlanChoice,
	shouldShapePlanningContextOnAgentStart,
	type TodoItem,
} from "../extensions/plan-mode/utils.ts";

describe("plan-mode command safety", () => {
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

	it("automatically allows bounded dotdotgod context commands in Plan Mode", async () => {
		for (const command of [
			"dotdotgod graph impact . --changed packages/pi/index.ts --compact --json",
			"dotdotgod expand . 'Update [[PLAN_MODE]]' --json",
			"dotdotgod index .",
			"node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/index.ts --compact --json",
			"node ./packages/cli/bin/dotdotgod.mjs expand . 'Update [[PLAN_MODE]]' --json",
			"node packages/cli/bin/dotdotgod.mjs index .",
		]) {
			assert.equal(isDotdotgodCliCommand(command), true, command);
			assert.equal(isAutoAllowedDotdotgodPlanModeCommand(command), true, command);
			assert.deepEqual(await shouldAllowPlanModeBashCommand(command), { allow: true }, command);
		}

		for (const command of ["dotdotgod validate .", "dotdotgod init .", "node packages/cli/bin/dotdotgod.mjs config init ."]) {
			assert.equal(isDotdotgodCliCommand(command), true, command);
			assert.equal(isAutoAllowedDotdotgodPlanModeCommand(command), false, command);
		}
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
		assert.match(fullPrompt, /Explore relevant files thoroughly/);
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
