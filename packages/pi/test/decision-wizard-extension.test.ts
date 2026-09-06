import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

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
}) => Promise<void>) {
	const cwd = mkdtempSync(join(tmpdir(), "wizard-extension-"));
	mkdirSync(join(cwd, "docs/plan/task"), { recursive: true });
	writeFileSync(join(cwd, planPath), plan);
	const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
	const messages: string[] = [];
	const entries: Array<{ customType: string; data: unknown }> = [];
	let activeTools: string[] = [];
	install({
		on: (name: string, handler: (event: never, ctx: ExtensionContext) => unknown) => handlers.set(name, handler),
		registerFlag() {}, registerTool() {}, registerCommand() {}, registerShortcut() {},
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
		ui: { theme: { fg: (_: string, text: string) => text }, notify() {}, setStatus() {}, setWidget() {}, select: async () => "Cancel" },
		sessionManager: { getEntries: () => [{ type: "custom", customType: "plan-mode", data: {
			version: 2, mode: { mode: "planning", activeTools: ["read", "write"] },
			artifact: { currentPlanPath: planPath, pendingReviewPath: planPath, suppressChoiceForInlineRequest: false, touchedPlanPaths: [] },
		} }] },
	} as unknown as ExtensionContext;
	const emit = async (name: string, event: unknown = {}) => handlers.get(name)!(event as never, ctx);
	try {
		await emit("session_start");
		await run({ ctx, emit, write: (text) => writeFileSync(join(cwd, planPath), text), messages, entries });
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
