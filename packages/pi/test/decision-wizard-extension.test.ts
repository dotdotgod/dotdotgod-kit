import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ImpactState } from "@dotdotgod/context";

// Exercise the extension through Pi's own TypeScript loader, including .js -> .ts imports.
const hostRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const jiti = hostRequire("jiti").createJiti(import.meta.url);
const install = await jiti.import(new URL("../extensions/plan-mode/index.ts", import.meta.url).pathname, { default: true }) as (api: ExtensionAPI) => void;
const planPath = "docs/plan/task/README.md";
const plan = `# Task\n## Discussion Queue\n- [ ] Q1 scope blocks-execute-review: Pick storage?\n  - Options:\n    - A: Markdown\n  - Status: open\n## Plan:\n1. Implement it\n`;

async function harness(run: (h: {
	ctx: ExtensionContext;
	emit: (name: string, event?: unknown) => Promise<unknown>;
	write: (text: string) => void;
	messages: string[];
	entries: Array<{ customType: string; data: unknown }>;
	tools: Map<string, any>;
	displays: Array<{ key: string; value: unknown }>;
}) => Promise<void>, legacyPaths: string[] = []) {
	const cwd = mkdtempSync(join(tmpdir(), "wizard-extension-"));
	mkdirSync(join(cwd, "docs/plan/task"), { recursive: true });
	writeFileSync(join(cwd, planPath), plan);
	const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
	const messages: string[] = [];
	const entries: Array<{ customType: string; data: unknown }> = [];
	let activeTools: string[] = [];
	const tools = new Map<string, any>();
	const displays: Array<{ key: string; value: unknown }> = [];
	install({
		on: (name: string, handler: (event: never, ctx: ExtensionContext) => unknown) => handlers.set(name, handler),
		registerFlag() {}, registerTool(tool: any) { tools.set(tool.name, tool); }, registerCommand() {}, registerShortcut() {},
		getFlag: () => false,
		getAllTools: () => ["read", "write", "edit", "bash"].map((name) => ({ name })),
		getActiveTools: () => activeTools,
		setActiveTools: (tools: string[]) => { activeTools = tools; },
		appendEntry: (customType: string, data: unknown) => entries.push({ customType, data }),
		sendUserMessage: (message: string, options: { deliverAs?: string }) => {
			assert.equal(options.deliverAs, "followUp");
			messages.push(message);
		},
		sendMessage() {},
	} as unknown as ExtensionAPI);
	const ctx = {
		cwd, mode: "rpc", hasUI: true,
		ui: { theme: { fg: (_: string, text: string) => text }, notify() {}, setStatus(key: string, value: unknown) { displays.push({ key, value }); }, setWidget(key: string, value: unknown) { displays.push({ key, value }); }, select: async () => "Cancel" },
		sessionManager: { getSessionId: () => "wizard-fixture", getEntries: () => [{ type: "custom", customType: "plan-mode", data: {
			version: 2, mode: { mode: "planning", activeTools: ["read", "write"] },
			artifact: { currentPlanPath: planPath, pendingReviewPath: planPath, suppressChoiceForInlineRequest: false, touchedPlanPaths: [] },
			gates: { pendingImpactItems: legacyPaths.map(path => ({ path, reason: "edit", touchedAt: "legacy" })) },
		} }, ...entries.map(entry => ({ type: "custom", ...entry }))] },
	} as unknown as ExtensionContext;
	const emit = async (name: string, event: unknown = {}) => handlers.get(name)!(event as never, ctx);
	try {
		await emit("session_start");
		await run({ ctx, emit, write: (text) => writeFileSync(join(cwd, planPath), text), messages, entries, tools, displays });
	} finally { rmSync(cwd, { recursive: true, force: true }); }
}

