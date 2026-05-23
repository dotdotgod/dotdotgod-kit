import assert from "node:assert/strict";
import * as fs from "node:fs";
import test from "node:test";
import registerDotdotgodSubagents from "../extensions/subagents/index.ts";

test("subagents wrapper defers runtime tool inspection until session start", async () => {
	let getAllToolsCalls = 0;
	const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
	const pi = {
		on(event: string, handler: (...args: unknown[]) => unknown) {
			const eventHandlers = handlers.get(event) ?? [];
			eventHandlers.push(handler);
			handlers.set(event, eventHandlers);
		},
		getAllTools() {
			getAllToolsCalls += 1;
			return [{ name: "subagent" }];
		},
	};

	registerDotdotgodSubagents(pi as never);

	assert.equal(getAllToolsCalls, 0);
	assert.equal(handlers.get("session_start")?.length, 1);
	assert.equal(handlers.get("resources_discover")?.length, 1);

	await handlers.get("session_start")?.[0]?.();
	assert.equal(getAllToolsCalls, 1);

	const resources = handlers.get("resources_discover")?.[0]?.() as { skillPaths: string[]; promptPaths: string[] };
	assert.equal(resources.skillPaths.length, 1);
	assert.equal(resources.promptPaths.length, 1);
	const [skillPath] = resources.skillPaths;
	const [promptPath] = resources.promptPaths;
	assert.ok(skillPath);
	assert.ok(promptPath);
	assert.equal(fs.existsSync(skillPath), true);
	assert.equal(fs.existsSync(promptPath), true);
});
