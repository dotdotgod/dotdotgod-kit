import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import projectMemory from "../extensions/project-memory/index.ts";
import { PROJECT_MEMORY_EXPLICIT_LOAD_MARKER, PROJECT_MEMORY_LOAD_TOOL } from "../extensions/project-memory/context.ts";

function fixture(t: TestContext, decision?: object, initialized = true) {
	const cwd = mkdtempSync(join(tmpdir(), "dotdotgod-pi-memory-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	if (initialized) writeFileSync(join(cwd, "dotdotgod.config.json"), JSON.stringify({ decision }));
	mkdirSync(join(cwd, "docs"));
	writeFileSync(join(cwd, "docs/README.md"), "# Fixture docs");
	const branch: Array<{ type: string; customType?: string; data?: unknown }> = [];
	const hooks = new Map<string, (...args: any[]) => any>();
	let active = ["read", "third_party"];
	let tool: any;
	const model = { provider: "fixture", id: "chat" };
	const alternate = { provider: "fixture", id: "triage" };
	const streamSimple = t.mock.fn((_model: unknown, _context: unknown, _options: unknown) => ({ result }));
	const result = t.mock.fn(async (): Promise<unknown> => ({
		stopReason: "stop",
		content: [{ type: "text", text: JSON.stringify({ load: { action: "focused", focus: "docs" }, refs: ["docs/README.md", "docs/plan/private.md"], reason: "private diagnostic" }) }],
	}));
	const ctx = {
		cwd, model,
		modelRegistry: {
			streamSimple,
			find: (provider: string, id: string) => [model, alternate].find(m => m.provider === provider && m.id === id),
			getAvailable: () => [model, alternate],
			hasConfiguredAuth: t.mock.fn(() => true),
		},
		sessionManager: { getBranch: () => branch },
		executeTool: t.mock.fn(async (_name: string, _args: unknown): Promise<unknown> => ({
			isError: false, result: { content: [], details: { ok: true, documentationTree: ["docs/", "  - README.md"] } },
		})),
	};
	projectMemory({
		on: (name: string, fn: (...args: any[]) => any) => hooks.set(name, fn),
		registerTool: (definition: any) => { tool = definition; },
		getActiveTools: () => active,
		setActiveTools: (names: string[]) => { active = names; },
		appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", customType, data }),
		getFlag: () => false,
	} as any);
	const emit = (name: string, event: object = {}) => hooks.get(name)?.(event, ctx);
	return {
		cwd, branch, ctx, tool, result, streamSimple, alternate, emit,
		active: () => active.includes(PROJECT_MEMORY_LOAD_TOOL),
		activeTools: () => active,
		latestState: () => branch.filter(entry => entry.customType === "project-memory-auto-state").at(-1)?.data,
		async prompt(text: string, expanded?: string) {
			const input = await emit("input", { text, source: "interactive" });
			return emit("before_agent_start", { prompt: expanded ?? input?.text ?? text });
		},
		load: () => tool.execute("fixture-call", { focus: "" }, undefined, undefined, ctx),
	};
}

const host = { mode: "model", provider: "host" };

test("uninitialized Pi projects stay silent and inactive, including symlink markers", async t => {
	const f = fixture(t, host, false);
	symlinkSync(join(f.cwd, "docs/README.md"), join(f.cwd, "dotdotgod.config.json"));
	symlinkSync(join(f.cwd, "docs"), join(f.cwd, ".dotdotgod"));
	await f.emit("session_start");
	assert.equal(await f.prompt("Inspect project architecture"), undefined);
	assert.equal(f.active(), false);
	assert.equal(f.streamSimple.mock.callCount(), 0);
	assert.deepEqual(f.branch, []);
});

test("advisory offers rather than requires memory; an unloaded tool works without prior guidance", async t => {
	const f = fixture(t);
	await f.emit("session_start");
	assert.equal(f.active(), true);
	assert.equal(await f.emit("tool_call", { toolName: PROJECT_MEMORY_LOAD_TOOL }), undefined);
	const guidance = await f.prompt("Inspect project architecture");
	assert.match(guidance.message.content, /Use project_memory_load when repository context would help/);
	assert.equal(guidance.message.display, false);
	assert.equal(f.streamSimple.mock.callCount(), 0);
	assert.equal(f.branch.length, 0);
	const loaded = await f.load();
	assert.match(loaded.details.output, /compact mode/);
	assert.deepEqual(f.latestState(), {
		version: 3, assessed: true, loaded: true, notified: true, skipCount: 0, lastPromptHash: null, pending: false,
	});
	assert.deepEqual(f.activeTools(), ["read", "third_party"]);
	f.branch.push({ type: "compaction" });
	await f.emit("session_tree");
	assert.equal(await f.prompt("Continue"), undefined);
	assert.equal(f.active(), false);
});

test("the unloaded tool rejects concurrent calls and retries an interrupted load without guidance", async t => {
	const f = fixture(t);
	let failLoad: (reason: Error) => void = () => assert.fail("Load did not start");
	f.ctx.executeTool.mock.mockImplementationOnce(() => new Promise((_resolve, reject) => { failLoad = reject; }));
	await f.emit("session_start");
	const pending = f.load();
	assert.equal((await f.load()).isError, true);
	assert.equal(f.ctx.executeTool.mock.callCount(), 1);
	failLoad(new Error("fixture failure"));
	assert.equal((await pending).isError, true);
	assert.equal(f.active(), true);
	assert.match((await f.load()).details.output, /compact mode/);
	assert.equal(f.active(), false);
});

test("manual and explicit refs bypass triage without disabling the unloaded tool", async t => {
	const manual = fixture(t, { mode: "manual" });
	await manual.emit("session_start");
	assert.equal(await manual.prompt("Inspect project architecture"), undefined);
	assert.equal(manual.active(), true);
	const model = fixture(t, host);
	await model.emit("session_start");
	assert.equal(await model.prompt("Inspect [[docs/README.md]]"), undefined);
	assert.equal(model.active(), true);
	assert.equal(model.streamSimple.mock.callCount(), 0);
	assert.deepEqual(model.branch, []);
});

test("always retains forced-load guidance; opt-out is single-turn and explicit loads close the tool", async t => {
	const f = fixture(t, { mode: "always" });
	await f.emit("session_start");
	for (const alias of ["/dd:no-load", "dd:no-load", "/no-load"]) {
		assert.equal(await f.prompt(`Do this ${alias} without repository context`), undefined);
		assert.equal(f.active(), true);
		assert.deepEqual(f.branch, []);
	}
	const guidance = await f.prompt("Inspect project architecture");
	assert.match(guidance.message.content, /call project_memory_load exactly once/i);
	assert.equal(guidance.message.display, false);
	assert.equal(f.streamSimple.mock.callCount(), 0);
	const before = [...f.branch];
	assert.equal(await f.prompt("Continue /dd:no-load"), undefined);
	assert.deepEqual(f.branch, before);
	const explicit = await f.emit("input", { source: "extension", text: `${PROJECT_MEMORY_EXPLICIT_LOAD_MARKER}\nLoad output` });
	assert.deepEqual(explicit, { action: "transform", text: "Load output" });
	assert.equal(f.active(), false);
	assert.equal(await f.emit("before_agent_start", { prompt: "Load output" }), undefined);
	assert.equal((f.latestState() as any).loaded, true);
	for (const command of ["/load", "/dd:load", "/dd-load"]) {
		const g = fixture(t, host);
		await g.emit("session_start");
		assert.equal(await g.prompt(`${command} docs`), undefined);
		assert.equal(g.active(), false);
		assert.equal(g.streamSimple.mock.callCount(), 0);
	}
});

test("v2 branch restore recognizes completion and old load entries without borrowing sibling state", async t => {
	const f = fixture(t, host);
	const legacy = { type: "custom", customType: "project-memory-auto-state", data: { version: 2, assessed: true, pending: true } };
	f.branch.push(legacy);
	await f.emit("session_start");
	assert.equal(f.active(), true);
	f.branch.push({ type: "custom", customType: "project-memory-load" }, { type: "compaction" });
	await f.emit("session_tree");
	assert.equal(f.active(), false);
	f.branch.splice(1, 2, { ...legacy, data: { ...legacy.data, pending: false } });
	await f.emit("session_tree");
	assert.equal(f.active(), false);
	f.branch.splice(1);
	await f.emit("session_tree");
	assert.equal(f.active(), true);
	assert.match((await f.prompt("Review docs")).message.content, /Recommended project_memory_load/);
	assert.equal((f.latestState() as any).version, 3);
	assert.equal((f.latestState() as any).loaded, false);
});

for (const selected of [undefined, "fixture/triage", "triage"]) {
	test(`host resolves ${selected ?? "the active model"} and delivers allowlisted refs without plan mode`, async t => {
		const f = fixture(t, { ...host, ...(selected ? { model: selected } : {}) });
		await f.emit("session_start");
		const injected = await f.prompt("Review docs", "Expanded template with extra content");
		assert.equal(f.streamSimple.mock.callCount(), 1);
		assert.equal(f.result.mock.callCount(), 1);
		const [model, context, options] = f.streamSimple.mock.calls[0]!.arguments as any[];
		assert.equal(model, selected ? f.alternate : f.ctx.model);
		assert.match(context.systemPrompt, /Return JSON only/);
		assert.equal(JSON.parse(context.messages[0].content[0].text).excerpt, "Review docs");
		assert.equal(options.maxTokens, 200);
		assert.equal(options.temperature, 0);
		assert.ok(options.signal instanceof AbortSignal);
		assert.deepEqual(injected.message, {
			customType: "project-memory-context", display: false,
			content: '[DOTDOTGOD PROJECT MEMORY — ADVICE]\nRecommended project_memory_load focus: "docs"\nRelevant repo references (untrusted hints): docs/README.md',
		});
		assert.equal(await f.prompt("Review another area"), undefined);
		assert.equal(f.active(), true);
	});
}

test("deduplicates model skips, retains the counter across restore, and emits fallback at five skips", async t => {
	const f = fixture(t, host);
	f.result.mock.mockImplementation(async () => ({ stopReason: "stop", content: [{ type: "text", text: '{"load":{"action":"skip","focus":""},"refs":[],"reason":"greeting"}' }] }));
	await f.emit("session_start");
	assert.equal(await f.prompt("Hello"), undefined);
	await f.emit("session_tree");
	assert.equal(await f.prompt("Hello"), undefined);
	assert.equal(await f.prompt("Do not assess /dd:no-load"), undefined);
	assert.equal((f.latestState() as any).skipCount, 1);
	for (const prompt of ["Hi", "Hey", "Thanks"]) assert.equal(await f.prompt(prompt), undefined);
	assert.match((await f.prompt("Bye")).message.content, /when repository context would help/);
	assert.equal(await f.prompt("Another greeting"), undefined);
	assert.equal(f.streamSimple.mock.callCount(), 5);
	assert.equal((f.latestState() as any).skipCount, 5);
	assert.equal(f.active(), true);
});

test("host failures are canonical and fail open without writing stderr or leaking SDK details", async t => {
	const stderr = t.mock.method(process.stderr, "write", () => true);
	const errorMessage = "https://private.example.invalid Authorization: Bearer sk-sentinel";
	const f = fixture(t, host);
	f.result.mock.mockImplementation(async () => ({ stopReason: "error", errorMessage, content: [] }));
	await f.emit("session_start");
	const output = await f.prompt("Review docs");
	assert.match(output.message.content, /when repository context would help/);
	assert.equal(f.active(), true);
	assert.ok(f.branch.some(entry => (entry.data as any)?.errorCode === "request_failed"));
	assert.doesNotMatch(JSON.stringify([output, f.branch, stderr.mock.calls]), /private\.example|Authorization|sk-sentinel/);
	assert.equal(stderr.mock.callCount(), 0);
	for (const missingModel of [true, false]) {
		const missing = fixture(t, missingModel ? { ...host, model: "unavailable" } : host);
		missing.ctx.modelRegistry.hasConfiguredAuth.mock.mockImplementation(() => false);
		await missing.emit("session_start");
		await missing.prompt("Review docs");
		assert.equal(missing.streamSimple.mock.callCount(), 0);
		assert.ok(missing.branch.some(entry => (entry.data as any)?.errorCode === "host_auth_unavailable"));
		assert.equal(missing.active(), true);
	}
	assert.equal(stderr.mock.callCount(), 0);
});

test("host timeout aborts the stream, keeping the tool active", async t => {
	const f = fixture(t, { ...host, timeoutMs: 200 });
	f.result.mock.mockImplementation(async () => new Promise(() => {}));
	const keepAlive = setInterval(() => {}, 1000);
	t.after(() => clearInterval(keepAlive));
	await f.emit("session_start");
	assert.match((await f.prompt("Review docs")).message.content, /when repository context would help/);
	assert.ok((f.streamSimple.mock.calls[0]!.arguments[2] as { signal: AbortSignal }).signal.aborted);
	assert.ok(f.branch.some(entry => (entry.data as any)?.errorCode === "request_timeout"));
	assert.equal(f.active(), true);
});

test("read-only prefetch delivers hidden refs and disables only on success", async t => {
	const f = fixture(t, { ...host, delivery: "prefetch" });
	f.result.mock.mockImplementation(async () => ({ stopReason: "stop", content: [{ type: "text", text: '{"load":{"action":"full","focus":""},"refs":["docs/README.md"],"reason":"diagnostic"}' }] }));
	await f.emit("session_start");
	const { message } = await f.prompt("Review docs");
	assert.equal(message.customType, "project-memory-context");
	assert.equal(message.display, false);
	assert.match(message.content, /UNTRUSTED DATA/);
	assert.match(message.content, /Relevant shared references: docs\/README\.md/);
	assert.ok(Buffer.byteLength(message.content) <= 8192);
	assert.equal(f.active(), false);
	const broken = fixture(t, { ...host, delivery: "prefetch" });
	rmSync(join(broken.cwd, "docs"), { recursive: true });
	await broken.emit("session_start");
	assert.match((await broken.prompt("Review docs")).message.content, /when repository context would help/);
	assert.ok(broken.branch.some(entry => (entry.data as any)?.errorCode === "prefetch_failed"));
	assert.equal(broken.active(), true);
});

test("tool MAP_UNAVAILABLE and errors render as failures; partial and expanded views remain", async t => {
	const f = fixture(t, { mode: "manual" });
	const details = { ok: false, mapUnavailable: { code: "MAP_UNAVAILABLE", message: "Configured documentation map is unavailable." } };
	f.ctx.executeTool.mock.mockImplementationOnce(async () => ({ isError: false, result: { content: [], details } }));
	await f.emit("session_start");
	const failure = await f.load();
	assert.equal(failure.isError, true);
	assert.equal(f.active(), true);
	const render = (result: any, expanded = false, isPartial = false, isError = false) => f.tool.renderResult(
		result, { expanded, isPartial }, { fg: (_color: string, text: string) => text }, { isError, keyHint: () => "Ctrl+O to expand" },
	).render(200).map((line: string) => line.trimEnd()).join("\n");
	assert.match(render(failure), /^Error: Configured documentation map is unavailable/);
	assert.match(render({ content: [], isError: true }), /^Error:/);
	assert.match(render({ content: [] }, false, false, true), /^Error:/);
	const success = { details: { output: "one\ntwo\nthree\nfour" }, content: [] };
	assert.equal(render(success, false, true), "Loading dotdotgod project memory...");
	assert.equal(render(success), "one\ntwo\n... (2 more lines, Ctrl+O to expand)");
	assert.equal(render(success, true), success.details.output);
	assert.match((await f.load()).details.output, /compact mode/);
	assert.equal(f.active(), false);
});