it("submits one answer batch, reopens new decisions, then requires separate execute approval", () => harness(async ({ ctx, emit, write, messages, entries }) => {
	const choices = ["1. A: Markdown", "Confirm answers"];
	ctx.ui.select = async (_title, options) => {
		assert.equal(messages.length, 0);
		if (options.includes("Read more")) return "Read more";
		if (options.includes("Continue")) return "Continue";
		const label = options.find((option) => option.replace(/^\d+\. /, "") === choices[0]);
		if (!label && options.includes("More actions")) return "More actions";
		choices.shift();
		return label;
	};
	await emit("agent_end", { messages: [] });
	assert.equal(messages.length, 1);
	assert.match(messages[0]!, /confirmed answers/);
	assert.ok(messages[0]!.endsWith("## Confirmed answers\n\n### Q1: Pick storage?\n- Selected option: A\n- Answer:\n  > Markdown"));
	assert.match(messages[0]!, /not execution authorization/);
	assert.ok(!entries.some((entry) => entry.customType === "plan-mode-execute"));

	write(plan.replace("Q1", "Q2"));
	await emit("tool_call", { toolName: "write", input: { path: planPath } });
	let title = "";
	ctx.ui.select = async (value) => { title = value; return "Cancel"; };
	await emit("agent_end", { messages: [] });
	assert.match(title, /Question 1\/1/);
	assert.equal(messages.length, 1);

	write(plan.replace("[ ]", "[x]").replace("Status: open", "Status: answered"));
	await emit("tool_call", { toolName: "write", input: { path: planPath } });
	ctx.ui.select = async (_title, choices) => choices[0];
	await emit("agent_end", { messages: [] });
	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(entries.filter((entry) => entry.customType === "plan-mode-execute").length, 1);
	assert.equal(messages.length, 2);
}));

it("rejects execute when the plan changes during execution review", () => harness(async ({ ctx, emit, write, entries }) => {
	write("# Task\n## Plan:\n1. Implement it");
	ctx.ui.select = async (_title, choices) => { write(plan); return choices[0]; };
	await emit("agent_end", { messages: [] });
	assert.ok(!entries.some((entry) => entry.customType === "plan-mode-execute"));
}));

it("keeps pending impact UI hidden without registering duplicate native tools", () => harness(async ({ ctx, emit, tools, displays }) => {
	await emit("tool_result", { toolName: "write", input: { path: "src/example.ts" }, isError: false });
	assert.equal(tools.size, 0);
	const state = new ImpactState(ctx.cwd, ctx.sessionManager.getSessionId());
	assert.equal(state.status().count, 1);
	assert.equal(state.status().pending[0]?.path, "src/example.ts");
	assert.ok(displays.some((entry) => entry.key === "impact-check"));
	assert.ok(displays.filter((entry) => entry.key === "impact-check").every((entry) => entry.value === undefined));
	ctx.ui.confirm = async () => false;
	const blocked = await emit("tool_call", { toolName: "bash", input: { command: "pnpm run verify" } }) as { block?: boolean };
  assert.doesNotMatch(JSON.stringify(blocked), /impact.*pending/i);
}));

it("invalidates pending answer batches on shutdown and branch changes", async () => {
	for (const event of ["session_shutdown", "session_tree"]) {
		await harness(async ({ ctx, emit, messages }) => {
			const choices = ["1. A: Markdown", "Confirm answers"];
			ctx.ui.select = async (_title, options) => {
				if (options.includes("Read more")) return "Read more";
				if (options.includes("Continue")) return "Continue";
				const label = options.find((option) => option.replace(/^\d+\. /, "") === choices[0]);
				if (!label && options.includes("More actions")) return "More actions";
				if (choices.shift() === "Confirm answers") await emit(event);
				return label;
			};
			await emit("agent_end", { messages: [] });
			assert.equal(messages.length, 0);
		});
	}
});

it("imports legacy impact once and never resurrects successfully reviewed paths on resume", () => harness(async ({ ctx, emit, entries }) => {
	const state = new ImpactState(ctx.cwd, ctx.sessionManager.getSessionId());
	assert.equal(state.status().count, 1);
	assert.equal(entries.filter(entry => entry.customType === "impact-mcp-migrated").length, 1);
	state.complete(state.snapshot());
	assert.equal(state.status().count, 0);
	await emit("session_start");
	assert.equal(state.status().count, 0);
	assert.equal(entries.filter(entry => entry.customType === "impact-mcp-migrated").length, 1);
}, ["legacy.ts"]));
