/**
 * Plan Mode command and tool safety helpers.
 */

export function normalizePlanCommandRequest(args: string): string | undefined {
	const request = args.trim();
	return request.length > 0 ? request : undefined;
}

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

export function getDotdotgodCliArgs(command: string): string[] | undefined {
	if (/[;&|<>`$\n\r]/.test(command)) return undefined;

	const tokens = tokenizeShellCommand(command.trim());
	if (!tokens || tokens.length === 0) return undefined;

	const [program, script, ...rest] = tokens;
	if (program === "dotdotgod") return tokens.slice(1);
	if (program !== "node" || !script || script.startsWith("-")) return undefined;

	const normalizedScript = script.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	return normalizedScript === "packages/cli/bin/dotdotgod.mjs" || normalizedScript.endsWith("/packages/cli/bin/dotdotgod.mjs") ? rest : undefined;
}

export function isDotdotgodCliCommand(command: string): boolean {
	return getDotdotgodCliArgs(command) !== undefined;
}

export function isAutoAllowedDotdotgodPlanModeCommand(command: string): boolean {
	const args = getDotdotgodCliArgs(command);
	if (!args || args.length === 0) return false;
	const commandName = args[0];
	const subcommand = args[1];
	if (["--help", "-h", "--version", "-v", "help", "version"].includes(commandName ?? "")) return true;
	if (["status", "load-snapshot", "resolve", "expand", "index"].includes(commandName ?? "")) return true;
	if (commandName === "config") return subcommand !== "init";
	if (commandName === "graph") return subcommand === "impact" || subcommand === "communities";
	return false;
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
		if (isAutoAllowedDotdotgodPlanModeCommand(command)) return { allow: true };

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

