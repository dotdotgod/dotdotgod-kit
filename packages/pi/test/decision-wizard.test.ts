import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { DecisionWizardState, buildDecisionWizardFollowUp } from "../extensions/plan-mode/decision-wizard.ts";
import { DecisionWizardComponent, type WizardScreenResult } from "../extensions/plan-mode/components/decision-wizard.ts";
import { promptForDecisionWizard } from "../extensions/plan-mode/controllers/decision-wizard.ts";
import { summarizeDiscussionQueue } from "../extensions/plan-mode/plans.ts";

const markdown = `# Task
## Discussion Queue
- [ ] Q1 scope blocks-execute-review: Pick storage?
  - Options:
    - A: Markdown
    - B: JSON
  - Recommended: A
  - Status: open
- [ ] Q2 scope blocks-execute-review: 직접 입력으로 결정?
  - Status: open
`;
const items = () => summarizeDiscussionQueue(markdown).unresolved;
const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;

function fixture(run: (cwd: string, path: string) => Promise<void>) {
	const cwd = mkdtempSync(join(tmpdir(), "decision-wizard-"));
	const path = join(cwd, "README.md");
	writeFileSync(path, markdown);
	return run(cwd, path).finally(() => rmSync(cwd, { recursive: true, force: true }));
}

function scriptedChoice(choices: Array<string | undefined>, options: string[]): string | undefined {
	if (options.includes("Read more")) return "Read more";
	if (options.includes("Continue")) return "Continue";
	const label = options.find((option) => option.replace(/^\d+\. /, "") === choices[0]);
	if (!label && options.includes("More actions")) return "More actions";
	choices.shift();
	return label;
}

function context(cwd: string, ui: Record<string, unknown>, mode = "rpc"): ExtensionContext {
	return { cwd, mode, hasUI: true, ui: { notify() {}, ...ui } } as unknown as ExtensionContext;
}

describe("decision wizard state", () => {
	it("requires explicit answers and batch confirmation even for one question", () => {
		const state = new DecisionWizardState(items().slice(0, 1));
		assert.equal(state.next(), false);
		assert.equal(state.confirm(), undefined);
		state.choose(99);
		assert.equal(state.complete, false);
		state.choose(0);
		assert.equal(state.summary, false);
		assert.equal(state.confirm(), undefined);
		state.next();
		assert.equal(state.confirm()?.action, "confirm");
	});
	it("preserves drafts across Back and summary edits and rejects empty custom input", () => {
		const state = new DecisionWizardState(items());
		state.choose(0);
		state.next();
		assert.equal(state.custom(" \n "), false);
		assert.equal(state.next(), false);
		assert.equal(state.custom(" 기타 대답\n여러 줄 "), true);
		state.back();
		assert.equal(state.answer()?.value, "Markdown");
		state.choose(1);
		state.next();
		assert.equal(state.answer()?.value, "기타 대답\n여러 줄");
		state.next();
		state.edit(0);
		state.choose(0);
		state.next();
		const result = state.confirm();
		assert.equal(result?.action, "confirm");
		const prompt = buildDecisionWizardFollowUp("docs/plan/test/README.md", result!);
		assert.match(prompt!, /Status: answered/);
		assert.match(prompt!, /Do not execute/);
		assert.equal(JSON.parse(prompt!.split("\n\n")[1]!).answers.length, 2);
		assert.equal(buildDecisionWizardFollowUp(undefined, { action: "cancel" }), undefined);
	});
	it("does not submit empty questionnaires and rejects duplicate identifiers", () => {
		assert.equal(new DecisionWizardState([]).confirm(), undefined);
		assert.throws(() => new DecisionWizardState([items()[0]!, items()[0]!]), /unique/);
	});
});

