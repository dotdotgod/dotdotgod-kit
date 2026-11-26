import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { setTimeout as tick } from "node:timers/promises";
import { initTheme, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ImpactState } from "@dotdotgod/cli/impact";

const jiti = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))("jiti").createJiti(import.meta.url);
const modulePath = (file: string) => new URL(`../extensions/plan-mode/${file}`, import.meta.url).pathname;
const install = await jiti.import(modulePath("index.ts"), { default: true }) as (api: ExtensionAPI) => void;
const { loadReviewSnapshot } = await jiti.import(modulePath("controllers/review-gates.ts")) as typeof import("../extensions/plan-mode/controllers/review-gates.ts");
const { describePendingPlanDecisions } = await jiti.import(modulePath("controllers/decision-wizard.ts")) as typeof import("../extensions/plan-mode/controllers/decision-wizard.ts");
const { ChildManager } = await jiti.import(modulePath("children/manager.ts")) as typeof import("../extensions/plan-mode/children/manager.ts");
const { ExecutionEvidenceController } = await jiti.import(modulePath("controllers/execution-evidence.ts")) as typeof import("../extensions/plan-mode/controllers/execution-evidence.ts");
const plan = "docs/plan/task/README.md";
const other = "docs/plan/other/README.md";
const markdown = "# Task\n## Plan:\n1. Implement it\n2. Verify behavior\n";
const checks = "## Verification\n```sh\npnpm test\ngit status --short\n```\n";
const queue = "## Discussion Queue\n- [ ] Q1 scope blocks-execute-review: Pick storage?\n  - Options:\n    - A: Markdown\n  - Status: open\n";
const mcp = "mcp__dotdotgod_context__execute";
const canary = "SECRET_CANARY_TOKEN_XYZ";
const assistant = (text: string, stopReason = "stop") => ({ role: "assistant", stopReason, content: [{ type: "text", text }] });
const boundary = (outcome = "completed") => ({ outcome, entries: [], continue: false, context: { canContinue: false, pendingMessages: [] } });
const passed = { ok: true, code: 0, timedOut: false, aborted: false, captureLimitExceeded: false };
const failed = { ok: false, code: 1 };
const journal = (customType: string, data: unknown) => ({ type: "custom", customType, data });

function fixture(root: string) {
	const cwd = join(root, "project");
	mkdirSync(cwd);
	const handlers = new Map<string, Function>();
	const commands = new Map<string, Function>();
	const tools = new Map<string, { execute: Function }>();
	let shortcut: Function;
	const branches = new Map<string, any[]>([["main", []], ["sibling", [journal("plan-mode", { version: 2, mode: { mode: "executing" } })]]]);
	let branch = "main";
	let activeTools: string[] = [];
	const registeredFlags = new Set<string>();
	const metricsPath = join(root, "metrics.jsonl");
	const flags = new Map<string, unknown>([["dd-context-debug-output", metricsPath]]);
	const calls: { kind: string; value: any }[] = [];
	const log = (kind: string, value: unknown) => calls.push({ kind, value });
	const read = (kind: string) => calls.filter(call => call.kind === kind).map(call => call.value);
	const active = () => branches.get(branch)!;
	const write = (text: string, path = plan) => {
		const file = join(cwd, path);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, text);
	};
	write(markdown);
	write("# Other\n## Plan:\n1. New work\n", other);
	const hooks = {
		append: (_type: string, _value: any) => {},
		select: async (_title: string, choices: string[]) => choices[0],
		custom: async (_factory: Function) => undefined as string | undefined,
		editor: async () => undefined as string | undefined,
	};
	install({
		on: (name: string, callback: Function) => handlers.set(name, callback),
		registerCommand: (name: string, command: { handler: Function }) => commands.set(name, command.handler),
		registerShortcut: (_key: unknown, config: { handler: Function }) => { shortcut = config.handler; },
		registerFlag: (name: string) => { registeredFlags.add(name); },
		registerTool: (tool: { name: string; execute: Function }) => tools.set(tool.name, tool),
		getFlag: (name: string) => flags.get(name),
		getAllTools: () => ["read", "write", "edit", "bash", "grep", "web_search", "questionnaire", "my_tool", mcp].map(name => ({ name })),
		getActiveTools: () => activeTools,
		setActiveTools: (names: string[]) => { activeTools = names; log("tools", names); },
		appendEntry: (type: string, value: unknown) => {
			hooks.append(type, value);
			const entry = journal(type, structuredClone(value));
			active().push(entry);
			log("entry", entry);
		},
		sendUserMessage: (content: string, options: unknown) => log("follow-up", { content, options }),
		sendMessage: (message: unknown, options: unknown) => log("send", { message, options }),
	} as unknown as ExtensionAPI);
	const ctx = {
		cwd, hasUI: true, mode: "rpc" as string | undefined, getContextUsage: () => undefined,
		isIdle: () => true, isProjectTrusted: () => false,
		sessionManager: {
			getSessionId: () => "execution-fixture", getBranch: () => [...active()],
			getEntries: () => [...active(), ...branches.get("sibling")!],
		},
		ui: {
			theme: { fg: (color: string, text: string) => `${color}:${text}`, bold: (text: string) => text },
			setStatus: (key: string, value: unknown) => log("status", { key, value }),
			setWidget: (key: string, value: unknown) => log("widget", { key, value }),
			notify: (message: string, level: string) => log("notify", { message, level }),
			select: (title: string, choices: string[]) => { log("select", { title, choices }); return hooks.select(title, choices); },
			custom: (factory: Function) => { log("custom", true); return hooks.custom(factory); },
			editor: () => { log("editor", true); return hooks.editor(); },
		},
	};
	const emit = async (name: string, event: unknown = {}) => handlers.get(name)!(event, ctx);
	const command = async (args = "") => commands.get("dd:plan")!(args, ctx);
	const choose = (prefix: string) => { hooks.select = async (_title, choices) => choices.find(choice => choice.startsWith(prefix)); };
	const review = async (prefix = "Execute") => {
		choose(prefix);
		await emit("agent_end", { messages: [assistant("Plan:\n1. Fake")] });
	};
	const approve = async (path = plan) => { await command(path); await review(); };
	const phase = () => active().filter(e => e.customType === "plan-mode").at(-1)?.data;
	const status = () => read("status").filter(update => update.key === "plan-mode").at(-1)?.value;
	const start = async (event = { prompt: "Proceed" }) => {
		const result = await emit("before_agent_start", event);
		if (result?.message) log("prompt", result.message);
		return result?.message;
	};
	const turn = async (text = "Continuing", stopReason = "stop") => emit("turn_end", { message: assistant(text, stopReason) });
	const settled = async (value: { aborted?: boolean } = { aborted: false }) => emit("agent_settled", value);
	const before = async (event: unknown = boundary()) => emit("agent_before_settle", event);
	const tool = async (event: any) => {
		await emit("tool_execution_start", event);
		await emit("tool_result", event);
		await emit("tool_execution_end", event);
	};
	const edit = async (path = "src/unit.ts", isError = false) => tool({ toolName: "edit", toolCallId: `edit-${calls.length}`, isError, input: { path } });
	const metrics = () => readFileSync(metricsPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
	const fork = async (name: string, entries: any[], event = "session_tree") => { branches.set(name, entries); branch = name; await emit(event); };
	return { cwd, ctx, hooks, calls, read, emit, command, choose, review, approve, phase, status, start, turn, settled, before, tool, tools, edit, metrics, fork, write, flags, registeredFlags, active, activeTools: () => activeTools, shortcut: () => shortcut(ctx) };
}

