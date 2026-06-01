import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export async function askFirstRequest(
  ctx: ExtensionCommandContext,
): Promise<string | undefined> {
  if (ctx.hasUI && typeof ctx.ui.editor === "function") {
    return ctx.ui.editor("Describe the plan request", "");
  }
  return undefined;
}