describe("decision wizard terminal screen", () => {
	it("keeps choosing and navigation local until explicit final confirmation", () => {
		const state = new DecisionWizardState(items().slice(0, 1));
		const results: WizardScreenResult[] = [];
		const screen = new DecisionWizardComponent(state, theme, (result) => results.push(result), () => {}, () => 24);
		screen.handleInput("\x1b[C"); // Next before answer
		assert.equal(state.index, 0);
		screen.handleInput("\r"); // choose highlighted option, not submission
		assert.equal(results.length, 0);
		assert.equal(state.summary, true); // Last answer immediately opens summary.
		assert.equal(results.length, 0);
		screen.handleInput("\x1b[B"); // Confirm answers (first summary action edits Q1)
		screen.handleInput("\r");
		screen.handleInput("\r"); // late repeated input must not submit twice
		assert.deepEqual(results.map((result) => result.action), ["confirm"]);
	});
	it("advances options immediately, preserves Back drafts, and returns summary edits directly", () => {
		const questions = [items()[0]!, { ...items()[0]!, id: "Q2" }];
		const state = new DecisionWizardState(questions);
		const results: WizardScreenResult[] = [];
		const screen = new DecisionWizardComponent(state, theme, (result) => results.push(result), () => {}, () => 24);
		screen.handleInput("\r");
		assert.equal(state.index, 1);
		screen.handleInput("\x1b[D");
		assert.equal(state.index, 0);
		assert.equal(state.answer()?.value, "Markdown");
		screen.handleInput("\x1b[C"); // Reuse existing draft after Back.
		assert.equal(state.index, 1);
		screen.handleInput("\r");
		assert.equal(state.summary, true);
		screen.handleInput("\r"); // Edit Q1.
		assert.equal(state.index, 0);
		screen.handleInput("\x1b[B");
		screen.handleInput("\r"); // Choose JSON and return directly to summary.
		assert.equal(state.summary, true);
		assert.equal(state.answer(0)?.value, "JSON");
		assert.deepEqual(results, []);
	});
	it("wraps long Korean content and scrolls within narrow and short terminals", () => {
		const long = items();
		long[0]!.question = "질문 내용 ".repeat(60);
		long[0]!.options[0]!.text = "긴 선택지 ".repeat(80);
		const screen = new DecisionWizardComponent(new DecisionWizardState(long), theme, () => {}, () => {}, () => 8);
		for (const width of [1, 12, 30, 80]) {
			screen.invalidate();
			for (const key of ["", "\x1b[5~", "\x1b[6~", "\x1b[B"]) {
				screen.handleInput(key);
				const lines = screen.render(width);
				assert.ok(lines.length <= 8);
				assert.ok(lines.every((line) => visibleWidth(line) <= width));
			}
		}
	});
	it("reveals all content and reachable controls while resizing", () => {
		const questions = items().slice(0, 1);
		questions[0]!.question = Array.from({ length: 40 }, (_, i) => `line${i}`).join("\n");
		let height = 10;
		const state = new DecisionWizardState(questions);
		const screen = new DecisionWizardComponent(state, theme, () => {}, () => {}, () => height);
		const seen: string[] = [];
		for (let i = 0; i < 30; i++) {
			seen.push(screen.render(80).join("\n"));
			screen.handleInput("\x1b[6~");
		}
		for (let i = 0; i < 40; i++) assert.ok(seen.join("\n").includes(`line${i}`));
		for (height of [6, 16, 8]) {
			screen.handleInput("\x1b[B");
			assert.match(screen.render(80).join("\n"), /▶ /);
			assert.match(screen.render(80).join("\n"), /Esc cancel/);
		}
		state.choose(0);
		screen.handleInput("\x1b[C");
		screen.handleInput("\x1b[B");
		assert.match(screen.render(80).join("\n"), /▶ Confirm answers/);
	});
	it("pins themed footer rows for short/long questions, summary edits, and resize", () => {
		const colors = new Set<string>();
		const themed = { fg: (color: string, text: string) => { colors.add(color); return text; }, bold: (text: string) => text } as Theme;
		const questions = items();
		let height = 24;
		const state = new DecisionWizardState(questions);
		const screen = new DecisionWizardComponent(state, themed, () => {}, () => {}, () => height);
		for (const [width, rows] of [[80, 24], [40, 12], [22, 8], [80, 40]]) {
			height = rows!;
			for (const long of [false, true]) {
				questions[0]!.question = long ? "Long question\n".repeat(80) : "Short?";
				state.edit(0);
				const before = screen.render(width!);
				assert.equal(before.length, height);
				assert.match(before[0]!, /── Plan Mode/);
				assert.ok(before.every((line) => visibleWidth(line) <= width!));
				screen.handleInput("\x1b[6~");
				assert.deepEqual(screen.render(width!).slice(-2), before.slice(-2));
				state.choose(0);
				state.edit(1);
				state.custom(long ? "Full answer\n".repeat(60) : "Yes");
				state.next();
				const summary = screen.render(width!);
				assert.equal(summary.length, height);
				assert.ok(summary.slice(-4).join("\n").includes("["));
				screen.handleInput("\x1b[5~");
				assert.deepEqual(screen.render(width!).slice(-2), summary.slice(-2));
			}
		}
		for (const color of ["accent", "borderAccent", "borderMuted", "muted", "dim"]) assert.ok(colors.has(color));
	});
	it("keeps footer actions out of the scrolled body and keyboard reachable", () => {
		const state = new DecisionWizardState(items().slice(0, 1));
		let result: WizardScreenResult | undefined;
		const screen = new DecisionWizardComponent(state, theme, (value) => { result = value; }, () => {}, () => 24);
		let lines = screen.render(80);
		assert.match(lines[22]!, /\[   Back \].*\[   Next \].*\[   Cancel \]/);
		assert.ok(!lines.slice(3, 21).join("\n").includes("[   Next ]"));
		screen.handleInput("\r");
		lines = screen.render(80);
		assert.equal(state.summary, true);
		assert.match(lines[22]!, /\[   Confirm answers \]/);
		screen.handleInput("\x1b[B");
		assert.match(screen.render(80)[22]!, /\[ ▶ Confirm answers \]/);
		screen.handleInput("\r");
		assert.equal(result?.action, "confirm");
	});
	it("cancel returns no draft answers", () => {
		let result: WizardScreenResult | undefined;
		const screen = new DecisionWizardComponent(new DecisionWizardState(items()), theme, (value) => { result = value; }, () => {}, () => 24);
		screen.handleInput("\r");
		screen.handleInput("\x1b");
		assert.deepEqual(result, { action: "cancel" });
	});
});

