import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	PLAN_COMPACTION_PERCENT_THRESHOLD,
	PLAN_MODE_COMPACTION_INSTRUCTIONS,
	buildPlanCompactionInstructions,
	extractDoneSteps,
	extractTodoItems,
	formatPlanCompactionFocus,
	getPlanCompactionReason,
	isSafeCommand,
	isSafePlanArchiveCommand,
	markCompletedSteps,
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
});

describe("plan-mode compaction helpers", () => {
	it("builds planning-focused custom instructions with the reason", () => {
		const instructions = buildPlanCompactionInstructions(`Plan Mode context exceeded ${PLAN_COMPACTION_PERCENT_THRESHOLD}% of the context window.`);
		assert.match(instructions, new RegExp(`^Reason: Plan Mode context exceeded ${PLAN_COMPACTION_PERCENT_THRESHOLD}%`));
		assert.match(instructions, /Preserve planning-critical context/);
		assert.match(instructions, /active plan task slug\/path\/status/);
		assert.match(instructions, /\[DONE:n\]/);
		assert.equal(buildPlanCompactionInstructions(), PLAN_MODE_COMPACTION_INSTRUCTIONS);
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