function scenario(name: string, run: (h: ReturnType<typeof fixture>, root: string) => Promise<void>) {
	test(name, async () => {
		const root = mkdtempSync(join(tmpdir(), "plan-mode-exec-"));
		try { await run(fixture(root), root); }
		finally { rmSync(root, { recursive: true, force: true }); }
	});
}

const bash = (id: string, command = "pnpm test", code = 0) => ({ toolName: "bash", toolCallId: id, isError: code !== 0, input: { command }, structuredContent: { exit_code: code } });
const batch = (id: string, commands: unknown[], results: unknown[], isError = false) => ({
	toolName: mcp, toolCallId: id, input: { commands }, isError,
	structuredContent: { isError: false, structuredContent: { concurrency: 2, results } },
});

for (const body of ["# Zero steps\n", markdown]) {
	scenario(`H1 approval turn does not settle ${body.startsWith("# Zero") ? "zero" : "two"} todos`, async h => {
		h.write(body);
		await h.approve();
		assert.deepEqual(h.calls.slice(-4).map(call => call.kind === "entry" ? call.value.customType : call.kind), ["plan-mode-execute", "plan-mode", "tools", "status"]);
		assert.equal(await h.before(), undefined);
		await h.settled();
		assert.equal(h.phase().mode.mode, "executing");
		assert.equal(h.read("follow-up").length, 0);
		await tick(0);
		assert.equal(h.read("follow-up").length, 1);
		await h.turn("[DONE:1] [DONE:2]");
		assert.equal(await h.before(), undefined);
		await h.settled();
		assert.equal(h.phase().mode.mode, "off");
		assert.equal(h.status(), undefined);
		assert.equal(h.read("notify").length, 2); // Mode enabled, then saved plan selected.
	});
}

scenario("H1 handoff timer is canceled when toggled off before dispatch", async h => {
	await h.approve();
	await h.command();
	await tick(0);
	assert.equal(h.read("follow-up").length, 0);
	assert.equal(h.phase().mode.mode, "off");
});

for (const failingType of ["plan-mode-execute", "plan-mode"]) {
	scenario(`H1 approval rollback if ${failingType} cannot be written`, async h => {
		await h.command(plan);
		const tools = h.activeTools();
		h.hooks.append = (type, data) => {
			if (type === failingType && (type === "plan-mode-execute" || data.mode.mode === "executing")) throw Error(canary);
		};
		await h.review();
		await tick(0);
		assert.deepEqual(h.activeTools(), tools);
		assert.equal(h.phase().mode.mode, "planning");
		assert.equal(h.read("follow-up").length, 0);
		assert.match(h.read("notify").at(-1).message, /Plan review failed safely/);
		assert.doesNotMatch(JSON.stringify(h.read("notify")), new RegExp(canary));
	});
}

scenario("H1 headless toggling persists without requiring an initialized TUI theme", async h => {
	h.ctx.hasUI = false;
	h.ctx.mode = "json";
	Object.defineProperty(h.ctx.ui, "theme", { get() { throw Error("Theme not initialized"); } });
	await h.command();
	assert.equal(h.phase().mode.mode, "planning");
	await h.emit("session_start");
	assert.equal(h.status(), "⏸ plan");
});

for (const drift of ["bytes", "stay", "symlink", "deleted", "stale", "invalid-utf8"]) {
	scenario(`H2 RPC review rechecks only Execute (${drift})`, async (h, root) => {
		h.write(markdown + checks);
		if (drift === "invalid-utf8") writeFileSync(join(h.cwd, plan), Buffer.concat([Buffer.from(markdown + checks), Buffer.from([0xfe])]));
		await h.command(plan);
		h.hooks.select = async (_title, choices) => {
			if (drift === "bytes" || drift === "stay") h.write(markdown);
			if (drift === "stale") await h.fork("off", []);
			if (drift === "deleted" || drift === "symlink") unlinkSync(join(h.cwd, plan));
			if (drift === "symlink") {
				const outside = join(root, "identical.md");
				writeFileSync(outside, markdown + checks);
				symlinkSync(outside, join(h.cwd, plan));
			}
			if (drift === "invalid-utf8") writeFileSync(join(h.cwd, plan), Buffer.concat([Buffer.from(markdown + checks), Buffer.from([0xff])]));
			return choices[drift === "stay" ? 1 : 0];
		};
		await h.emit("agent_end", { messages: [] });
		assert.equal(h.read("custom").length, 0);
		assert.equal(h.read("select").at(-1)?.title, `Plan mode - choose next action after reviewing ${plan} (2 steps, 2 checks)`);
		assert.equal(h.read("entry").filter(entry => entry.customType === "plan-mode-execute").length, 0);
		const notices = JSON.stringify(h.read("notify"));
		assert.doesNotMatch(notices, /UI unavailable/);
		assert.equal(notices.includes("Plan changed during review"), !["stay", "stale"].includes(drift));
	});
}

