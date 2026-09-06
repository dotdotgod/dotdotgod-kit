import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { DecisionWizardState, type DecisionWizardResult } from "../decision-wizard.ts";

export type WizardScreenResult = DecisionWizardResult | { action: "custom" };

/** Text entry uses Pi's native editor in the controller (IME, paste, multiline). */
export class DecisionWizardComponent {
	private selected = 0;
	private offset = 0;
	private followSelection = false;
	private error = "";
	private finished = false;
	private viewportLines = 1;
	private geometry = "";

	private readonly state: DecisionWizardState;
	private readonly theme: Theme;
	private readonly done: (result: WizardScreenResult) => void;
	private readonly requestRender: () => void;
	private readonly rows: () => number;

	constructor(state: DecisionWizardState, theme: Theme, done: (result: WizardScreenResult) => void, requestRender: () => void, rows: () => number) {
		this.state = state;
		this.theme = theme;
		this.done = done;
		this.requestRender = requestRender;
		this.rows = rows;
	}

	private actions(): string[] {
		if (this.state.summary) return [...this.state.items.map((item) => `Edit ${item.id}`), "Confirm answers", "Back", "Cancel"];
		return [...(this.state.current?.options.map((option) => `${option.label}. ${option.text}${option.recommended ? " (recommended)" : ""}`) ?? []), "Other / custom answer", "Back", "Next", "Cancel"];
	}

	handleInput(data: string): void {
		if (this.finished) return;
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) this.finish({ action: "cancel" });
		else if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.pageDown)) {
			this.offset += matchesKey(data, Key.pageUp) ? -this.viewportLines : this.viewportLines;
			this.followSelection = false;
		} else if (matchesKey(data, Key.up) || matchesKey(data, Key.shift("tab"))) this.move(-1);
		else if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) this.move(1);
		else if (matchesKey(data, Key.left)) this.back();
		else if (matchesKey(data, Key.right)) this.next();
		else if (matchesKey(data, Key.enter)) this.activate();
		this.requestRender();
	}

	private move(delta: number): void {
		this.selected = (this.selected + delta + this.actions().length) % this.actions().length;
		this.followSelection = true;
	}

	private reset(): void { this.selected = 0; this.offset = 0; this.error = ""; this.followSelection = false; }
	private back(): void { this.state.back(); this.reset(); }
	private next(): void {
		if (this.state.next()) this.reset();
		else this.error = "Choose an answer before Next.";
	}
	private finish(result: WizardScreenResult): void { this.finished = true; this.done(result); }

	private activate(): void {
		if (this.state.summary) {
			const count = this.state.items.length;
			if (this.selected < count) { this.state.edit(this.selected); this.reset(); }
			else if (this.selected === count) {
				const result = this.state.confirm();
				if (result) this.finish(result);
			} else if (this.selected === count + 1) this.back();
			else this.finish({ action: "cancel" });
			return;
		}
		const count = this.state.current?.options.length ?? 0;
		if (this.selected < count) {
			this.state.choose(this.selected);
			this.next();
		} else if (this.selected === count) this.finish({ action: "custom" });
		else if (this.selected === count + 1) this.back();
		else if (this.selected === count + 2) this.next();
		else this.finish({ action: "cancel" });
	}

	render(width: number): string[] {
		const w = Math.max(1, Math.floor(width));
		const height = Math.max(1, this.rows());
		const th = this.theme;
		const body: string[] = [];
		const add = (text: string) => body.push(...wrapTextWithAnsi(text, w));
		const item = this.state.current;
		if (item) {
			add(th.bold(`${item.id}: ${item.question}`));
			if (item.why) add(`Why: ${item.why}`);
			if (item.affects) add(`Affects: ${item.affects}`);
			if (item.verificationImpact) add(`Verification: ${item.verificationImpact}`);
			add(`Answer: ${this.state.answer()?.value ?? "Not answered"}`);
		} else {
			add("Review every answer. Confirmation updates the plan, not execution approval.");
			for (let i = 0; i < this.state.items.length; i++) {
				add(`${this.state.items[i]!.id}: ${this.state.items[i]!.question}`);
				add(`Answer: ${this.state.answer(i)?.value ?? "Not answered"}`);
			}
		}
		const actions = this.actions();
		const footerStart = actions.length - 3;
		let focusLine = 0;
		add("");
		actions.slice(0, footerStart).forEach((action, i) => {
			if (i === this.selected) focusLine = body.length;
			add(i === this.selected ? th.fg("accent", `▶ ${action}`) : `  ${action}`);
		});
		const button = (action: string, index: number) => {
			const token = `[ ${index === this.selected ? "▶" : " "} ${action} ]`;
			return index === this.selected ? th.fg("accent", th.bold(token)) : th.fg("muted", token);
		};
		let bar = wrapTextWithAnsi(actions.slice(footerStart).map((action, i) => button(action, footerStart + i)).join(" "), w);
		// Tiny terminals retain an action instead of clipping the footer away.
		if (bar.length > Math.max(1, height - 6)) {
			const index = Math.max(footerStart, this.selected);
			bar = [button(actions[index]!, index)];
		}
		const chrome = height >= 7 ? 5 : height >= 4 ? 2 : 0;
		const visible = Math.min(body.length, Math.max(0, height - chrome - bar.length));
		this.viewportLines = Math.max(1, visible);
		const geometry = `${w}:${height}`;
		if (this.geometry && this.geometry !== geometry) this.followSelection = true;
		this.geometry = geometry;
		if (this.followSelection && this.selected < footerStart) {
			if (focusLine < this.offset) this.offset = focusLine;
			else if (focusLine >= this.offset + visible) this.offset = focusLine - visible + 1;
		}
		this.followSelection = false;
		this.offset = Math.max(0, Math.min(this.offset, body.length - visible));
		const title = this.state.summary ? "Review answers" : `Question ${this.state.index + 1}/${this.state.items.length}`;
		const viewport = body.slice(this.offset, this.offset + visible);
		const border = th.fg("borderMuted", "─".repeat(w));
		const heading = th.fg("borderAccent", "──") + th.fg("accent", ` Plan Mode Decisions · ${title} `) + th.fg("borderAccent", "─".repeat(w));
		const status = th.fg(this.error ? "warning" : "dim", this.error || `Scroll: ${this.offset + 1}-${Math.min(body.length, this.offset + visible)} / ${body.length} · PgUp/PgDn scroll`);
		const help = th.fg("dim", w >= 60 ? "↑↓/Tab select · Enter apply · ← Back · → Next · Esc cancel" : w >= 35 ? "↑↓/Tab select · Enter · Esc cancel" : "Tab · Enter · Esc");
		const titleLine = truncateToWidth(heading, w, "");
		const header = chrome === 5 ? [titleLine, status, border] : chrome === 2 ? [this.error ? status : titleLine] : [];
		const footer = chrome === 5 ? [border, ...bar, help] : chrome === 2 ? [...bar, help] : bar;
		return [...header, ...viewport, ...footer].slice(-height).map((line) => truncateToWidth(line, w));
	}

	invalidate(): void {}
}
