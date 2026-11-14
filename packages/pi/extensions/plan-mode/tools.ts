/** Plan Mode command and tool safety helpers. */
export function normalizePlanCommandRequest(args: string): string | undefined {
	return args.trim() || undefined;
}

export function tokenizeShellCommand(command: string): string[] | undefined {
	const tokens: string[] = [];
	let current = "";
	let quote: string | undefined;
	let started = false;
	for (let i = 0; i < command.length; i++) {
		const char = command[i]!;
		if (/[\n\r\0]/.test(char)) return undefined;
		if (quote === "'") {
			if (char === quote) quote = undefined;
			else current += char;
			continue;
		}
		if (char === "\\") {
			const next = command[++i];
			if (next === undefined || /[\n\r\0]/.test(next)) return undefined;
			current += quote && !/[\\"$`]/.test(next) ? `\\${next}` : next;
			started = true;
			continue;
		}
		if (char === "$" || char === "`") return undefined;
		if (quote) {
			if (char === quote) quote = undefined;
			else current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			started = true;
		} else if (/\s/.test(char)) {
			if (started) tokens.push(current);
			current = "";
			started = false;
		} else {
			// shortcut: no shell expansion grammar; use quoted literal arguments instead.
			if (/[;&|<>(){}*?\[\]~#!]/.test(char)) return undefined;
			current += char;
			started = true;
		}
	}
	if (quote) return undefined;
	if (started) tokens.push(current);
	return tokens;
}

const HARD_PROGRAMS = new Set("rm rmdir mv cp mkdir touch chmod chown chgrp ln tee truncate dd shred sudo su kill pkill killall reboot shutdown systemctl service vi vim nano emacs code subl bash sh zsh fish dash eval exec source command builtin nohup timeout time xargs watch awk gawk nawk make cmake ninja docker podman pi claude codex opencode npx corepack bun deno cargo rustc go gcc g++ cc javac java dotnet uv poetry pipx install patch apply_patch rsync scp ssh tar unzip zip sqlite3 mysql psql mongosh tsx ts-node jest vitest mocha".split(" "));
const READ_PROGRAMS = new Set("cat head tail grep ls pwd echo printf wc uniq file stat du df which whereis type printenv uname whoami id cal uptime ps free rg bat eza".split(" "));

export function classifyPlanCommand(command: string): { kind: "safe" | "approval" | "deny"; reason?: string; tokens?: string[] } {
	const tokens = tokenizeShellCommand(command);
	const deny = (reason: string) => ({ kind: "deny" as const, reason, ...(tokens ? { tokens } : {}) });
	if (!tokens?.length || !tokens[0]) return deny("Only simple commands with literal arguments are supported.");
	const program = tokens[0].split("/").pop()!;
	const args = tokens.slice(1);
	if (HARD_PROGRAMS.has(program) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) return deny("Implementation, wrappers and destructive commands require execution mode.");
	if (program === "hc") {
		const inspection = args.length === 1 && ["ls", "templates", "--help", "-h", "--skill", "--version"].includes(args[0]!)
			|| args.length === 2 && args[0] === "get" && !args[1]!.startsWith("-")
			|| args[0] === "read" && (args.length === 2 && !args[1]!.startsWith("-")
				|| args.length === 4 && args[1] === "--lines" && /^\d+$/.test(args[2]!) && !args[3]!.startsWith("-"));
		return inspection ? { kind: "approval", tokens } : deny("Only exact read-only hc inspections are eligible for approval.");
	}
	if (isDotdotgodCliCommand(command)) {
		const cliArgs = getDotdotgodCliArgs(command)!;
		if (cliArgs.some(a => /^(--output|--out|--write|--fix)(=|$)/.test(a))) return deny("CLI file writes require execution mode.");
		if (cliArgs[0] === "init" || (cliArgs[0] === "config" && cliArgs[1] === "init")) return deny("Project/config writes require execution mode.");
		return { kind: isAutoAllowedDotdotgodPlanModeCommand(command) ? "safe" : "approval", tokens };
	}
	if (/^(node|nodejs|python\d*(\.\d+)?|ruby|perl|php|lua|Rscript)$/.test(program)) return args.length === 1 && ["--version", "-V"].includes(args[0]!) ? { kind: "safe", tokens } : deny("Interpreter execution requires execution mode.");
	if (/^(npm|pnpm|yarn|pip\d*|apt(-get)?|brew)$/.test(program)) {
		if (["list", "ls", "view", "info", "search", "outdated", "why"].includes(args[0] ?? "") && !args.some(a => /^(--(global|prefix|userconfig|script-shell)|-g)/.test(a))) return { kind: "safe", tokens };
		return deny("Package execution/install requires execution mode.");
	}
	if (program === "git") {
		if (!["status", "log", "diff", "show", "ls-files", "ls-tree", "rev-parse", "branch", "remote", "config"].includes(args[0] ?? "")) return deny("Git mutation or execution options require execution mode.");
		// The execution boundary must also disable inherited pagers, fsmonitor and diff drivers.
		if (args.some(a => /^(--(output|ext-diff|textconv|exec|open-files-in-pager|config-env|paginate)|-c|-p|-O)/.test(a))) return deny("Git output/execution options require execution mode.");
		if (args[0] === "branch" && args.slice(1).some(a => !["--list", "-a", "-r", "--all", "--remotes", "-v", "-vv", "--show-current"].includes(a))) return deny("Branch changes require execution mode.");
		if (args[0] === "remote" && args.slice(1).some(a => !["-v", "--verbose"].includes(a))) return deny("Remote changes require execution mode.");
		if (args[0] === "config" && !(args.length === 3 && ["--get", "--get-all", "--get-regexp"].includes(args[1]!))) return deny("Config writes require execution mode.");
		return { kind: "safe", tokens };
	}
	if (program === "env") return args.length === 0 ? { kind: "safe", tokens } : deny("Environment wrappers are not supported.");
	if (program === "find") return args.some(a => /^-(exec|execdir|ok|okdir|delete|fprint|fprintf|fls)/.test(a)) ? deny("Find execution/writes require execution mode.") : { kind: "safe", tokens };
	if (program === "sed") return args[0] === "-n" && args.length >= 2 && /^\d+(,\d+)?p$/.test(args[1]!) && args.slice(2).every(a => !a.startsWith("-")) ? { kind: "safe", tokens } : deny("Only bounded sed printing is allowed.");
	if (program === "sort" || program === "diff" || program === "tree" || program === "fd") {
		if (args.some(a => /^(-o|--output|--compress-program|--diff-program|-x|-X|--exec|--exec-batch)/.test(a))) return deny("Output/execution options require execution mode.");
		return { kind: "safe", tokens };
	}
	if (program === "bat" && args.some(a => /^(--pager|--config|--paging)/.test(a))) return deny("Pager execution requires execution mode.");
	if (program === "rg" && args.some(a => /^(--pre|--hostname-bin)/.test(a))) return deny("Search execution options require execution mode.");
	if (["curl", "wget", "jq", "date", "less", "more", "top", "htop", "bat"].includes(program)) return deny("Unverified execution/write options require execution mode.");
	return { kind: READ_PROGRAMS.has(program) ? "safe" : "approval", tokens };
}

export function isSafeCommand(command: string): boolean {
	// Keep the legacy helper's dotdotgod detection separate from general reads.
	return !isDotdotgodCliCommand(command) && classifyPlanCommand(command).kind === "safe";
}

export function getDotdotgodCliArgs(command: string): string[] | undefined {
	if (/[;&|<>`$\n\r]/.test(command)) return undefined;

	const tokens = tokenizeShellCommand(command.trim());
	if (!tokens || tokens.length === 0) return undefined;

	const [program, script, ...rest] = tokens;
	const executable = program?.split("/").pop();
	if (executable === "dotdotgod") return tokens.slice(1);
	if (executable !== "node" || !script || script.startsWith("-")) return undefined;

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
	if (args.some(arg => /^(--output|--out|--write|--fix)(=|$)/.test(arg))) return false;
	if (["--help", "-h", "--version", "-v", "help", "version"].includes(commandName ?? "")) return true;
	if (["status", "query", "resolve", "expand", "index"].includes(commandName ?? "")) return true;
	if (commandName === "config") return subcommand === undefined || subcommand === "." || subcommand.startsWith("-") || subcommand.startsWith("/");
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
	const decision = classifyPlanCommand(command);
	if (decision.kind === "safe") return { allow: true };
	if (decision.kind === "deny") return { allow: false, reason: `Plan mode: command is not allowlisted. ${decision.reason}\nCommand: ${command}` };
	if (!approval?.hasUI) return { allow: false, reason: `Plan mode: commands require interactive user approval.\nCommand: ${command}` };
	const approved = await approval.confirm(
		isDotdotgodCliCommand(command) ? "Allow dotdotgod CLI in Plan Mode?" : "Allow command in Plan Mode?",
		`The agent wants to run:\n${command}\n\nAllow this one command?`,
	);
	return approved ? { allow: true } : { allow: false, reason: `Plan mode: command blocked by user.\nCommand: ${command}` };
}