scenario("H2 TUI preview uses the original saved markdown and contract counts", async h => {
	initTheme("dark");
	h.ctx.mode = "tui";
	h.write(markdown + checks);
	await h.command(plan);
	let preview = "";
	h.hooks.custom = async factory => {
		h.write("# Replacement");
		let choice: string | undefined;
		const component = factory(undefined, { fg: (_: string, text: string) => text, bold: (text: string) => text }, undefined, (value: string) => { choice = value; });
		preview = component.render(80).join("\n");
		component.handleInput("s");
		return choice;
	};
	await h.emit("agent_end", { messages: [] });
	assert.match(preview, /Plan Mode Review \(2 steps · 2 checks\)/);
	assert.match(preview, /Implement it/);
	assert.doesNotMatch(preview, /Replacement/);
	assert.equal(h.read("select").length, 0);
	assert.equal(h.phase().mode.mode, "planning");
	assert.ok(!h.read("notify").some(n => n.message.includes("changed during review")));
});

for (const broken of ["malformed", "101", "unreadable"]) {
	scenario(`H2 saved-plan load fails closed (${broken})`, async h => {
		await h.command(plan);
		if (broken === "unreadable") unlinkSync(join(h.cwd, plan));
		else h.write(markdown + "## Verification\n```sh\n" + (broken === "101" ? Array.from({ length: 101 }, (_, i) => `pnpm test x${i}`).join("\n") + "\n```\n" : "pnpm test"));
		await h.review();
		assert.equal(h.read("select").length, 0);
		assert.equal(h.phase().artifact.pendingReviewPath, undefined);
		assert.deepEqual(h.phase().execution.todos, []);
		assert.match(h.read("notify").at(-1).message, /Plan review failed safely/);
	});
}

scenario("H2 wizard rejects byte-identical symlink drift; Refine rejects branch drift", async (h, root) => {
	h.write(markdown + queue);
	await h.command(plan);
	h.hooks.select = async () => {
		const target = join(root, "identical.md");
		writeFileSync(target, markdown + queue);
		unlinkSync(join(h.cwd, plan));
		symlinkSync(target, join(h.cwd, plan));
		return "1. A: Markdown";
	};
	await h.emit("agent_end", { messages: [] });
	assert.match(h.read("notify").at(-1).message, /Draft answers discarded/);
	unlinkSync(join(h.cwd, plan));
	h.write(markdown);
	await h.command(plan);
	h.hooks.editor = async () => { await h.fork("off", []); return "stale refinement"; };
	await h.review("Refine");
	assert.equal(h.read("editor").length, 1);
	assert.equal(h.read("follow-up").length, 0);
});

scenario("H2/H6 candidate cancel preserves approved progress and same-plan debt, different approval clears it", async h => {
	await h.approve();
	await h.edit();
	await h.turn("[DONE:1]");
	await h.command(other);
	assert.equal(h.phase().artifact.currentPlanPath, plan);
	assert.equal(h.phase().artifact.pendingReviewPath, other);
	await h.review("Cancel");
	assert.equal(h.phase().execution.todos[0].completed, true);
	assert.equal(h.phase().executionEvidence.sourceEditRevision, 1);
	await h.approve();
	assert.equal(h.phase().executionEvidence.unverifiedDebt, true);
	assert.match(h.status(), /verify/);
	await h.approve(other);
	assert.equal(h.phase().artifact.currentPlanPath, other);
	assert.equal(h.phase().executionEvidence.unverifiedDebt, undefined);
	assert.equal(h.phase().execution.todos.length, 1);
	await h.emit("session_shutdown");
});

for (const kind of ["clean", "late Esc", "direct Esc", "missing aborted", "write failure", "first host error", "same-turn error→Esc"]) {
	scenario(`H3 settlement ${kind}`, async h => {
		h.flags.set("dd-context-debug", true);
		await h.approve();
		await tick(0);
		if (!kind.includes("error")) await h.turn("[DONE:1] [DONE:2]");
		const count = h.read("entry").length;
		if (kind !== "direct Esc") assert.equal(await h.before(boundary(kind.includes("error") ? "error" : "completed")), undefined);
		assert.equal(h.phase().mode.mode, "executing");
		assert.equal(h.read("entry").length, count);
		if (kind === "write failure") h.hooks.append = (_type, data) => { if (data.mode?.mode === "off") throw Error(canary); };
		await h.settled(kind === "missing aborted" ? {} : { aborted: ["late Esc", "direct Esc", "same-turn error→Esc"].includes(kind) });
		const clean = kind === "clean";
		assert.equal(h.read("entry").length, count + Number(clean));
		assert.equal(h.phase().mode.mode, clean ? "off" : "executing");
		assert.equal(h.metrics().filter(row => row.event === "plan-mode:execution-complete").length, Number(clean));
		if (kind.includes("Esc") || kind === "first host error") assert.match(h.status(), /paused/);
		if (kind === "write failure") assert.match(h.read("notify").at(-1).message, /execution remains active/);
	});
}

