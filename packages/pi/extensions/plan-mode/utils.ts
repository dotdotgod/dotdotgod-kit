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

export function isDotdotgodCliCommand(command: string): boolean {
	if (/[;&|<>`$\n\r]/.test(command)) return false;

	const tokens = tokenizeShellCommand(command.trim());
	if (!tokens || tokens.length === 0) return false;

	const [program, script] = tokens;
	if (program === "dotdotgod") return true;
	if (program !== "node" || !script || script.startsWith("-")) return false;

	const normalizedScript = script.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	return normalizedScript === "packages/cli/bin/dotdotgod.mjs";
}

export interface PlanModeBashApproval {
	hasUI: boolean;
	confirm: (title: string, message: string) => boolean | Promise<boolean>;
}

export interface PlanModeBashDecision {
	allow: boolean;
	reason?: string;
}

export async function shouldAllowPlanModeBashCommand(command: string, approval?: PlanModeBashApproval): Promise<PlanModeBashDecision> {
	if (isSafeCommand(command)) return { allow: true };

	if (isDotdotgodCliCommand(command)) {
		if (!approval?.hasUI) {
			return {
				allow: false,
				reason: `Plan mode: dotdotgod CLI commands require interactive user approval.\nCommand: ${command}`,
			};
		}

		const approved = await approval.confirm(
			"Allow dotdotgod CLI in Plan Mode?",
			`The agent wants to run:\n${command}\n\nThis can read or update dotdotgod cache files depending on the subcommand. Allow this one command?`,
		);
		return approved
			? { allow: true }
			: {
				allow: false,
				reason: `Plan mode: dotdotgod CLI command blocked by user.\nCommand: ${command}`,
			};
	}

	return {
		allow: false,
		reason: `Plan mode: command is not allowlisted. Mutating, install, or deletion commands are only allowed during execution mode.\nCommand: ${command}`,
	};
}

export function getCurrentPlanReadmePath(path: string): string | undefined {
	const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	const match = normalized.match(/^docs\/plan\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(README\.md|[A-Z0-9]+(?:_[A-Z0-9]+)*\.md)$/);
	if (!match?.[1]) return undefined;
	return `docs/plan/${match[1]}/README.md`;
}

export function extractPathMentions(text: string): string[] {
	const paths: string[] = [];
	const seen = new Set<string>();
	const re = /(?:^|[\s`"'(:])(@?\.?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)(?=$|[\s`"'),.;:])/g;
	let match;
	while ((match = re.exec(text)) !== null) {
		const raw = match[1];
		if (!raw) continue;
		const normalized = raw.replace(/^@/, "").replace(/^\.\//, "").replace(/\/+/g, "/");
		if (normalized.includes("..") || normalized.endsWith("/")) continue;
		if (!/[.][A-Za-z0-9]+$/.test(normalized)) continue;
		if (!seen.has(normalized)) {
			seen.add(normalized);
			paths.push(normalized);
		}
	}
	return paths;
}

export function selectPlanImpactPath(
	cwd: string,
	latestRequest: string | undefined,
	currentPlanPath: string | undefined,
	touchedPaths: readonly string[],
	pathExists: (cwd: string, path: string) => boolean,
): string | undefined {
	const candidates = [
		...extractPathMentions(latestRequest ?? ""),
		...(currentPlanPath ? [currentPlanPath] : []),
		...touchedPaths,
	];
	return candidates.find((path) => pathExists(cwd, path));
}

export const DEFAULT_PLAN_MODE_TOOLS = [
	"read",
	"bash",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"questionnaire",
	"web_search",
	"code_search",
	"fetch_content",
	"get_search_content",
];

export const PLAN_COMPACTION_PERCENT_THRESHOLD = 60;
export const PLAN_COMPACTION_TOKEN_FALLBACK = 100_000;
export const PLAN_COMPACTION_CONTEXT_RESERVE = 32_000;

export const PLAN_MODE_COMPACTION_INSTRUCTIONS =
	"Preserve only planning-critical context for dotdotgod Plan Mode. Prioritize the latest user request, active plan task slug/path/status, current target files, concrete user decisions and constraints, implementation decisions, verification commands/results, unresolved risks/questions, next steps, and completed [DONE:n] markers if present. Demote or omit old completed plans unless directly relevant, repeated project-load summaries, package publish history unless task-related, generic Plan Mode boilerplate recoverable from runtime prompts, repeated tool output, stale alternatives, generic chatter, and unrelated archive detail. Summarize in a compact structure that lets the next assistant continue the current plan or execution without asking the user to repeat context.";

export function parsePlanModeExtraTools(value: unknown): string[] {
	if (typeof value !== "string") return [];
	const seen = new Set<string>();
	return value
		.split(",")
		.map((tool) => tool.trim())
		.filter((tool) => /^[A-Za-z0-9_:-]+$/.test(tool))
		.filter((tool) => {
			if (seen.has(tool)) return false;
			seen.add(tool);
			return true;
		});
}

export function resolvePlanModeTools(extraTools: unknown, availableTools?: readonly string[]): string[] {
	const available = availableTools ? new Set(availableTools) : undefined;
	const seen = new Set<string>();
	const requested = [...DEFAULT_PLAN_MODE_TOOLS, ...parsePlanModeExtraTools(extraTools)];
	return requested.filter((tool) => {
		if (seen.has(tool)) return false;
		if (available && !available.has(tool)) return false;
		seen.add(tool);
		return true;
	});
}

export function buildPlanModeFullContextPrompt(allowedTools = DEFAULT_PLAN_MODE_TOOLS): string {
	return `[PLAN MODE ACTIVE]
You are in Plan Mode. This is a read-only exploration and design phase before code changes.

Restrictions:
- Allowed tools: ${allowedTools.join(", ")}
- edit/write are allowed only for markdown plan/archive files under docs/plan/ or docs/archive/.
- Under docs/, directories must use kebab-case and markdown file names must use UPPER_SNAKE_CASE.md, including README.md.
- Forbidden: source/code/config file mutation outside docs/plan/ and docs/archive/.
- Bash is restricted to read-only allowlisted commands.

Project context:
- Use already-loaded project memory and load-snapshot summaries first when available.
- Read AGENTS.md and docs/README.md when they are missing, stale, or needed for the current task.
- Treat project docs as the source of truth for stack, commands, conventions, and architecture.
- Check docs/arch when code conventions, module boundaries, infrastructure/runtime dependencies, or integration constraints may affect the plan.

Workflow:
- Explore relevant files thoroughly before planning; ask clarifying questions when requirements are ambiguous, using questionnaire if available.
- If planning compaction has just occurred, rely on the preserved planning summary plus current project docs before writing or refining the plan.
- Use web_search, code_search, and fetch_content when library or web evidence is needed.
- Manage active work under docs/plan/<task-slug>/README.md, with optional UPPER_SNAKE_CASE support files in the same task directory.
- When one docs domain grows into multiple files, group it under docs/<area>/<domain>/README.md plus supporting UPPER_SNAKE_CASE files.
- Include scope, status, target files, risks, verification, and a final archive step to docs/archive/plan/<task-slug>/.
- Do not change product/source files in plan mode. Only maintain docs/plan or docs/archive markdown files and produce an executable plan.

Always write the task README with scope, target files, implementation steps, verification, risks when useful, and archive housekeeping.

In the final response, use a Plan: section only for concrete executable steps. Avoid generic template labels such as "Target files and rationale", "Implementation steps", or "Verification method" as numbered plan items.

Do not change source/code/config files in Plan Mode. You may create or update only the allowed docs/plan or docs/archive markdown files needed to produce the durable plan.`;
}

export const PLAN_MODE_COMPACT_CONTEXT_PROMPT = `[PLAN MODE ACTIVE]
Compact reminder: stay in read-only planning until execution mode. Do not mutate source/code/config files. edit/write are allowed only for UPPER_SNAKE_CASE markdown under docs/plan/ or docs/archive/; bash remains read-only allowlisted. Use AGENTS.md and docs indexes as source of truth when needed. Maintain the active task under docs/plan/<task-slug>/README.md and use a Plan: section only for concrete executable steps when ready.`;

export function buildPlanModeContextPrompt(compact = false, allowedTools = DEFAULT_PLAN_MODE_TOOLS): string {
	return compact ? PLAN_MODE_COMPACT_CONTEXT_PROMPT : buildPlanModeFullContextPrompt(allowedTools);
}

export interface PlanCompactionFocus {
	task?: string;
	activePlanPaths?: string[];
	touchedMemoryPaths?: string[];
	todoSummary?: string;
	pendingLoadAfterCompaction?: boolean;
	constraints?: string[];
}

export interface PlanContextUsage {
	tokens?: number | null;
	contextWindow?: number | null;
	percent?: number | null;
}

export interface PlanningContextShapeTriggerState {
	planModeEnabled: boolean;
	executionMode: boolean;
	planningContextShapePending: boolean;
}

export function shouldShapePlanningContextOnAgentStart(state: PlanningContextShapeTriggerState): boolean {
	return state.planModeEnabled && !state.executionMode && state.planningContextShapePending;
}

function formatFocusList(label: string, values: string[] | undefined): string | undefined {
	const cleaned = [...new Set(values?.map((value) => value.trim()).filter(Boolean) ?? [])];
	if (cleaned.length === 0) return undefined;
	return `- ${label}: ${cleaned.slice(0, 8).join(", ")}${cleaned.length > 8 ? `, +${cleaned.length - 8} more` : ""}`;
}

export function formatPlanCompactionFocus(focus?: PlanCompactionFocus): string | undefined {
	if (!focus) return undefined;
	const lines = [
		focus.task?.trim() ? `- Task: ${focus.task.trim()}` : undefined,
		formatFocusList("Active plan", focus.activePlanPaths),
		formatFocusList("Touched plan/archive memory", focus.touchedMemoryPaths),
		focus.todoSummary?.trim() ? `- Todo state: ${focus.todoSummary.trim()}` : undefined,
		focus.pendingLoadAfterCompaction ? "- Pending: load curated project memory after compaction" : undefined,
		formatFocusList("Preserve constraints", focus.constraints),
	].filter((line): line is string => Boolean(line));
	if (lines.length === 0) return undefined;
	return `Current work focus:\n${lines.join("\n")}`;
}

export function buildPlanCompactionInstructions(reason?: string, focus?: PlanCompactionFocus): string {
	const sections = [];
	const normalizedReason = reason?.trim();
	if (normalizedReason) sections.push(`Reason: ${normalizedReason}`);
	const formattedFocus = formatPlanCompactionFocus(focus);
	if (formattedFocus) sections.push(formattedFocus);
	sections.push(PLAN_MODE_COMPACTION_INSTRUCTIONS);
	return sections.join("\n\n");
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
