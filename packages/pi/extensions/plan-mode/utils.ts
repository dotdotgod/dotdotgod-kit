/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 */

// Destructive commands blocked in plan mode
const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish|upgrade|dlx|create)/i,
	/\bpnpm\s+(add|remove|install|publish|dlx|create)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

// Safe read-only commands allowed in plan mode
const SAFE_PATTERNS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*curl\s+(-I|--head|--silent|-s|--location|-L|https?:\/\/)/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*eza\b/,
];

export function tokenizeShellCommand(command: string): string[] | undefined {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;

	for (let i = 0; i < command.length; i += 1) {
		const char = command[i];
		if (!char) continue;

		if (quote) {
			if (char === quote) {
				quote = undefined;
			} else {
				current += char;
			}
			continue;
		}

		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}

		if (/\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}

		current += char;
	}

	if (quote) return undefined;
	if (current.length > 0) tokens.push(current);
	return tokens;
}

export function isPlanArchivePath(path: string): boolean {
	const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	if (normalized.includes("\0") || normalized.includes("*")) return false;
	if (normalized.startsWith("/") || normalized.startsWith("../") || normalized.includes("/../")) return false;
	return (
		normalized.startsWith("docs/plan/") ||
		normalized.startsWith("docs/archive/") ||
		normalized === "docs/archive/plan"
	);
}

export function isProtectedPlanArchiveRoot(path: string): boolean {
	const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	return normalized === "docs/plan" || normalized === "docs/archive" || normalized === "docs/archive/plan";
}

export function isSafePlanArchiveCommand(command: string): boolean {
	if (/[;&|<>`$\n\r]/.test(command)) return false;

	const tokens = tokenizeShellCommand(command.trim());
	if (!tokens || tokens.length === 0) return false;

	const [program, ...args] = tokens;
	if (program === "mkdir") {
		const paths = args.filter((arg) => arg !== "-p");
		const options = args.filter((arg) => arg.startsWith("-"));
		return paths.length > 0 && options.every((option) => option === "-p") && paths.every(isPlanArchivePath);
	}

	if (program === "mv") {
		const paths = args.filter((arg) => !arg.startsWith("-"));
		const options = args.filter((arg) => arg.startsWith("-"));
		return paths.length >= 2 && options.every((option) => option === "-f" || option === "-n") && paths.every(isPlanArchivePath);
	}

	if (program === "rm" || program === "rmdir") {
		const paths = args.filter((arg) => !arg.startsWith("-"));
		const options = args.filter((arg) => arg.startsWith("-"));
		const optionsAllowed =
			program === "rmdir"
				? options.length === 0
				: options.every((option) => /^-[rRf]+$/.test(option));
		return (
			paths.length > 0 &&
			optionsAllowed &&
			paths.every(isPlanArchivePath) &&
			paths.every((path) => !isProtectedPlanArchiveRoot(path))
		);
	}

	return false;
}

export function isSafeCommand(command: string): boolean {
	if (isSafePlanArchiveCommand(command)) return true;
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(command));
	return !isDestructive && isSafe;
}

export const PLAN_COMPACTION_PERCENT_THRESHOLD = 70;
export const PLAN_COMPACTION_TOKEN_FALLBACK = 100_000;
export const PLAN_COMPACTION_CONTEXT_RESERVE = 32_000;

export const PLAN_MODE_COMPACTION_INSTRUCTIONS =
	"Preserve planning-critical context for dotdotgod Plan Mode. Keep user decisions, constraints, active plan task slug/path/status, touched docs/plan and docs/archive files, relevant docs/spec docs/test docs/arch context, implementation decisions, verification results, unresolved risks/questions, and concrete next steps. Preserve completed [DONE:n] markers if present. Omit low-value discussion, repeated tool output, stale alternatives, generic chatter, and unrelated archive detail. Summarize in a compact structure that lets the next assistant continue planning or execution without asking the user to repeat context.";

export interface PlanContextUsage {
	tokens?: number | null;
	contextWindow?: number | null;
	percent?: number | null;
}

export function buildPlanCompactionInstructions(reason?: string): string {
	const normalizedReason = reason?.trim();
	if (!normalizedReason) return PLAN_MODE_COMPACTION_INSTRUCTIONS;
	return `Reason: ${normalizedReason}\n\n${PLAN_MODE_COMPACTION_INSTRUCTIONS}`;
}

export function getPlanCompactionReason(usage: PlanContextUsage | null | undefined): string | undefined {
	if (!usage) return undefined;

	const percent = usage.percent ?? null;
	if (typeof percent === "number") {
		const normalizedPercent = percent <= 1 ? percent * 100 : percent;
		if (normalizedPercent >= PLAN_COMPACTION_PERCENT_THRESHOLD) {
			return `Plan Mode context exceeded ${PLAN_COMPACTION_PERCENT_THRESHOLD}% of the context window.`;
		}
	}

	const tokens = usage.tokens ?? null;
	if (typeof tokens !== "number") return undefined;

	const contextWindow = usage.contextWindow ?? null;
	if (typeof contextWindow === "number" && tokens >= contextWindow - PLAN_COMPACTION_CONTEXT_RESERVE) {
		return `Plan Mode context is within ${PLAN_COMPACTION_CONTEXT_RESERVE.toLocaleString()} tokens of the context window.`;
	}

	if (tokens >= PLAN_COMPACTION_TOKEN_FALLBACK) {
		return `Plan Mode context exceeded ${PLAN_COMPACTION_TOKEN_FALLBACK.toLocaleString()} tokens.`;
	}

	return undefined;
}

export interface TodoItem {
	step: number;
	text: string;
	completed: boolean;
}

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(
			/^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install|Analyze|Review|Test)\s+(the\s+)?/i,
			"",
		)
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	if (cleaned.length > 50) {
		cleaned = `${cleaned.slice(0, 47)}...`;
	}
	return cleaned;
}

function isTemplatePlanStep(text: string): boolean {
	const normalized = text
		.toLowerCase()
		.replace(/[`:*_()[\]{}]/g, "")
		.replace(/\s+/g, " ")
		.trim();

	return (
		normalized === "target files and rationale" ||
		normalized === "implementation steps" ||
		normalized === "verification method" ||
		normalized === "risks and edge cases" ||
		normalized === "archive step" ||
		normalized === "completion" ||
		normalized.includes("실행/유지/수정 선택") ||
		normalized.includes("선택 프롬프트")
	);
}

export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
	const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		const rawText = match[2];
		if (!rawText) continue;
		const text = rawText
			.trim()
			.replace(/\*{1,2}$/, "")
			.trim();
		if (text.length > 5 && !text.startsWith("`") && !text.startsWith("/") && !text.startsWith("-")) {
			const cleaned = cleanStepText(text);
			if (cleaned.length > 3 && !isTemplatePlanStep(text) && !isTemplatePlanStep(cleaned)) {
				items.push({ step: items.length + 1, text: cleaned, completed: false });
			}
		}
	}
	return items;
}

export function extractDoneSteps(message: string): number[] {
	const steps: number[] = [];
	for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
	const doneSteps = extractDoneSteps(text);
	for (const step of doneSteps) {
		const item = items.find((t) => t.step === step);
		if (item) item.completed = true;
	}
	return doneSteps.length;
}
