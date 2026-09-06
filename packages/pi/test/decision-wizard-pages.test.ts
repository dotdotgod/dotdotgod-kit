import assert from "node:assert/strict";
import { it } from "node:test";
import { ExtensionSelectorComponent, initTheme, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { extractDiscussionQueueItems } from "../extensions/plan-mode/plans.ts";
import { selectWizardPage } from "../extensions/plan-mode/controllers/decision-wizard-pages.ts";

it("native fallback preserves distinct truncated actions and both cancel routes", async () => {
	initTheme("dark");
	const rows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
	const columns = Object.getOwnPropertyDescriptor(process.stdout, "columns");
	try {
		Object.defineProperty(process.stdout, "rows", { configurable: true, value: 18 });
		Object.defineProperty(process.stdout, "columns", { configurable: true, value: 40 });
		const ids = [`Q${"shared".repeat(10)}A`, `Q${"shared".repeat(10)}B`];
		const items = extractDiscussionQueueItems(`## Discussion Queue\n${ids.map((id) => `- [ ] ${id} scope blocks-execute-review: Decide`).join("\n")}`);
		assert.deepEqual(items.map((item) => item.id), ids);
		const edits = items.map((item) => `Edit ${item.id}`);
		for (const [choices, target, expected] of [
			[edits, 1, edits[1]],
			[["More actions", "Cancel"], 0, "More actions"],
			[["More actions", "Cancel"], 1, "Cancel"],
			[edits, 2, undefined],
		] as const) {
			const ctx = { ui: { select: async (title: string, options: string[]) => {
				assert.equal(new Set(options).size, options.length);
				assert.match(options[0]!, /^1\. /);
				assert.match(options[1]!, /^2\. /);
				let selected: string | undefined;
				const component = new ExtensionSelectorComponent(title, options, (value) => { selected = value; }, () => {});
				assert.ok(component.render(40).length <= 18);
				for (let i = 0; i < target; i++) component.handleInput("j");
				component.handleInput("\n");
				component.dispose();
				assert.equal(selected, options[target]);
				return selected;
			}, notify() {} } } as unknown as ExtensionContext;
			assert.equal(await selectWizardPage(ctx, "Review answers", [...choices], () => true), expected);
		}
	} finally {
		if (rows) Object.defineProperty(process.stdout, "rows", rows); else Reflect.deleteProperty(process.stdout, "rows");
		if (columns) Object.defineProperty(process.stdout, "columns", columns); else Reflect.deleteProperty(process.stdout, "columns");
	}
});

it("native fallback renders bounded, complete review pages and reaches the final action", async () => {
	initTheme("dark");
	const rows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
	const columns = Object.getOwnPropertyDescriptor(process.stdout, "columns");
	try {
		for (const [width, height] of [[40, 18], [60, 22], [80, 24]]) {
			Object.defineProperty(process.stdout, "rows", { configurable: true, value: height });
			Object.defineProperty(process.stdout, "columns", { configurable: true, value: width });
			const content = Array.from({ length: 50 }, (_, i) => `Q${i}: question\nAnswer: ${"한글 answer ".repeat(8)} END${i}`).join("\n");
			const seen: string[] = [];
			let dialogs = 0;
			let completedReview = false;
			let revisitedContent = false;
			let revisitedActions = false;
			const ctx = { ui: { select: async (title: string, options: string[]) => {
				assert.ok(++dialogs < 2000);
				seen.push(title);
				let selected: string | undefined;
				const component = new ExtensionSelectorComponent(title, options, (value) => { selected = value; }, () => {});
				const rendered = component.render(width!);
				assert.ok(rendered.length <= height!, `${width}x${height}: ${rendered.length} rows`);
				assert.ok(rendered.every((line) => visibleWidth(line) <= width!));
				const confirm = options.find((option) => /^\d+\. Confirm answers$/.test(option));
				let choice = options.includes("Read more") ? "Read more" : options.includes("Continue") ? "Continue"
					: confirm ?? "More actions";
				if (!revisitedContent && options.includes("Previous page")) { choice = "Previous page"; revisitedContent = true; }
				if (!revisitedActions && options.includes("Previous actions")) { choice = "Previous actions"; revisitedActions = true; }
				if (choice === "Continue") completedReview = true;
				if (confirm) assert.equal(completedReview, true);
				const index = options.indexOf(choice);
				assert.ok(index >= 0);
				for (let i = 0; i < index; i++) component.handleInput("j");
				assert.match(component.render(width!).join("\n"), new RegExp(choice));
				component.handleInput("\n");
				component.dispose();
				assert.equal(selected, choice);
				return selected;
			}, notify() {} } } as unknown as ExtensionContext;
			const result = await selectWizardPage(ctx, content, [...Array.from({ length: 50 }, (_, i) => `Edit Q${i}: ${"long option text ".repeat(10)}`), "Confirm answers"], () => true);
			assert.equal(result, "Confirm answers");
			for (let i = 0; i < 50; i++) assert.ok(seen.join("\n").includes(`END${i}`));
		}
	} finally {
		if (rows) Object.defineProperty(process.stdout, "rows", rows); else Reflect.deleteProperty(process.stdout, "rows");
		if (columns) Object.defineProperty(process.stdout, "columns", columns); else Reflect.deleteProperty(process.stdout, "columns");
	}
});
