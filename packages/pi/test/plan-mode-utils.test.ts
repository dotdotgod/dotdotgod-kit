import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractDoneSteps, extractTodoItems, isSafeCommand, isSafePlanArchiveCommand, markCompletedSteps, type TodoItem } from "../extensions/plan-mode/utils.ts";

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
