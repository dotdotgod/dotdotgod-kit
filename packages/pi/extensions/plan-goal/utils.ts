import { complete, type Context, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export function createTextUserMessage(text: string): UserMessage {
  return {
    role: "user",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  };
}

export function formatIso(now = new Date()): string {
  return now.toISOString();
}

export function toKebabCase(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .toLowerCase();
}

export function escapeMarkdown(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

export function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function isValidPlanSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractFencedBlockContents(
  text: string,
  fenceInfo: string,
): string[] {
  const pattern = new RegExp(
    `\\\`\\\`\\\`${escapeRegExp(fenceInfo)}\\s*\\n?([\\s\\S]*?)\\\`\\\`\\\``,
    "g",
  );
  return [...text.matchAll(pattern)].map((match) => match[1] ?? "");
}

export function extractPlanGoalBlocks(text: string): string[] {
  return extractFencedBlockContents(text, "json dotdotgod-plan-goal");
}

export function stableBlockerSetKey(blockers: string[]): string {
  return dedupeStrings(blockers).sort().join("\n");
}

export async function authCreate(
  ctx: ExtensionContext,
  context: Context,
): Promise<string | undefined> {
  if (!ctx.model) return undefined;
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) return undefined;

  const response = await complete(ctx.model, context, {
    apiKey: auth.apiKey,
    ...(auth.headers ? { headers: auth.headers } : {}),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
  if (response.stopReason === "aborted") return undefined;

  const result = response.content
    .filter(
      (content): content is { type: "text"; text: string } =>
        content.type === "text",
    )
    .map((content) => content.text)
    .join("\n")
    .trim();

  return result;
}
