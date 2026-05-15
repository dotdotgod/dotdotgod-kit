import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	PLAN_COMPACTION_PERCENT_THRESHOLD,
	PLAN_MODE_COMPACTION_INSTRUCTIONS,
	buildPlanCompactionInstructions,
	buildPlanModeContextPrompt,
	extractDoneSteps,
	extractTodoItems,
	formatPlanCompactionFocus,
	extractPathMentions,
	getCurrentPlanReadmePath,
	getPlanCompactionReason,
	isDotdotgodCliCommand,
	isSafeCommand,
	isSafePlanArchiveCommand,
	markCompletedSteps,
	selectPlanImpactPath,
	shouldAllowPlanModeBashCommand,
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

	it("asks for one-command approval before allowing dotdotgod CLI in Plan Mode", async () => {
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

describe("plan-mode CLI context helpers", () => {
	it("extracts mentioned file paths from planning requests", () => {
		assert.deepEqual(
			extractPathMentions("Review `packages/pi/extensions/plan-mode/index.ts` and @docs/spec/PLAN_MODE.md, not docs/spec/"),
			["packages/pi/extensions/plan-mode/index.ts", "docs/spec/PLAN_MODE.md"],
		);
	});

	it("selects an impact path from request, current plan, then touched paths", () => {
		const exists = (_cwd: string, path: string): boolean => path === "docs/plan/task/README.md" || path === "packages/pi/index.ts";
		assert.equal(selectPlanImpactPath(".", "Change packages/pi/index.ts", "docs/plan/task/README.md", [], exists), "packages/pi/index.ts");
		assert.equal(selectPlanImpactPath(".", "No file here", "docs/plan/task/README.md", [], exists), "docs/plan/task/README.md");
		assert.equal(selectPlanImpactPath(".", "No file here", undefined, ["docs/plan/missing/README.md"], exists), undefined);
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