describe("decision wizard controller", () => {
	it("keeps a complete custom-screen/editor flow inside one controller invocation", () => fixture(async (cwd, path) => {
		let screens = 0;
		let editors = 0;
		let renders = 0;
		const ctx = context(cwd, {
			custom: async (factory: (tui: unknown, theme: Theme, kb: unknown, done: (result: WizardScreenResult) => void) => DecisionWizardComponent, options: unknown) => {
				assert.deepEqual(options, { overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", margin: 0, anchor: "bottom-center" } });
				let result: WizardScreenResult | undefined;
				const screen = factory({ terminal: { rows: 24 }, requestRender: () => { renders++; } }, theme, {}, (value) => { result = value; });
				const keys = screens++ === 0 ? ["\u001b[B", "\u001b[B", "\r"]
					: screens === 2 ? ["\r"] : ["\u001b[B", "\u001b[B", "\r"];
				assert.equal(screen.render(80).length, 24); // Includes re-open after native editor.
				for (const key of keys) screen.handleInput(key);
				return result;
			},
			editor: async () => `답변 ${++editors}\n붙여넣기`,
		}, "tui");
		const result = await promptForDecisionWizard(ctx, path, () => true);
		assert.equal(result?.action, "confirm");
		assert.equal(screens, 3);
		assert.equal(editors, 2);
		assert.ok(renders > 0);
		if (result?.action === "confirm") assert.deepEqual(result.answers.map((answer) => answer.value), ["답변 1\n붙여넣기", "답변 2\n붙여넣기"]);
	}));
	it("fallback collects every answer, supports summary editing, and confirms once", () => fixture(async (cwd, path) => {
		const selections = ["1. A: Markdown", "Other / custom answer", "Edit Q1", "2. B: JSON", "Confirm answers"];
		const titles: string[] = [];
		const ctx = context(cwd, {
			select: async (title: string, options: string[]) => {
				titles.push(title);
				const next = scriptedChoice(selections, options);
				assert.ok(options.includes(next!));
				return next;
			},
			editor: async () => "기타\n여러 줄",
		});
		const result = await promptForDecisionWizard(ctx, path, () => true);
		assert.equal(result?.action, "confirm");
		if (result?.action === "confirm") assert.deepEqual(result.answers.map((answer) => answer.value), ["JSON", "기타\n여러 줄"]);
		assert.equal(selections.length, 0);
		assert.match(titles.join("\n"), /JSON[\s\S]*기타/);
		assert.equal(readFileSync(path, "utf8"), markdown);
	}));
	it("custom summary edits return straight to summary without submitting early", () => fixture(async (cwd, path) => {
		const choices = ["1. A: Markdown", "Other / custom answer", "Edit Q1", "Other / custom answer", "Confirm answers"];
		const answers = ["Second answer", "Revised first answer"];
		const editorTitles: string[] = [];
		const result = await promptForDecisionWizard(context(cwd, {
			select: async (_title: string, options: string[]) => scriptedChoice(choices, options),
			editor: async (title: string) => { editorTitles.push(title); return answers.shift(); },
		}), path, () => true);
		assert.deepEqual(editorTitles, ["Answer question 2/2", "Answer question 1/2"]);
		assert.equal(choices.length, 0);
		assert.equal(result?.action, "confirm");
		if (result?.action === "confirm") assert.deepEqual(result.answers.map((answer) => answer.value), ["Revised first answer", "Second answer"]);
	}));
	it("cancelled custom edit preserves the draft through batch confirmation", () => fixture(async (cwd, path) => {
		const choices = ["Other / custom answer", "Back", "Other / custom answer", "Next", "Other / custom answer", "Confirm answers"];
		const texts = ["Existing custom answer", undefined, "Second answer"];
		const result = await promptForDecisionWizard(context(cwd, {
			select: async (_title: string, options: string[]) => scriptedChoice(choices, options),
			editor: async () => texts.shift(),
		}), path, () => true);
		assert.equal(result?.action, "confirm");
		if (result?.action === "confirm") assert.deepEqual(result.answers.map((answer) => answer.value), ["Existing custom answer", "Second answer"]);
	}));
	it("native editor receives custom drafts; blank or cancelled input never answers", () => fixture(async (cwd, path) => {
		const choices = ["Other / custom answer", "Next", "Other / custom answer", "Back", "Other / custom answer", "Cancel"];
		const texts = ["   ", "한글\n붙여넣기", undefined];
		const prefills: string[] = [];
		const result = await promptForDecisionWizard(context(cwd, {
			select: async (_title: string, options: string[]) => scriptedChoice(choices, options),
			editor: async (_title: string, prefill: string) => { prefills.push(prefill); return texts.shift(); },
		}), path, () => true);
		assert.deepEqual(prefills, ["", "", "한글\n붙여넣기"]);
		assert.deepEqual(result, { action: "cancel" });
	}));
	it("falls back after custom UI failure but never treats undefined TUI results as consent", () => fixture(async (cwd, path) => {
		let selects = 0;
		const ctx = context(cwd, { custom: async () => { throw new Error("UI unavailable"); }, select: async () => { selects++; return "Cancel"; } }, "tui");
		assert.deepEqual(await promptForDecisionWizard(ctx, path, () => true), { action: "cancel" });
		assert.equal(selects, 1);
		ctx.ui.custom = async () => undefined as never;
		assert.deepEqual(await promptForDecisionWizard(ctx, path, () => true), { action: "cancel" });
		assert.equal(selects, 1);
	}));
	it("discards stale plan and lifecycle results", () => fixture(async (cwd, path) => {
		let current = true;
		const ctx = context(cwd, { select: async () => { current = false; return "1. A: Markdown"; } });
		assert.deepEqual(await promptForDecisionWizard(ctx, path, () => current), { action: "cancel" });
		current = true;
		ctx.ui.select = async () => { writeFileSync(path, markdown.replace("Pick storage?", "New question?")); return "1. A: Markdown"; };
		assert.deepEqual(await promptForDecisionWizard(ctx, path, () => current), { action: "cancel" });
	}));
	it("re-reads decisions after plan updates, blocks missing plans and noninteractive review", () => fixture(async (cwd, path) => {
		const ctx = context(cwd, { select: async () => "Cancel" });
		writeFileSync(path, "# Cleared plan");
		assert.equal(await promptForDecisionWizard(ctx, path, () => true), undefined);
		writeFileSync(path, markdown);
		assert.deepEqual(await promptForDecisionWizard(ctx, path, () => true), { action: "cancel" });
		const noUI = { ...ctx, hasUI: false };
		assert.deepEqual(await promptForDecisionWizard(noUI, path, () => true), { action: "cancel" });
		rmSync(path);
		await assert.rejects(promptForDecisionWizard(ctx, path, () => true), /ENOENT/);
	}));
});
