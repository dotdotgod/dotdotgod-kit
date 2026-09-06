import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Native ExtensionSelectorComponent renders every title/option line, without a viewport. */
export async function selectWizardPage(
	ctx: ExtensionContext,
	text: string,
	choices: string[],
	isCurrent: () => boolean,
): Promise<string | undefined> {
	let offset = 0;
	let choiceOffset = 0;
	let reading = true;
	let geometry = "";
	while (isCurrent()) {
		const width = process.stdout.columns || 80;
		const height = process.stdout.rows || 24;
		// Native borders, spacers and key hints need eight rows (more on narrow terminals).
		if (width < 40 || height < 18) {
			ctx.ui.notify("Enlarge the terminal to at least 40 columns and 18 rows to review decisions safely.", "warning");
			return undefined;
		}
		const nextGeometry = `${width}:${height}`;
		if (geometry && geometry !== nextGeometry) { offset = 0; reading = true; }
		geometry = nextGeometry;
		const resized = () => (process.stdout.columns || 80) !== width || (process.stdout.rows || 24) !== height;
		const lines = wrapTextWithAnsi(text, width - 4);
		const capacity = Math.max(1, height - 16);
		const end = Math.min(lines.length, offset + capacity);
		const hasMore = end < lines.length;
		const title = `Review ${offset + 1}-${end}/${lines.length}\n${lines.slice(offset, end).join("\n")}`;
		// All content must be traversed before actions (especially batch confirmation).
		if (reading && (hasMore || offset > 0)) {
			const options = [hasMore ? "Read more" : "Continue", ...(offset > 0 ? ["Previous page"] : []), "Cancel"];
			const selected = await ctx.ui.select(title, options);
			if (!isCurrent() || !selected || selected === "Cancel") return undefined;
			if (resized()) continue;
			if (selected === "Read more") offset = end;
			else if (selected === "Previous page") offset = Math.max(0, offset - capacity);
			else if (selected === "Continue") reading = false;
			continue;
		}
		reading = false;
		const batch = choices.slice(choiceOffset, choiceOffset + 3);
		const labels = batch.map((choice, index) => truncateToWidth(`${choiceOffset + index + 1}. ${choice.replace(/\s+/g, " ")}`, width - 4));
		const options = [...labels,
			...(choiceOffset + batch.length < choices.length ? ["More actions"] : []),
			...(choiceOffset > 0 ? ["Previous actions"] : []),
			...(offset > 0 ? ["Read again"] : []),
			...(!batch.includes("Cancel") ? ["Cancel"] : [])];
		const selected = await ctx.ui.select(title, options);
		if (!isCurrent() || !selected || selected === "Cancel") return undefined;
		if (resized()) continue;
		if (selected === "More actions") choiceOffset += batch.length;
		else if (selected === "Previous actions") choiceOffset = Math.max(0, choiceOffset - 3);
		else if (selected === "Read again") { offset = 0; reading = true; }
		else {
			const index = labels.indexOf(selected);
			if (index >= 0) return batch[index];
		}
	}
	return undefined;
}
