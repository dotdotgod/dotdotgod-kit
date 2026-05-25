import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { buildSingleQuestionFollowUp } from "./prompts.ts";

function followUpOptions(ctx: ExtensionCommandContext): { deliverAs: "followUp" } | undefined {
	return ctx.isIdle() ? undefined : { deliverAs: "followUp" };
}

export async function askFirstRequest(ctx: ExtensionCommandContext): Promise<string | undefined> {
	if (ctx.hasUI && typeof ctx.ui.editor === "function") {
		return ctx.ui.editor("Describe the plan request", "");
	}
	return undefined;
}

export async function fallbackAskOneQuestion(pi: ExtensionAPI, ctx: ExtensionCommandContext, question: string): Promise<void> {
	if (ctx.hasUI && typeof ctx.ui.select === "function" && typeof ctx.ui.editor === "function") {
		const action = await ctx.ui.select("Plan-generator question", ["Answer", "Defer", "Cancel"]);
		if (action === "Answer") {
			await ctx.ui.editor(question, "");
			return;
		}
	}
	pi.sendUserMessage(buildSingleQuestionFollowUp(question), followUpOptions(ctx));
}