scenario("H3 continuation keeps prior drafts, stops on no progress, refreshes on user reply and exhausts budget", async h => {
	h.write(markdown + checks);
	await h.approve();
	await tick(0);
	await h.start();
	await h.turn();
	const prior = { type: "custom", customType: "prior-extension", data: {} };
	const event = { ...boundary(), entries: [prior] };
	const draft = await h.before(event);
	assert.equal(draft.continue, true);
	assert.deepEqual(draft.entries[0], prior);
	assert.equal(event.context.canContinue, false);
	assert.equal(event.entries.length, 1);
	assert.equal(draft.entries[1].display, false);
	assert.equal(draft.entries[1].details.attemptId, h.phase().executionEvidence.attemptId);
	assert.ok(draft.entries[1].details.runId > 0);
	assert.match(draft.entries[1].content, /Verification #1, Verification #2/);
	assert.equal(await h.before(), undefined);
	assert.match(h.read("notify").at(-1).message, /no progress/);
	assert.match(h.status(), /paused/);
	await h.start();
	for (let attempt = 1; attempt <= 3; attempt++) {
		await h.edit();
		await h.turn();
		assert.match((await h.before()).entries[0].content, new RegExp(`${attempt}/3`));
	}
	await h.edit();
	assert.equal(await h.before(), undefined);
	assert.match(h.status(), /paused/);
	assert.match(h.read("notify").at(-1).message, /limit 3\/3 reached/);
});

const modes = [[false, "print"], [false, "json"], [false, undefined], [true, "tui"], [true, "rpc"]] as const;
for (const [hasUI, mode] of modes) {
	scenario(`H4 delivery channels ${hasUI}/${mode}`, async h => {
		const emits = !hasUI && mode !== "print";
		await h.approve();
		h.ctx.hasUI = hasUI;
		h.ctx.mode = mode;
		await tick(0);
		const executing = structuredClone(h.active());
		for (const signal of ["BLOCKED", "REPLAN"] as const) {
			for (const aborted of [false, true]) {
				await h.fork("execution", structuredClone(executing), "session_start");
				await h.start();
				await h.turn(`[${signal}: user text]`);
				const sent = h.read("send").length;
				const notices = h.read("notify").length;
				const event = boundary();
				assert.equal(await h.before(event), undefined);
				assert.equal(event.context.canContinue, false);
				assert.equal(h.read("send").length, sent);
				assert.equal(h.read("notify").length, notices + Number(hasUI));
				await h.settled({ aborted });
				const shouldSend = emits && (signal === "REPLAN" || !aborted);
				assert.equal(h.read("send").length, sent + Number(shouldSend));
				if (shouldSend) assert.deepEqual(h.read("send").at(-1), {
					message: { customType: "plan-mode-execution-status", content: h.read("send").at(-1).message.content, display: true }, options: { triggerTurn: false },
				});
				await h.settled({ aborted });
				assert.equal(h.read("send").length, sent + Number(shouldSend));
			}
		}
		for (const reason of ["no progress", "limit 3/3 reached", "failed twice consecutively"]) {
			await h.fork("execution", structuredClone(executing), "session_start");
			await h.start();
			await h.turn();
			if (reason === "failed twice consecutively") {
				await h.tool(bash("fail-1", "pnpm test", 1));
				await h.tool(bash("fail-2", "pnpm test", 1));
			} else {
				const budget = reason === "no progress" ? 1 : 3;
				for (let n = 0; n < budget; n++) {
					await h.edit();
					assert.equal((await h.before()).continue, true);
				}
				if (budget === 3) await h.edit();
			}
			const sent = h.read("send").length;
			const notices = h.read("notify").length;
			assert.equal(await h.before(), undefined);
			assert.equal(h.read("send").length, sent);
			await h.settled({ aborted: reason === "failed twice consecutively" });
			assert.equal(h.read("send").length, sent + Number(emits));
			assert.equal(h.read("notify").length, notices + Number(hasUI));
			if (emits) assert.ok(h.read("send").at(-1).message.content.includes(reason));
			if (hasUI) assert.ok(h.read("notify").at(-1).message.includes(reason));
		}
		const saved = structuredClone(executing.at(-1));
		delete saved.data.executionEvidence;
		const sent = h.read("send").length;
		const notices = h.read("notify").length;
		await h.fork("legacy", [saved], "session_start");
		assert.equal(h.phase().executionEvidence.attemptId, "recovery");
		if (emits || hasUI) assert.deepEqual(h.calls.slice(-2).map(call => call.kind), ["entry", emits ? "send" : "notify"]);
		await h.fork("corrupt", [executing.at(-1)]);
		assert.equal(h.phase().executionEvidence.attemptId, "recovery");
		const treeEntries = h.read("entry").length;
		await h.fork("execution", executing);
		assert.equal(h.read("entry").length, treeEntries);
		assert.equal(h.read("send").length, sent + Number(emits) * 3);
		assert.equal(h.read("notify").length, notices + Number(hasUI) * 3);
		await h.command(plan);
		h.write(markdown + queue);
		const pending = h.read("send").length;
		await h.review("Cancel");
		assert.equal(h.read("send").length, pending + Number(emits));
		if (emits) assert.equal(h.read("send").at(-1).message.customType, "plan-decisions-pending");
		if (mode === "print" || hasUI) assert.deepEqual(h.read("send"), []);
	});
}

for (const stale of ["session_tree", "session_shutdown", "dd:plan"]) {
	scenario(`H4 ${stale} discards pending non-UI stop`, async h => {
		await h.approve();
		await tick(0);
		h.ctx.hasUI = false;
		h.ctx.mode = "json";
		await h.turn("[BLOCKED]");
		assert.equal(await h.before(), undefined);
		if (stale === "session_tree") await h.fork("off", []);
		else if (stale === "dd:plan") await h.command("Revise architecture");
		else await h.emit(stale);
		await h.settled();
		assert.deepEqual(h.read("send"), []);
	});
}

scenario("H5 turn hooks ignore aborted/error messages and reset staged state on a new turn", async h => {
	const evidence = { current: undefined as InstanceType<typeof ExecutionEvidenceController> | undefined };
	const project = ExecutionEvidenceController.prototype.projectUxSummary;
	ExecutionEvidenceController.prototype.projectUxSummary = function (...args) { evidence.current = this; return project.apply(this, args); };
	try {
		await h.approve();
		await tick(0);
		const initial = h.read("entry").length;
		for (const reason of ["aborted", "error"]) await h.turn("[DONE:1] [REPLAN: boom]", reason);
		assert.equal(h.read("entry").length, initial);
		assert.equal(h.phase().executionEvidence.hasObservedExecutionTurn, false);
		assert.equal(h.phase().execution.todos[0].completed, false);
		await h.before(boundary("error"));
		await h.settled({ aborted: true });
		assert.equal(evidence.current?.pauseState, "error");
		await h.emit("turn_start");
		await h.settled({ aborted: true });
		assert.equal(evidence.current?.pauseState, "aborted");
		h.ctx.hasUI = false;
		await h.turn("[BLOCKED]");
		await h.before();
		assert.ok(evidence.current?.pendingNonUiStatusNotice);
		await h.emit("turn_start");
		await h.settled();
		assert.equal(h.read("send").length, 0);
		const run = evidence.current?.activeRunId;
		const trigger = { type: "before_agent_start", messageType: "custom" } as never;
		assert.equal((await h.start(trigger)).customType, "plan-execution-context");
		assert.ok(evidence.current!.activeRunId > run!);
		assert.equal(evidence.current?.pauseState, undefined);
		assert.equal(h.status(), "📋 0/2");
		await h.turn("[DONE:1] [DONE:2]");
		await h.before();
		assert.ok(evidence.current?.pendingCompletion);
		await h.emit("turn_start");
		await h.settled();
		assert.equal(h.phase().mode.mode, "executing");
		await h.command("Revise architecture");
		assert.equal((await h.start(trigger)).customType, "plan-mode-context");
	} finally { ExecutionEvidenceController.prototype.projectUxSummary = project; }
});

scenario("H6 context binds executing prompts to attempts and continuations to runs", async h => {
	const msg = (customType: string, details?: unknown) => ({ role: "custom", customType, details });
	const planCtx = msg("plan-mode-context");
	const notice = msg("plan-mode-execution-status");
	const oldPlanCtx = { role: "user", content: [{ type: "text", text: "[PLAN MODE ACTIVE]" }] };
	const untagged = msg("plan-execution-context");
	const unrelated = [msg("plan-decisions-pending"), msg("impact-check-context"), { role: "user", content: "User" }, assistant("Answer"), { role: "toolResult" }];
	const filter = async (inputs: unknown[]) => (await h.emit("context", { messages: inputs })).messages;
	const always = [planCtx, oldPlanCtx, notice, untagged, ...unrelated];
	assert.deepEqual(await filter(always), unrelated);
	await h.command(plan);
	assert.deepEqual(await filter(always), [planCtx, oldPlanCtx, ...unrelated]);
	let reviewing: unknown;
	h.hooks.select = async (_title, choices) => { reviewing = await filter(always); return choices[0]; };
	await h.emit("agent_end", { messages: [] });
	assert.deepEqual(reviewing, [planCtx, oldPlanCtx, ...unrelated]);
	await tick(0);
	const attemptOne = await h.start();
	await h.turn();
	const runOne = (await h.before()).entries[0];
	await h.settled({ aborted: true });
	await h.start();
	await h.turn();
	const runTwo = (await h.before()).entries[0];
	assert.equal(runOne.details.attemptId, runTwo.details.attemptId);
	assert.notEqual(runOne.details.runId, runTwo.details.runId);
	const wronglyTyped = { ...runTwo, details: { ...runTwo.details, runId: String(runTwo.details.runId) } };
	assert.deepEqual(await filter([...always, attemptOne, runOne, runTwo, wronglyTyped]), [...unrelated, attemptOne, runTwo]);
	await h.approve(other);
	const attemptTwo = await h.start();
	assert.notEqual(attemptTwo.details.attemptId, attemptOne.details.attemptId);
	assert.deepEqual(await filter([...always, attemptOne, attemptTwo, runOne, runTwo]), [...unrelated, attemptTwo]);
	await h.shortcut();
	assert.deepEqual(await filter([...always, attemptTwo]), unrelated);
});

for (const action of ["signal", "failure", "request", "active path", "toggle-off", "toggle-on", "shutdown", "restore"]) {
	scenario(`H6/H7 ${action} restricts tools before awaiting revoke`, async h => {
		const original = ChildManager.prototype.revokeAll;
		if (action !== "toggle-on") {
			await h.approve();
			assert.ok(!h.activeTools().includes("questionnaire"));
			if (!["shutdown", "toggle-off", "restore"].includes(action)) {
				await h.edit();
				await h.turn(action === "signal" ? "[DONE:1] [REPLAN]" : "[DONE:1]");
				if (action === "failure") { await h.tool(bash("one", "pnpm test", 1)); await h.tool(bash("two", "pnpm test", 1)); }
			}
		}
		const entries = h.read("entry").length;
		let reject!: (error: Error) => void;
		let revoked = 0;
		ChildManager.prototype.revokeAll = () => { revoked++; return new Promise<void>((_, fail) => { reject = fail; }); };
		try {
			const transition = action === "shutdown" ? h.emit("session_shutdown")
				: action === "restore" ? h.emit("session_tree")
				: action === "toggle-off" || action === "toggle-on" ? h.command()
				: action === "active path" ? h.command(plan)
				: action === "request" ? h.command("Revise architecture") : h.before();
			assert.equal(revoked, 1);
			assert.ok(h.activeTools().includes("questionnaire"));
			let resolved = false;
			void transition.then(() => { resolved = true; });
			await tick(0);
			assert.equal(resolved, false);
			assert.equal(h.read("follow-up").length, 0);
			reject(Error(`child failed /abs/${canary}`));
			await transition;
			assert.ok(h.activeTools().includes("questionnaire"));
			assert.doesNotMatch(JSON.stringify(h.read("notify")), new RegExp(canary));
			assert.ok(h.read("notify").some(n => n.message.includes("Could not revoke")));
			if (action === "shutdown" || action === "restore") assert.equal(h.read("entry").length, entries);
			if (["signal", "failure", "request", "active path"].includes(action)) {
				assert.equal(h.phase().mode.mode, "planning");
				assert.equal(h.phase().execution.todos[0].completed, true);
				assert.equal(h.phase().executionEvidence.sourceEditRevision, 1);
				assert.match((await h.start()).content, /RE-PLAN \/ RECOVERY CONTEXT/);
			}
		} finally { ChildManager.prototype.revokeAll = original; }
	});
}

scenario("H7 branch A/B/C isolation, reset freshness, preserve failures, and ignore journal tools", async h => {
	h.write(markdown + checks);
	await h.approve();
	await h.edit();
	await h.tool(bash("pass"));
	const a = structuredClone(h.active());
	await h.tool(bash("failure", "pnpm test", 1));
	const c = structuredClone(h.active());
	const entries = h.read("entry").length;
	await h.fork("B", []);
	assert.equal(h.status(), undefined);
	assert.equal(h.read("entry").length, entries);
	await h.fork("A", a);
	assert.match(h.status(), /V0\/2 · verify/);
	assert.match(h.read("notify").at(-1).message, /prior passes/);
	await h.turn();
	assert.deepEqual(h.phase().executionEvidence.passedRequiredRevisions, {});
	assert.equal(h.phase().executionEvidence.lastCheck, undefined);
	assert.equal(h.phase().executionEvidence.substantivePassedRevision, undefined);
	await h.fork("C", c);
	await h.turn();
	assert.equal(h.phase().executionEvidence.lastCheck.outcome, "failed");
	const spoof = structuredClone(c.at(-1));
	spoof.data.mode = { mode: "planning", activeTools: ["unapproved_tool"] };
	spoof.data.gates = { pendingImpactItems: [{ path: "legacy.ts" }] };
	await h.fork("spoof", [spoof]);
	assert.ok(h.activeTools().includes("questionnaire"));
	assert.ok(!h.activeTools().includes("unapproved_tool"));
	assert.ok(!h.active().some(e => e.customType === "impact-mcp-migrated"));
	await h.emit("session_start");
	assert.equal(h.active().filter(e => e.customType === "impact-mcp-migrated").length, 1);
	await h.emit("session_tree");
	assert.equal(h.active().filter(e => e.customType === "impact-mcp-migrated").length, 1);
	h.flags.set("dd-plan", true);
	const before = h.read("entry").length;
	await h.fork("override", structuredClone(c), "session_start");
	assert.match(h.status(), /⏸ plan/);
	assert.equal(h.read("entry").length, before);
	assert.match((await h.start()).content, /PLAN MODE ACTIVE/);
});

scenario("H7 legacy recovery is persisted once, replays only after marker and carries debt", async h => {
	await h.approve();
	const saved = structuredClone(h.active().at(-1));
	delete saved.data.executionEvidence;
	const message = (text: string) => ({ type: "message", message: assistant(text) });
	const entries = [message("[DONE:2]"), journal("plan-mode-execute", {}), message("[DONE:1]"), saved];
	await h.fork("legacy", entries, "session_start");
	assert.deepEqual(h.calls.slice(-2).map(call => call.kind), ["entry", "notify"]);
	assert.equal(h.phase().executionEvidence.attemptId, "recovery");
	assert.equal(h.phase().executionEvidence.editRevision, 0);
	assert.equal(h.phase().executionEvidence.unverifiedDebt, true);
	assert.deepEqual(h.phase().execution.todos.map((todo: any) => todo.completed), [true, false]);
	const count = entries.length;
	await h.emit("session_start");
	assert.equal(entries.length, count);
	await h.approve();
	assert.equal(h.phase().executionEvidence.unverifiedDebt, true);
	await h.approve(other);
	assert.equal(h.phase().executionEvidence.unverifiedDebt, undefined);
	await h.emit("session_shutdown");
});

scenario("H7 malformed executing branch matrix and archive fallback", async (h, root) => {
	await h.approve();
	const validEmpty = structuredClone(h.active());
	await h.fork("valid-empty", validEmpty);
	assert.match(h.status(), /^accent:/);
	const emptyHashBad = structuredClone(validEmpty);
	emptyHashBad.at(-1).data.executionEvidence.contractHash = "a".repeat(64);
	await h.fork("nonempty-hash", emptyHashBad);
	assert.equal(h.phase().executionEvidence.attemptId, "recovery");
	h.write(markdown + checks);
	await h.approve();
	const valid = structuredClone(h.active());
	const markerIndex = valid.map(e => e.customType).lastIndexOf("plan-mode-execute");
	const patches: Record<string, (entries: any[], data: any) => void> = {
		traversal: (_, saved) => { saved.artifact.currentPlanPath = "docs/plan/../../outside/README.md"; },
		"invalid pending": (_, saved) => { saved.artifact.pendingReviewPath = "docs/plan/../../outside/README.md"; },
		"recovery forgery": (_, saved) => { saved.executionEvidence.attemptId = "recovery"; },
		"missing marker": entries => { entries.splice(markerIndex, 1); },
		"marker path mismatch": entries => { entries[markerIndex].data.planPath = other; },
		"artifact path mismatch": (_, saved) => { saved.artifact.currentPlanPath = other; },
		"duplicate todo": (_, saved) => { saved.execution.todos.push(saved.execution.todos[0]); },
		"negative todo": (_, saved) => { saved.execution.todos[0].step = -1; },
		"non-text todo": (_, saved) => { saved.execution.todos[0].text = null; },
	};
	for (const [name, patch] of Object.entries(patches)) {
		const entries = structuredClone(valid);
		patch(entries, entries.at(-1).data);
		await h.fork(name, entries);
		assert.equal(h.phase().mode.mode, "planning", name);
		assert.equal(h.phase().executionEvidence.attemptId, "recovery", name);
		assert.match(h.read("notify").at(-1).message, /could not be restored/, name);
	}
	const touched = structuredClone(valid);
	const touching = touched.at(-1).data.artifact;
	const outside = join(root, "outside.md");
	writeFileSync(outside, markdown + checks);
	const notes = "docs/plan/task/NOTES.md";
	const escaped = "docs/plan/task/ESCAPE.md";
	h.write("notes", notes);
	symlinkSync(outside, join(h.cwd, escaped));
	touching.touchedPlanPaths = [null, plan, notes, escaped, "docs/plan/../../outside/README.md"];
	await h.fork("touched", touched);
	assert.match(h.status(), /^accent:/);
	await h.turn();
	assert.deepEqual(h.phase().artifact.touchedPlanPaths, [plan, notes]);
	for (const mode of ["off", "planning", "reviewing"]) {
		const entries = structuredClone(valid);
		entries.at(-1).data.mode.mode = mode;
		entries.at(-1).data.executionEvidence.requiredCheckCount = 101;
		entries.at(-1).data.artifact.pendingReviewPath = plan;
		const count = h.read("entry").length;
		await h.fork(mode, entries);
		assert.equal(h.read("entry").length, count);
		assert.equal(h.status(), mode === "off" ? undefined : "warning:⏸ plan");
		if (mode === "reviewing") {
			const selected = h.read("select").length;
			await h.review("Cancel");
			assert.equal(h.read("select").length, selected);
			await h.start();
			assert.equal(h.phase().artifact.pendingReviewPath, undefined);
			assert.equal(h.phase().executionEvidence, undefined);
		}
	}
	unlinkSync(join(h.cwd, plan));
	const archive = "docs/archive/plan/task/README.md";
	for (const kind of ["missing", "symlink", "wrong-hash", "valid"]) {
		if (kind === "symlink") {
			mkdirSync(dirname(join(h.cwd, archive)), { recursive: true });
			symlinkSync(outside, join(h.cwd, archive));
		} else if (kind === "wrong-hash") {
			unlinkSync(join(h.cwd, archive));
			h.write(markdown + checks.replace("pnpm test", "pnpm lint"), archive);
		} else if (kind === "valid") h.write(markdown + checks, archive);
		await h.fork(`archive-${kind}`, structuredClone(valid));
		if (kind === "valid") assert.match(h.status(), /^accent:/);
		else assert.equal(h.phase().executionEvidence.attemptId, "recovery");
	}
});

scenario("H7/H9 impact state does not block completion or count as verification", async h => {
	await h.approve();
	await tick(0);
	await h.edit();
	const impact = new ImpactState(h.cwd, h.ctx.sessionManager.getSessionId());
	assert.equal(impact.status().count, 1);
	await h.tool({ toolName: "mcp__dotdotgod_context__project_impact", toolCallId: "impact-1", isError: false, input: { paths: ["src/unit.ts"] } });
	assert.match(h.status(), /verify/);
	await h.tool(bash("verify"));
	await h.turn("[DONE:1] [DONE:2]");
	await h.before();
	await h.settled();
	assert.equal(h.phase().mode.mode, "off");
	assert.equal(impact.status().count, 1);
	for (const kind of ["status", "widget"]) {
		const updates = h.read(kind).filter(v => v.key === "impact-check");
		assert.ok(updates.length);
		assert.ok(updates.every(v => v.value === undefined));
	}
});

const metricFields: Record<string, string[]> = {
	"plan-mode:execution-continue": ["attempt", "maxAttempts", "reasons", "editRevision", "requiredCheckCount", "passedRequiredCheckCount"],
	"plan-mode:execution-pause": ["reason", "editRevision", "continuationCount", "requiredCheckCount", "passedRequiredCheckCount"],
	"plan-mode:execution-replan": ["trigger", "editRevision", "requiredCheckCount", "passedRequiredCheckCount"],
	"plan-mode:execution-complete": ["editRevision", "editedFileCount", "editedFileCountCapped", "requiredCheckCount", "todoCount", "continuationCount"],
};

for (const hasUI of [true, false]) {
	scenario(`H8 canary across extension-authored surfaces in ${hasUI ? "UI (getFlag)" : "JSON (argv fallback)"}`, async (h, root) => {
		assert.equal(h.registeredFlags.has("dd-context-debug"), false);
		assert.equal(h.registeredFlags.has("dd-context-debug-output"), false);
		const argv = process.argv;
		const metricsPath = join(root, "metrics.jsonl");
		const ignoredPath = join(root, "ignored.jsonl");
		const projections: unknown[] = [];
		const continuations: unknown[] = [];
		const project = ExecutionEvidenceController.prototype.projectUxSummary;
		const originalRevoke = ChildManager.prototype.revokeAll;
		ExecutionEvidenceController.prototype.projectUxSummary = function (...args) { const summary = project.apply(this, args); projections.push(summary); return summary; };
		const rawError = new Error(`raw error /abs/${canary}`);
		try {
			if (hasUI) {
				h.flags.set("dd-context-debug", true);
				process.argv = [...argv.slice(0, 2), "--dd-context-debug=false", `--dd-context-debug-output=${ignoredPath}`];
			} else {
				h.flags.delete("dd-context-debug-output");
				process.argv = [...argv.slice(0, 2),
					"--dd-context-debug=false", "--dd-context-debug", "true",
					`--dd-context-debug-output=${ignoredPath}`, "--dd-context-debug-output", metricsPath,
					"--", "--dd-context-debug=false", `--dd-context-debug-output=${ignoredPath}`,
				];
			}
			h.write(markdown + checks);
			await h.approve();
			await tick(0);
			h.ctx.hasUI = hasUI;
			h.ctx.mode = hasUI ? "tui" : "json";
			await h.start();
			await h.edit();
			await h.tool({ ...bash("hostile-bash", `pnpm test ${canary}`, 1), content: [{ type: "text", text: `stdout:${canary} stderr:${canary}` }] });
			await h.tool(batch("hostile-mcp", [{ command: "pnpm test", env: { API_TOKEN: canary } }], [{ ...failed, stdout: canary, stderr: canary }]));
			await h.turn();
			continuations.push((await h.before()).entries.at(-1));
			await h.turn(`[BLOCKED: ${canary}]`);
			await h.before();
			await h.settled();
			await h.start();
			ChildManager.prototype.revokeAll = async () => { throw rawError; };
			await h.turn(`[REPLAN: ${canary}]`);
			await h.before();
			await h.settled({ aborted: true });
			await h.start();
			await h.shortcut(); // setPlanModeEnabled also sees a rejecting revoke.
			ChildManager.prototype.revokeAll = originalRevoke;

			// The 3 interactive errors run under an actual TUI fixture; JSON stays non-interactive.
			if (hasUI) {
				await h.command(plan);
				h.hooks.custom = async () => { throw rawError; };
				const notices = h.read("notify").length;
				await h.review("Cancel");
				assert.match(h.read("notify")[notices].message, /Plan review UI unavailable/);
				h.write(markdown + queue);
				await h.command(plan);
				await h.review("Cancel");
				assert.ok(h.read("notify").some(n => n.message.includes("Decision wizard unavailable")));
				h.write(markdown);
				await h.command(plan);
				h.hooks.select = async () => { throw rawError; };
				await h.emit("agent_end", { messages: [] });
				assert.match(h.read("notify").at(-1).message, /Plan review failed safely/);
				await h.command(plan);
				h.write(markdown + `## Verification\n- \`pnpm test | ${canary}\`\n`);
				await h.review("Execute");
				assert.match(h.read("notify").at(-1).message, /malformed Verification/);
			}
			await h.command(plan);
			const path = `docs/plan/../../${canary}/README.md`;
			assert.deepEqual(loadReviewSnapshot(h.cwd, path), { ok: false, reason: "invalid_path" });
			assert.match(describePendingPlanDecisions(h.cwd, path), /Cannot read the saved plan/);
			assert.doesNotMatch(describePendingPlanDecisions(h.cwd, path), new RegExp(canary));
			const saved = structuredClone(h.phase());
			saved.artifact.pendingReviewPath = path;
			await h.fork("invalid", [journal("plan-mode", saved)]);
			const sent = h.read("send").length;
			await h.emit("agent_end", { messages: [] });
			assert.equal(h.read("send").length, sent);

			h.ctx.mode = "rpc";
			h.ctx.hasUI = true;
			await h.approve(other);
			await tick(0);
			h.ctx.mode = hasUI ? "tui" : "json";
			h.ctx.hasUI = hasUI;
			await h.start();
			await h.turn("[DONE:1]");
			await h.before();
			await h.settled();
			assert.equal(h.phase().mode.mode, "off");

			const metrics = h.metrics().filter(row => Object.hasOwn(metricFields, row.event));
			for (const [event, keys] of Object.entries(metricFields)) {
				const rows = metrics.filter(row => row.event === event);
				assert.ok(rows.length, event);
				for (const row of rows) {
					assert.deepEqual(Object.keys(row).sort(), [...keys, "event", "timestamp", "cwd", "usage", "git"].sort());
					assert.equal(row.cwd, h.cwd);
					assert.equal(row.usage, null);
				}
			}
			const entries = h.read("entry").filter(e => ["plan-mode", "plan-mode-execute"].includes(e.customType));
			assert.ok(entries.some(e => e.customType === "plan-mode-execute"));
			assert.ok(entries.some(e => e.customType === "plan-mode"));
			assert.ok(h.read("prompt").some(e => e.customType === "plan-mode-context"));
			assert.ok(h.read("prompt").some(e => e.customType === "plan-execution-context"));
			const surfaces = [entries, projections, continuations, h.read("prompt"), metrics];
			if (hasUI) surfaces.push(h.read("notify"), h.read("status"));
			else surfaces.push(h.read("send").filter(e => e.message.customType === "plan-mode-execution-status"));
			for (const surface of surfaces) {
				assert.ok(surface.length >= 1);
				assert.doesNotMatch(JSON.stringify(surface), new RegExp(canary));
			}
		} finally {
			process.argv = argv;
			ExecutionEvidenceController.prototype.projectUxSummary = project;
			ChildManager.prototype.revokeAll = originalRevoke;
		}
	});
}

scenario("H9 tool receipts are consume-once, generation-bound, and only child receipts count", async h => {
	h.flags.set("dd-context-debug", true);
	h.write(markdown + checks);
	await h.approve();
	await tick(0);
	const count = h.read("entry").length;
	await h.edit("src/failed.ts", true);
	assert.equal(h.read("entry").length, count);
	assert.equal(new ImpactState(h.cwd, h.ctx.sessionManager.getSessionId()).status().count, 0);
	await h.turn();
	const beforeEdit = h.read("entry").length;
	await h.edit();
	assert.equal(h.read("entry").length, beforeEdit + 1);
	assert.equal(h.phase().executionEvidence.editRevision, 1);
	assert.equal((await h.before()).entries[0].customType, "plan-execution-continue");

	const failing = bash("fail", "pnpm test", 1);
	await h.emit("tool_result", failing); // Never started.
	assert.equal(h.phase().executionEvidence.lastCheck, undefined);
	await h.emit("tool_execution_start", failing);
	await h.emit("tool_result", failing);
	assert.equal(h.phase().executionEvidence.lastCheck.consecutiveFailures, 1);
	const afterFailure = h.read("entry").length;
	await h.emit("tool_result", failing); // Duplicate before end.
	await h.emit("tool_execution_end", failing);
	assert.equal(h.read("entry").length, afterFailure);
	const canceled = bash("end-before-result");
	await h.emit("tool_execution_start", canceled);
	await h.emit("tool_execution_end", canceled);
	await h.emit("tool_result", canceled);
	assert.equal(h.read("entry").length, afterFailure);

	const commands = [{ command: "pnpm test" }, { command: "git status --short" }];
	await h.tool(batch("mixed", commands, [failed, passed]));
	assert.deepEqual(h.phase().executionEvidence.passedRequiredRevisions, { V2: 1 });
	assert.equal(h.phase().executionEvidence.lastCheck.outcome, "failed");
	assert.equal(h.phase().executionEvidence.lastCheck.consecutiveFailures, 1);
	await h.tool(batch("transport", [commands[0]], [failed], true));
	assert.equal(h.phase().executionEvidence.lastCheck.outcome, "unconfirmed");
	assert.equal(h.phase().executionEvidence.lastCheck.consecutiveFailures, 0);
	await h.edit();
	const beforeIgnored = h.read("entry").length;
	await h.tool({ ...batch("cm-1", commands, [passed, passed]), toolName: "codemode" });
	await h.emit("user_bash", { command: "pnpm test", cwd: h.cwd });
	await h.tool({ ...bash("user"), toolName: "user_bash" });
	assert.equal(h.read("entry").length, beforeIgnored);
	await h.tool(batch("cm-1/0", commands, [passed, passed]));
	assert.deepEqual(h.phase().executionEvidence.passedRequiredRevisions, { V1: 2, V2: 2 });
	assert.equal(h.phase().executionEvidence.substantivePassedRevision, 2);
	await h.turn("[DONE:1] [DONE:2]");
	await h.before();
	await h.settled();
	assert.equal(h.phase().mode.mode, "off");
	assert.equal(h.status(), undefined);
	assert.ok(h.metrics().some(row => row.event === "plan-mode:execution-complete"));

	await h.approve();
	const stale = bash("stale");
	await h.emit("tool_execution_start", stale);
	await h.approve(other);
	const beforeStale = h.read("entry").length;
	await h.emit("tool_result", stale);
	assert.equal(h.read("entry").length, beforeStale);
	await h.emit("session_shutdown");
});

scenario("H9 tool end removes native admission and managed hc routing", async h => {
	const previousPath = process.env.PATH;
	const bin = join(h.cwd, "bin");
	mkdirSync(bin);
	for (const name of ["inspect", "hc"]) writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
	process.env.PATH = `${bin}:${previousPath ?? ""}`;
	try {
		await h.command();
		h.hooks.select = async () => "Allow same invocation this session";
		for (const [id, command] of [["admission", join(bin, "inspect")], ["managed", `'${join(bin, "hc")}' send foreign 'preview only'`]]) {
			const event = { toolName: "bash", toolCallId: id, input: { command } };
			assert.equal(await h.emit("tool_call", event), undefined);
			await h.emit("tool_execution_end", event);
			await assert.rejects(h.tools.get("bash")!.execute(id, event.input, new AbortController().signal, undefined, h.ctx), /missing command admission/);
		}
	} finally {
		if (previousPath === undefined) delete process.env.PATH;
		else process.env.PATH = previousPath;
	}
});

